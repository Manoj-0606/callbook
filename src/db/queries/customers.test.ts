import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { zonedDateTime } from "../../lib/dates";
import { phoneDigits } from "../../lib/phone";
import { createDatabase, type Database } from "../client";
import { runMigrations } from "../migrate";
import { customers, jobs } from "../schema";
import { seedDatabase } from "../seed";
import { findCustomerByPhone, loadCustomerTitle, loadCustomerView } from "./customers";

const NOW = zonedDateTime("2026-09-29", "09:00", "America/Chicago");
let db: Database;

beforeEach(async () => {
  db = createDatabase({ url: ":memory:" });
  await runMigrations(db);
  await seedDatabase(db, NOW);
});

afterEach(() => {
  db.$client.close();
});

describe("findCustomerByPhone", () => {
  it.each(["(512) 555-0112", "512-555-0112", "512.555.0112", "+1 512 555 0112", "5125550112"])(
    "finds Sunrise Diner from %j",
    async (typed) => {
      const match = await findCustomerByPhone(db, phoneDigits(typed)!);
      expect(match).toMatchObject({ businessName: "Sunrise Diner", name: "Earl Whitaker", pastJobs: 3 });
      expect(match?.openJobs).toEqual([
        { id: expect.any(Number), description: "Ice machine making soft, cloudy ice: repair or replace?", status: "needs_quote" },
      ]);
    },
  );

  it("counts past jobs whether they were done or didn't go ahead", async () => {
    // Lakeview Inn: one quote that didn't go ahead, nothing open.
    expect(await findCustomerByPhone(db, "5125550172")).toMatchObject({ pastJobs: 1, openJobs: [] });
  });

  it("finds nothing for a number that isn't a customer", async () => {
    expect(await findCustomerByPhone(db, "5125550999")).toBeNull();
  });

  it("finds a customer with no jobs yet", async () => {
    await db.insert(customers).values({ businessName: "Brand New Bakery", phone: "555-0177", phoneDigits: "5550177" });
    expect(await findCustomerByPhone(db, "5550177")).toMatchObject({ businessName: "Brand New Bakery", pastJobs: 0, openJobs: [] });
  });

  it("uses the oldest record when two share a number", async () => {
    await db.insert(customers).values({ businessName: "Sunrise Diner (duplicate)", phoneDigits: "5125550112" });
    expect((await findCustomerByPhone(db, "5125550112"))?.businessName).toBe("Sunrise Diner");
  });
});

describe("loadCustomerView", () => {
  const sunriseId = async () => (await findCustomerByPhone(db, "5125550112"))!.id;

  it("returns nothing for a customer that doesn't exist", async () => {
    expect(await loadCustomerView(db, 99999, NOW)).toBeNull();
    expect(await loadCustomerTitle(db, 99999)).toBeNull();
  });

  it("shows the customer's details and their jobs, split into open and previous", async () => {
    const view = (await loadCustomerView(db, await sunriseId(), NOW))!;
    expect(view).toMatchObject({
      name: "Sunrise Diner",
      contactName: "Earl Whitaker",
      phone: { label: "(512) 555-0112", href: "tel:+15125550112" },
      address: "7800 N Lamar Blvd",
      notes: "Long-time customer. Earl prefers calls before 10 am or after 2 pm.",
      summary: "1 open job · 3 previous jobs",
    });
    expect(view.openJobs.map((j) => j.problem)).toEqual(["Ice machine making soft, cloudy ice: repair or replace?"]);
    expect(view.previousJobs.map((j) => j.problem)).toEqual([
      "Reach-in freezer stopped overnight",
      "Ice machine descaled and sanitized",
      "Walk-in cooler thermostat replaced",
    ]);
    expect(await loadCustomerTitle(db, await sunriseId())).toBe("Sunrise Diner");
  });

  it("links every job to its own page, and only this customer's jobs", async () => {
    const id = await sunriseId();
    const view = (await loadCustomerView(db, id, NOW))!;
    const ownJobs = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.customerId, id));
    const rows = [...view.openJobs, ...view.previousJobs];
    expect(rows.map((r) => r.jobId).sort()).toEqual(ownJobs.map((j) => j.id).sort());
    for (const row of rows) expect(row.href).toBe(`/jobs/${row.jobId}`);
  });

  it("brings every job's history together, newest first", async () => {
    const view = (await loadCustomerView(db, await sunriseId(), NOW))!;
    // 2 activities on the open job, 3 on each of the three past jobs.
    expect(view.timeline).toHaveLength(11);
    expect(view.timeline.slice(0, 3).map((e) => [e.title, e.job.label])).toEqual([
      ["Called · Talked to customer", "Ice machine making soft, cloudy ice: repair or replace?"],
      ["Request received · Repeat customer", "Ice machine making soft, cloudy ice: repair or replace?"],
      ["Status changed · Done", "Reach-in freezer stopped overnight"],
    ]);
    expect(view.timeline.at(-1)).toMatchObject({
      title: "Request received · Phone call",
      job: { label: "Walk-in cooler thermostat replaced" },
    });
    for (const entry of view.timeline) expect(entry.job.href).toBe(`/jobs/${entry.job.jobId}`);
  });

  it("a customer whose only job didn't go ahead", async () => {
    const view = (await loadCustomerView(db, (await findCustomerByPhone(db, "5125550172"))!.id, NOW))!;
    expect(view.summary).toBe("0 open jobs · 1 previous job");
    expect(view.previousJobs[0].details).toMatch(/^Didn't go ahead .+ · Too expensive$/);
    expect(view.timeline[0].details).toEqual(['Moved to "Didn\'t go ahead"', "Too expensive"]);
  });

  it("a customer with no jobs yet", async () => {
    const [created] = await db
      .insert(customers)
      .values({ businessName: "Quiet Corner Cafe", phone: "555-0166", phoneDigits: "5550166" })
      .returning({ id: customers.id });
    expect(await loadCustomerView(db, created.id, NOW)).toMatchObject({
      name: "Quiet Corner Cafe",
      summary: "0 open jobs · 0 previous jobs",
      openJobs: [],
      previousJobs: [],
      timeline: [],
    });
  });
});
