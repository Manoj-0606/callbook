import { count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { activities, customers, db, jobs } from "@/db";
import { runMigrations } from "@/db/migrate";
import { loadTodayView } from "@/db/queries/today";
import { resetDatabase } from "@/db/seed";
import { IDLE, type ActionState } from "@/lib/action-state";
import { zonedDateTime } from "@/lib/dates";
import { HONEYPOT_FIELD, PUBLIC_THANK_YOU } from "@/lib/public-request";
import { loadJobsWithTimeline, replayTimeline, storedState } from "@/test/timeline";
import { submitServiceRequestAction } from "./public-request-actions";

vi.mock("@/db", async () => {
  const { createDatabase } = await import("@/db/client");
  const schema = await import("@/db/schema");
  return { ...schema, db: createDatabase({ url: ":memory:" }) };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const TZ = "America/Chicago";
const NOW = zonedDateTime("2026-09-29", "09:00", TZ); // Tuesday morning
const THANKS: ActionState = { status: "success", message: PUBLIC_THANK_YOU };

beforeAll(async () => {
  await runMigrations(db);
});

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  await resetDatabase(db, NOW);
  vi.mocked(revalidatePath).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const stranger = {
  name: "Ana Ruiz",
  businessName: "Frost & Co. Deli",
  phone: "512 555 0199",
  email: "ana@frostdeli.example",
  address: "12 Elm St",
  description: "Deli case warm since lunch",
};
// Sunrise Diner's number, typed the way a customer might.
const sunriseCaller = { ...stranger, name: "Earl", businessName: "", phone: "512.555.0112", description: "Walk-in door won't latch" };

const totals = async () => ({
  customers: (await db.select({ n: count() }).from(customers))[0].n,
  jobs: (await db.select({ n: count() }).from(jobs))[0].n,
  activities: (await db.select({ n: count() }).from(activities))[0].n,
});

async function newestJob() {
  const [job] = await db.select().from(jobs).orderBy(jobs.id).then((rows) => rows.slice(-1));
  const [customer] = await db.select().from(customers).where(eq(customers.id, job.customerId));
  const timeline = await db.select().from(activities).where(eq(activities.jobId, job.id));
  return { job, customer, timeline };
}

describe("a new customer requests service", () => {
  it("creates the customer, a website job and the request activity; shows only the thank-you", async () => {
    const before = await totals();

    const state = await submitServiceRequestAction(IDLE, form({ ...stranger, isEmergency: "yes" }));

    expect(state).toEqual(THANKS);
    expect(await totals()).toEqual({
      customers: before.customers + 1,
      jobs: before.jobs + 1,
      activities: before.activities + 1,
    });

    const { job, customer, timeline } = await newestJob();
    expect(customer).toMatchObject({
      name: "Ana Ruiz",
      businessName: "Frost & Co. Deli",
      phone: "(512) 555-0199",
      phoneDigits: "5125550199",
      email: "ana@frostdeli.example",
      address: "12 Elm St",
    });
    expect(job).toMatchObject({
      description: "Deli case warm since lunch",
      source: "website",
      status: "new",
      isEmergency: true,
      followUpOn: null,
      lastContactAt: null,
    });
    expect(timeline).toEqual([
      expect.objectContaining({ type: "request_received", meta: { source: "website" }, note: null }),
    ]);
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("appears on Denise's Today under 'New — nobody's called back yet', as a website request", async () => {
    await submitServiceRequestAction(IDLE, form(stranger));

    const today = await loadTodayView(db, NOW, TZ);
    const newSection = today.sections.find((s) => s.category === "new")!;
    expect(newSection.cards.map((c) => c.name)).toContain("Frost & Co. Deli");
    expect(newSection.cards.find((c) => c.name === "Frost & Co. Deli")?.reason).toBe("Came in just now · Website form");
    expect(today.peopleLabel).toBe("11 people to call");
    expect(today.openJobsLabel).toBe("16 open jobs");
  });

  it("an emergency sorts with the emergencies at the top", async () => {
    await submitServiceRequestAction(IDLE, form({ ...stranger, isEmergency: "yes" }));
    const cards = (await loadTodayView(db, NOW, TZ)).sections[0].cards;
    expect(cards.slice(0, 2).map((c) => [c.name, c.isEmergency])).toEqual([
      ["Rosa's Taqueria", true],
      ["Frost & Co. Deli", true],
    ]);
  });

  it("is always a website request, whatever the browser sends", async () => {
    await submitServiceRequestAction(IDLE, form({ ...stranger, source: "referral", referredBy: "Me", callbackOn: "2026-12-01", note: "VIP" }));
    const { job, timeline } = await newestJob();
    expect(job).toMatchObject({ source: "website", referredBy: null, followUpOn: null });
    expect(timeline[0]).toMatchObject({ meta: { source: "website" }, note: null });
  });
});

describe("a repeat customer requests service", () => {
  it("adds the job to their existing record without creating another customer", async () => {
    const before = await totals();

    await submitServiceRequestAction(IDLE, form(sunriseCaller));

    expect(await totals()).toMatchObject({ customers: before.customers, jobs: before.jobs + 1 });
    expect(await db.select().from(customers).where(eq(customers.phoneDigits, "5125550112"))).toHaveLength(1);

    const { job, customer } = await newestJob();
    expect(customer.businessName).toBe("Sunrise Diner");
    expect(job).toMatchObject({ description: "Walk-in door won't latch", source: "website" });
  });

  it("gives exactly the same response as for a stranger: nothing about the match leaks", async () => {
    const forStranger = await submitServiceRequestAction(IDLE, form(stranger));
    const forRepeat = await submitServiceRequestAction(IDLE, form(sunriseCaller));

    expect(forRepeat).toEqual(forStranger);
    expect(forRepeat).toEqual(THANKS);
    const said = JSON.stringify(forRepeat);
    for (const secret of ["Sunrise", "Earl Whitaker", "Ice machine", "past job", "open job", "/jobs/", "/customers/"]) {
      expect(said).not.toContain(secret);
    }
  });

  it("never changes their record, not even to fill a blank; what was typed goes on the request for Denise", async () => {
    const [before] = await db.select().from(customers).where(eq(customers.phoneDigits, "5125550112"));
    expect(before.email).toBeNull(); // a blank a stranger could otherwise fill

    await submitServiceRequestAction(
      IDLE,
      form({ ...sunriseCaller, name: "Somebody Else", businessName: "Not Sunrise", email: "stranger@example.com", address: "1 Fake St" }),
    );

    const [after] = await db.select().from(customers).where(eq(customers.phoneDigits, "5125550112"));
    expect(after).toEqual(before);
    const { timeline } = await newestJob();
    expect(timeline[0].note).toBe(
      "Details given on the form: Name: Somebody Else · Business: Not Sunrise · Email: stranger@example.com · Address: 1 Fake St",
    );
  });
});

describe("spam and bad input", () => {
  it("a filled-in honeypot looks like success to the bot but saves nothing", async () => {
    const before = await totals();
    const state = await submitServiceRequestAction(IDLE, form({ ...stranger, [HONEYPOT_FIELD]: "http://cheap-pills.example" }));

    expect(state).toEqual(THANKS);
    expect(await totals()).toEqual(before);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("missing required fields: nothing saved, and the errors are worded for the customer", async () => {
    const before = await totals();
    const state = await submitServiceRequestAction(IDLE, form({ email: "ana@frostdeli.example" }));

    expect(state).toEqual({
      status: "error",
      message: null,
      fieldErrors: {
        name: "Please enter your name or your business name.",
        phone: "Please enter a phone number so we can call you back.",
        description: "Please tell us what's wrong.",
      },
    });
    expect(await totals()).toEqual(before);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("over-long fields are refused on the server, whatever the browser allowed", async () => {
    const before = await totals();
    const state = await submitServiceRequestAction(IDLE, form({ ...stranger, description: "x".repeat(5000), address: "y".repeat(5000) }));
    expect(state).toMatchObject({
      status: "error",
      fieldErrors: { description: "Please keep this under 500 characters.", address: "Please keep this under 200 characters." },
    });
    expect(await totals()).toEqual(before);
  });
});

describe("all or nothing", () => {
  it("if saving fails part-way, no customer or job is left behind", async () => {
    const before = await totals();
    const realTransaction = db.transaction.bind(db);
    // Let the customer and job rows be written, then fail on the activity.
    vi.spyOn(db, "transaction").mockImplementationOnce(((run: (tx: typeof db) => Promise<unknown>) =>
      realTransaction(async (tx) => {
        let inserts = 0;
        const insert = tx.insert.bind(tx);
        tx.insert = ((table: Parameters<typeof insert>[0]) => {
          if (++inserts === 3) throw new Error("disk I/O error");
          return insert(table);
        }) as typeof tx.insert;
        return run(tx as unknown as typeof db);
      })) as unknown as typeof db.transaction);
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});

    const state = await submitServiceRequestAction(IDLE, form(stranger));

    expect(state).toEqual({
      status: "error",
      message: "Sorry, your request didn't go through. Please try again, or call us at (512) 555-0100.",
      fieldErrors: {},
    });
    expect(await totals()).toEqual(before);
    expect(await db.select().from(customers).where(eq(customers.phoneDigits, "5125550199"))).toEqual([]);
    expect(revalidatePath).not.toHaveBeenCalled();
    quiet.mockRestore();
  });
});

describe("timelines stay consistent", () => {
  it("every job's stored state still matches replaying its timeline", async () => {
    await submitServiceRequestAction(IDLE, form({ ...stranger, isEmergency: "yes" }));
    await submitServiceRequestAction(IDLE, form(sunriseCaller));
    for (const row of await loadJobsWithTimeline(db)) {
      expect({ job: row.id, ...replayTimeline(row, TZ) }).toEqual({ job: row.id, ...storedState(row) });
    }
  });
});
