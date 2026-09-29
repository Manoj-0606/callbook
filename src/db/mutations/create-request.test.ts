import { count, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { zonedDateTime } from "../../lib/dates";
import type { JobSource } from "../../lib/domain";
import type { NewRequestInput } from "../../lib/new-request";
import { createDatabase, type Database } from "../client";
import { runMigrations } from "../migrate";
import { activities, customers, jobs } from "../schema";
import { seedDatabase } from "../seed";
import { createRequest } from "./create-request";

const TZ = "America/Chicago";
const NOW = zonedDateTime("2026-09-29", "09:00", TZ);
let db: Database;

beforeEach(async () => {
  db = createDatabase({ url: ":memory:" });
  await runMigrations(db);
  await seedDatabase(db, NOW);
});

afterEach(() => {
  db.$client.close();
});

const input = (overrides: Partial<NewRequestInput> = {}): NewRequestInput => ({
  businessName: "Frost & Co. Deli",
  name: "Ana Ruiz",
  phone: "(512) 555-0199",
  phoneDigits: "5125550199",
  description: "Deli case warm since lunch",
  source: "phone",
  referredBy: null,
  isEmergency: false,
  email: null,
  address: null,
  note: null,
  callbackOn: null,
  ...overrides,
});

const counts = async () => ({
  customers: (await db.select({ n: count() }).from(customers))[0].n,
  jobs: (await db.select({ n: count() }).from(jobs))[0].n,
  activities: (await db.select({ n: count() }).from(activities))[0].n,
});

const sunriseId = async () =>
  (await db.select({ id: customers.id }).from(customers).where(eq(customers.businessName, "Sunrise Diner")))[0].id;

describe("createRequest: a new customer", () => {
  it("creates the customer, the job and the request activity", async () => {
    const before = await counts();
    const result = await createRequest(db, input({ email: "ana@frostdeli.example", note: "Meats inside." }), NOW, TZ);

    expect(await counts()).toEqual({
      customers: before.customers + 1,
      jobs: before.jobs + 1,
      activities: before.activities + 1,
    });
    expect(result).toMatchObject({ isRepeatCustomer: false, displayName: "Frost & Co. Deli", summary: "Added to today's list" });

    const [customer] = await db.select().from(customers).where(eq(customers.id, result.customerId));
    expect(customer).toMatchObject({
      businessName: "Frost & Co. Deli",
      name: "Ana Ruiz",
      phone: "(512) 555-0199",
      phoneDigits: "5125550199",
      email: "ana@frostdeli.example",
      createdAt: NOW,
    });

    const [job] = await db.select().from(jobs).where(eq(jobs.id, result.jobId));
    expect(job).toMatchObject({
      customerId: result.customerId,
      status: "new",
      source: "phone",
      isEmergency: false,
      followUpOn: null,
      lastContactAt: null,
      receivedAt: NOW,
    });

    const timeline = await db.select().from(activities).where(eq(activities.jobId, result.jobId));
    expect(timeline).toEqual([
      expect.objectContaining({ type: "request_received", note: "Meats inside.", meta: { source: "phone" }, createdAt: NOW }),
    ]);
  });

  it("stores a first callback on the job and on the request activity", async () => {
    const result = await createRequest(db, input({ callbackOn: "2026-10-05" }), NOW, TZ);
    const [job] = await db.select().from(jobs).where(eq(jobs.id, result.jobId));
    const [activity] = await db.select().from(activities).where(eq(activities.jobId, result.jobId));

    expect(job.followUpOn).toBe("2026-10-05");
    expect(job.lastContactAt).toBeNull(); // setting a callback isn't contact
    expect(activity.meta).toEqual({ source: "phone", date: "2026-10-05" });
    expect(result.summary).toBe("Added · on your list Monday");
  });

  it("a second request from the same new number joins the first customer", async () => {
    const first = await createRequest(db, input(), NOW, TZ);
    const second = await createRequest(db, input({ phone: "512.555.0199", description: "Ice machine too" }), NOW, TZ);

    expect(second.isRepeatCustomer).toBe(true);
    expect(second.customerId).toBe(first.customerId);
    expect(await db.select().from(customers).where(eq(customers.phoneDigits, "5125550199"))).toHaveLength(1);
  });
});

describe("createRequest: a repeat customer", () => {
  it("adds the job to the existing customer without creating another", async () => {
    const before = await counts();
    const result = await createRequest(
      db,
      input({ businessName: "Sunrise Diner", name: "Earl", phone: "512-555-0112", phoneDigits: "5125550112" }),
      NOW,
      TZ,
    );

    expect(result).toMatchObject({ isRepeatCustomer: true, customerId: await sunriseId(), displayName: "Sunrise Diner" });
    expect(await counts()).toEqual({ customers: before.customers, jobs: before.jobs + 1, activities: before.activities + 1 });
    expect(await db.select().from(jobs).where(eq(jobs.customerId, result.customerId))).toHaveLength(5);
  });

  it("fills in details the record was missing, and overwrites nothing", async () => {
    await createRequest(
      db,
      input({
        businessName: "Sunrise Cafe",
        name: "E. Whitaker",
        phone: "5125550112",
        phoneDigits: "5125550112",
        email: "earl@sunrise.example",
        address: "Somewhere else",
      }),
      NOW,
      TZ,
    );

    const [sunrise] = await db.select().from(customers).where(eq(customers.id, await sunriseId()));
    expect(sunrise).toMatchObject({
      businessName: "Sunrise Diner",
      name: "Earl Whitaker",
      address: "7800 N Lamar Blvd",
      email: "earl@sunrise.example",
      phone: "(512) 555-0112",
    });
  });
});

describe("createRequest: all or nothing", () => {
  it("creates no customer if the job can't be saved", async () => {
    const before = await counts();
    // A source the database rejects, after the customer row was inserted.
    const broken = input({ source: "carrier_pigeon" as JobSource });

    const error = await createRequest(db, broken, NOW, TZ).catch((e: Error) => e);

    expect(error).toBeInstanceOf(Error);
    expect(String((error as Error & { cause?: Error }).cause?.message)).toMatch(/CHECK constraint failed/);
    expect(await counts()).toEqual(before);
    expect(await db.select().from(customers).where(eq(customers.phoneDigits, "5125550199"))).toEqual([]);
  });

  it("leaves an existing customer untouched if the job can't be saved", async () => {
    const broken = input({
      phone: "5125550112",
      phoneDigits: "5125550112",
      email: "earl@sunrise.example",
      source: "carrier_pigeon" as JobSource,
    });

    await createRequest(db, broken, NOW, TZ).catch(() => null);

    const [sunrise] = await db.select().from(customers).where(eq(customers.id, await sunriseId()));
    expect(sunrise.email).toBeNull();
  });
});
