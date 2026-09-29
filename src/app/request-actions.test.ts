import { count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { runMigrations } from "@/db/migrate";
import { loadTodayView } from "@/db/queries/today";
import { activities, customers, jobs } from "@/db/schema";
import { resetDatabase } from "@/db/seed";
import { IDLE } from "@/lib/action-state";
import { zonedDateTime } from "@/lib/dates";
import type { TodayView } from "@/lib/today-view";
import { loadJobsWithTimeline, replayTimeline, storedState } from "@/test/timeline";
import { logCallAction } from "./job-actions";
import { createRequestAction, lookupCustomerAction } from "./request-actions";

vi.mock("@/db", async () => {
  const { createDatabase } = await import("@/db/client");
  const schema = await import("@/db/schema");
  return { ...schema, db: createDatabase({ url: ":memory:" }) };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// Signed in to Callbook.
vi.mock("next/headers", async () => (await import("@/test/session")).mockedHeaders());

const TZ = "America/Chicago";
const at = (date: string, time: string) => zonedDateTime(date, time, TZ);
const NOW = at("2026-09-29", "09:00"); // Tuesday morning

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
});

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const newCustomer = {
  phone: "512 555 0199",
  businessName: "Frost & Co. Deli",
  name: "Ana Ruiz",
  description: "Deli case warm since lunch",
  source: "phone",
};

async function today(): Promise<TodayView> {
  const view = await loadTodayView(db, new Date(), TZ);
  const ids = view.sections.flatMap((s) => s.cards.map((c) => c.jobId));
  expect(new Set(ids).size).toBe(ids.length); // one section per job
  return view;
}

const newSection = (view: TodayView) => view.sections.find((s) => s.category === "new")?.cards.map((c) => c.name) ?? [];
const cardsNamed = (view: TodayView, name: string) => view.sections.flatMap((s) => s.cards).filter((c) => c.name === name);
const total = async (table: typeof customers | typeof jobs | typeof activities) => (await db.select({ n: count() }).from(table))[0].n;

describe("lookupCustomerAction: as Denise types the phone number", () => {
  it.each(["(512) 555-0112", "512-555-0112", "512.555.0112", "+1 512 555 0112"])("recognises Sunrise Diner from %j", async (typed) => {
    expect(await lookupCustomerAction(typed)).toEqual({
      customerId: expect.any(Number),
      title: "Repeat customer: Sunrise Diner — 3 past jobs",
      warning: "This customer already has an open job.",
      openJobs: [
        {
          label: "Ice machine making soft, cloudy ice: repair or replace? (Needs a quote)",
          href: expect.stringMatching(/^\/jobs\/\d+$/),
        },
      ],
      customerHref: expect.stringMatching(/^\/customers\/\d+$/),
      prefill: { businessName: "Sunrise Diner", name: "Earl Whitaker" },
    });
  });

  it("no warning for a returning customer with nothing open", async () => {
    expect(await lookupCustomerAction("(512) 555-0172")).toMatchObject({
      title: "Repeat customer: Lakeview Inn — 1 past job",
      warning: null,
    });
  });

  it.each([["(512) 555-0999"], ["555"], [""], ["not a number"]])("finds nothing for %j", async (typed) => {
    expect(await lookupCustomerAction(typed)).toBeNull();
  });

  it("only reads", async () => {
    const before = [await total(customers), await total(jobs), await total(activities)];
    await lookupCustomerAction("(512) 555-0112");
    expect([await total(customers), await total(jobs), await total(activities)]).toEqual(before);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("New request → Today", () => {
  it("a new customer appears under 'New — nobody's called back yet', and the counts go up", async () => {
    const before = await today();
    expect(before.peopleLabel).toBe("10 people to call");
    expect(before.openJobsLabel).toBe("15 open jobs");

    const state = await createRequestAction(IDLE, form(newCustomer));

    expect(state).toEqual({ status: "success", message: "Frost & Co. Deli: Added to today's list" });
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");

    const after = await today();
    expect(newSection(after)).toEqual(["Rosa's Taqueria", "Bluebonnet Florist", "Frost & Co. Deli"]);
    expect(after.peopleLabel).toBe("11 people to call");
    expect(after.openJobsLabel).toBe("16 open jobs");
    expect(cardsNamed(after, "Frost & Co. Deli")[0]).toMatchObject({
      contactName: "Ana Ruiz",
      contact: { kind: "phone", label: "(512) 555-0199", href: "tel:+15125550199" },
      problem: "Deli case warm since lunch",
      reason: "Came in just now · Phone call",
      hint: null,
    });
  });

  it("persists: a fresh read of the database still has it", async () => {
    await createRequestAction(IDLE, form(newCustomer));
    const [customer] = await db.select().from(customers).where(eq(customers.phoneDigits, "5125550199"));
    const saved = await db.select().from(jobs).where(eq(jobs.customerId, customer.id));
    expect(saved).toEqual([expect.objectContaining({ status: "new", description: "Deli case warm since lunch" })]);
  });

  it("an emergency goes to the top with the other emergencies", async () => {
    await createRequestAction(IDLE, form({ ...newCustomer, isEmergency: "yes" }));
    // Rosa's emergency came in earlier, so she stays first; the new one is next, ahead of non-emergencies.
    expect(newSection(await today())).toEqual(["Rosa's Taqueria", "Frost & Co. Deli", "Bluebonnet Florist"]);
  });

  it("a repeat customer gets a new job on the same record, with no duplicate customer", async () => {
    const customersBefore = await total(customers);

    const state = await createRequestAction(
      IDLE,
      form({ phone: "512.555.0112", businessName: "Sunrise Diner", name: "", description: "Walk-in door won't latch", source: "repeat" }),
    );

    expect(state).toEqual({ status: "success", message: "Sunrise Diner: Added to today's list" });
    expect(await total(customers)).toBe(customersBefore);

    const view = await today();
    const sunrise = cardsNamed(view, "Sunrise Diner");
    expect(sunrise.map((c) => c.problem)).toEqual([
      "Walk-in door won't latch",
      "Ice machine making soft, cloudy ice: repair or replace?",
    ]);
    expect(sunrise[0].hint).toBe("Repeat customer · 3 past jobs · 1 other open job");
    // Same person, so still 10 people to call, but one more open job.
    expect(view.peopleLabel).toBe("10 people to call");
    expect(view.openJobsLabel).toBe("16 open jobs");
  });

  it("a later first callback keeps it off Today until then, without counting as contact", async () => {
    const state = await createRequestAction(IDLE, form({ ...newCustomer, callbackOn: "2026-10-05" }));

    expect(state).toEqual({ status: "success", message: "Frost & Co. Deli: Added · on your list Monday" });
    const view = await today();
    expect(cardsNamed(view, "Frost & Co. Deli")).toEqual([]);
    expect(view.openJobsLabel).toBe("16 open jobs");

    vi.setSystemTime(at("2026-10-05", "08:00"));
    const monday = await today();
    expect(newSection(monday)).toContain("Frost & Co. Deli");
    expect(cardsNamed(monday, "Frost & Co. Deli")[0].facts).toBeNull(); // still no contact recorded
  });

  it("a callback for today still shows it today", async () => {
    await createRequestAction(IDLE, form({ ...newCustomer, callbackOn: "2026-09-29" }));
    expect(newSection(await today())).toContain("Frost & Co. Deli");
  });

  it("a referral shows who referred them", async () => {
    await createRequestAction(IDLE, form({ ...newCustomer, source: "referral", referredBy: "Earl at Sunrise Diner" }));
    expect(cardsNamed(await today(), "Frost & Co. Deli")[0].reason).toBe(
      "Came in just now · Referred by Earl at Sunrise Diner",
    );
  });

  it("notes go on the request in the timeline", async () => {
    await createRequestAction(IDLE, form({ ...newCustomer, note: "Voicemail: case at 50°F." }));
    const [customer] = await db.select().from(customers).where(eq(customers.phoneDigits, "5125550199"));
    const [job] = await db.select().from(jobs).where(eq(jobs.customerId, customer.id));
    expect(await db.select().from(activities).where(eq(activities.jobId, job.id))).toEqual([
      expect.objectContaining({ type: "request_received", note: "Voicemail: case at 50°F.", meta: { source: "phone" } }),
    ]);
  });

  it("the new job then works with the Today actions", async () => {
    await createRequestAction(IDLE, form(newCustomer));
    const card = cardsNamed(await today(), "Frost & Co. Deli")[0];

    await logCallAction(IDLE, form({ jobId: String(card.jobId), outcome: "talked", nextStep: "needs_quote" }));

    const view = await today();
    expect(view.sections.find((s) => s.category === "needs_quote")?.cards.map((c) => c.name)).toContain("Frost & Co. Deli");
  });
});

describe("validation: nothing is saved and Today isn't refreshed", () => {
  it("shows every missing required field", async () => {
    const before = await total(jobs);
    const state = await createRequestAction(IDLE, form({ source: "phone" }));

    expect(state).toEqual({
      status: "error",
      message: null,
      fieldErrors: {
        phone: "Enter a phone number.",
        businessName: "Enter the business or the person's name.",
        description: "Say what's wrong.",
      },
    });
    expect(await total(jobs)).toBe(before);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it.each([
    ["a bad email", { email: "ana at deli" }, { email: "Check the email address." }],
    ["a callback in the past", { callbackOn: "2026-09-25" }, { callbackOn: "That date has already passed." }],
    ["a phone number with too few digits", { phone: "555-01" }, { phone: "That doesn't look like a phone number." }],
  ])("%s", async (_label, fields, fieldErrors) => {
    const before = await total(customers);
    const state = await createRequestAction(IDLE, form({ ...newCustomer, ...fields }));
    expect(state).toMatchObject({ status: "error", fieldErrors });
    expect(await total(customers)).toBe(before);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("a database failure reports that nothing was saved", async () => {
    const before = [await total(customers), await total(jobs)];
    vi.spyOn(db, "transaction").mockRejectedValueOnce(new Error("disk I/O error"));
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});

    const state = await createRequestAction(IDLE, form(newCustomer));

    expect(state).toEqual({ status: "error", message: "That didn't save. Nothing was changed. Try again.", fieldErrors: {} });
    expect([await total(customers), await total(jobs)]).toEqual(before);
    expect(revalidatePath).not.toHaveBeenCalled();
    quiet.mockRestore();
  });
});

describe("timeline replay after new requests", () => {
  it("every job's stored state still matches replaying its timeline", async () => {
    await createRequestAction(IDLE, form(newCustomer));
    await createRequestAction(IDLE, form({ ...newCustomer, phone: "(512) 555-0198", businessName: "Pier 9 Oyster Bar", callbackOn: "2026-10-01" }));
    await createRequestAction(IDLE, form({ phone: "5125550112", businessName: "Sunrise Diner", description: "Door latch", source: "repeat", isEmergency: "yes" }));

    for (const row of await loadJobsWithTimeline(db)) {
      expect({ job: row.id, ...replayTimeline(row, TZ) }).toEqual({ job: row.id, ...storedState(row) });
    }
  });
});
