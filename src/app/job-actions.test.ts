import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { runMigrations } from "@/db/migrate";
import { loadTodayView } from "@/db/queries/today";
import { activities, customers, jobs, technicians } from "@/db/schema";
import { resetDatabase } from "@/db/seed";
import type { ActionState } from "@/lib/action-state";
import { IDLE } from "@/lib/action-state";
import { zonedDateTime } from "@/lib/dates";
import { OPEN_STATUSES } from "@/lib/domain";
import type { TodayView } from "@/lib/today-view";
import { loadJobsWithTimeline, replayTimeline, storedState } from "@/test/timeline";
import {
  addNoteAction,
  logCallAction,
  markDoneAction,
  markLostAction,
  markQuoteSentAction,
  scheduleAction,
  setCallbackAction,
} from "./job-actions";

// The Server Actions run against an in-memory copy of the demo, with Next's cache stubbed.
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

// ── Helpers ──────────────────────────────────────────────────────────────────

async function openJob(businessName: string) {
  const [row] = await db
    .select({ job: jobs })
    .from(jobs)
    .innerJoin(customers, eq(customers.id, jobs.customerId))
    .where(and(eq(customers.businessName, businessName), inArray(jobs.status, [...OPEN_STATUSES])));
  if (!row) throw new Error(`No open job for ${businessName}`);
  return row.job;
}

async function reload(jobId: number) {
  const [row] = await db.select().from(jobs).where(eq(jobs.id, jobId));
  return row;
}

async function timelineOf(jobId: number) {
  return db.select().from(activities).where(eq(activities.jobId, jobId)).orderBy(activities.createdAt, activities.id);
}

async function technicianId(name: string) {
  const [row] = await db.select().from(technicians).where(eq(technicians.name, name));
  return row.id;
}

function form(fields: Record<string, string | number>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, String(value));
  return data;
}

async function today(): Promise<TodayView> {
  const view = await loadTodayView(db, new Date(), TZ);
  // One job must never appear in two sections.
  const ids = view.sections.flatMap((s) => s.cards.map((c) => c.jobId));
  expect(new Set(ids).size).toBe(ids.length);
  return view;
}

function sectionOf(view: TodayView, name: string): string | null {
  return view.sections.find((s) => s.cards.some((c) => c.name === name))?.category ?? null;
}

function cardOf(view: TodayView, name: string) {
  return view.sections.flatMap((s) => s.cards).find((c) => c.name === name);
}

function expectSuccess(state: ActionState, message: string) {
  expect(state).toEqual({ status: "success", message });
  expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
}

function expectRejected(state: ActionState) {
  expect(state.status).toBe("error");
  expect(revalidatePath).not.toHaveBeenCalled();
}

// ── The full flow: Today → action → database → activity → Today again ───────

describe("Today → action → Today", () => {
  it("log call, they said yes: 'Hasn't heard from us' → 'Said yes — needs scheduling'", async () => {
    const job = await openJob("Smoke & Timber BBQ");
    expect(sectionOf(await today(), "Smoke & Timber BBQ")).toBe("gone_quiet");

    const state = await logCallAction(
      IDLE,
      form({ jobId: job.id, outcome: "talked", nextStep: "ready_to_schedule", note: "Dale says go ahead." }),
    );

    expectSuccess(state, 'Call logged · now "Said yes — needs scheduling"');
    expect(await reload(job.id)).toMatchObject({ status: "ready_to_schedule", lastContactAt: NOW, followUpOn: null });
    expect((await timelineOf(job.id)).at(-1)).toMatchObject({
      type: "call_talked",
      note: "Dale says go ahead.",
      meta: { fromStatus: "quote_sent", toStatus: "ready_to_schedule" },
      createdAt: NOW,
    });
    const view = await today();
    expect(sectionOf(view, "Smoke & Timber BBQ")).toBe("ready_to_schedule");
    expect(cardOf(view, "Smoke & Timber BBQ")?.reason).toBe("Said yes just now");
  });

  it("mark quote sent: 'Waiting on a quote from us' → off Today", async () => {
    const job = await openJob("Harbor Lane Grocery");
    expect(sectionOf(await today(), "Harbor Lane Grocery")).toBe("needs_quote");

    const state = await markQuoteSentAction(IDLE, form({ jobId: job.id, amount: "$1,240", note: "" }));

    expectSuccess(state, "Quote $1,240 recorded");
    expect(await reload(job.id)).toMatchObject({
      status: "quote_sent",
      quoteAmountCents: 124000,
      quoteSentAt: NOW,
      lastContactAt: NOW,
    });
    expect((await timelineOf(job.id)).at(-1)).toMatchObject({
      type: "quote_sent",
      note: null,
      meta: { fromStatus: "needs_quote", toStatus: "quote_sent", quoteAmountCents: 124000 },
    });
    const view = await today();
    expect(sectionOf(view, "Harbor Lane Grocery")).toBeNull();
    expect(view.sections.find((s) => s.category === "needs_quote")?.cards).toHaveLength(2);
  });

  it("schedule a future visit: 'Said yes' → off Today, with technician id and name recorded", async () => {
    const job = await openJob("Tall Pines Brewing");
    const carlos = await technicianId("Carlos Rivera");

    const state = await scheduleAction(IDLE, form({ jobId: job.id, technicianId: carlos, visitOn: "2026-10-01" }));

    expectSuccess(state, "Scheduled with Carlos for Thursday");
    expect(await reload(job.id)).toMatchObject({
      status: "scheduled",
      technicianId: carlos,
      scheduledFor: "2026-10-01",
      lastContactAt: NOW,
    });
    expect((await timelineOf(job.id)).at(-1)).toMatchObject({
      type: "scheduled",
      meta: {
        fromStatus: "ready_to_schedule",
        toStatus: "scheduled",
        technicianId: carlos,
        technicianName: "Carlos Rivera",
        date: "2026-10-01",
      },
    });
    expect(sectionOf(await today(), "Tall Pines Brewing")).toBeNull();

    // The visit rule takes over: nothing until the day after the visit.
    vi.setSystemTime(at("2026-10-02", "09:00"));
    expect(sectionOf(await today(), "Tall Pines Brewing")).toBe("check_visit");
  });

  it("set a callback: overdue callback → hidden until Monday", async () => {
    const job = await openJob("Casa Verde Cantina");
    expect(sectionOf(await today(), "Casa Verde Cantina")).toBe("callback_due");

    const state = await setCallbackAction(IDLE, form({ jobId: job.id, callbackOn: "2026-10-05", note: "After the rush." }));

    expectSuccess(state, "Callback set for Monday");
    const after = await reload(job.id);
    expect(after.followUpOn).toBe("2026-10-05");
    expect(after.lastContactAt).toEqual(job.lastContactAt); // a callback date isn't contact
    expect((await timelineOf(job.id)).at(-1)).toMatchObject({ type: "follow_up_set", meta: { date: "2026-10-05" } });
    expect(sectionOf(await today(), "Casa Verde Cantina")).toBeNull();

    vi.setSystemTime(at("2026-10-05", "08:00"));
    expect(sectionOf(await today(), "Casa Verde Cantina")).toBe("callback_due");
  });

  it("mark done: 'Check on visits' → gone, closed, callback cleared", async () => {
    const job = await openJob("Scoops & Co. Ice Cream");
    expect(sectionOf(await today(), "Scoops & Co. Ice Cream")).toBe("check_visit");

    const state = await markDoneAction(IDLE, form({ jobId: job.id, note: "Dave swapped the fan motor." }));

    expectSuccess(state, "Marked done");
    expect(await reload(job.id)).toMatchObject({ status: "done", closedAt: NOW, followUpOn: null });
    expect((await timelineOf(job.id)).at(-1)).toMatchObject({
      type: "status_change",
      note: "Dave swapped the fan motor.",
      meta: { fromStatus: "scheduled", toStatus: "done" },
    });
    const view = await today();
    expect(sectionOf(view, "Scoops & Co. Ice Cream")).toBeNull();
    expect(view.sections.some((s) => s.category === "check_visit")).toBe(false);
    expect(view.openJobsLabel).toBe("14 open jobs");
  });

  it("didn't go ahead: 'New' → gone, with the reason recorded", async () => {
    const job = await openJob("Bluebonnet Florist");

    const state = await markLostAction(IDLE, form({ jobId: job.id, reason: "went_elsewhere", confirmed: "yes" }));

    expectSuccess(state, "Closed · Went with someone else");
    expect(await reload(job.id)).toMatchObject({ status: "lost", lostReason: "went_elsewhere", closedAt: NOW, followUpOn: null });
    expect((await timelineOf(job.id)).at(-1)).toMatchObject({
      type: "status_change",
      meta: { fromStatus: "new", toStatus: "lost", lostReason: "went_elsewhere" },
    });
    const view = await today();
    expect(sectionOf(view, "Bluebonnet Florist")).toBeNull();
    expect(view.peopleLabel).toBe("9 people to call");
  });

  it("add a note: stays exactly where it was", async () => {
    const job = await openJob("Rosa's Taqueria");
    const before = await reload(job.id);

    const state = await addNoteAction(IDLE, form({ jobId: job.id, note: "Back door code 2210." }));

    expectSuccess(state, "Note added");
    expect(await reload(job.id)).toEqual(before);
    expect((await timelineOf(job.id)).at(-1)).toMatchObject({ type: "note", note: "Back door code 2210.", meta: null });
    expect(sectionOf(await today(), "Rosa's Taqueria")).toBe("new");
  });

  it("no answer: off Today, back tomorrow, contact clock NOT reset", async () => {
    const job = await openJob("Eastside Market");
    expect(sectionOf(await today(), "Eastside Market")).toBe("callback_due");

    const state = await logCallAction(IDLE, form({ jobId: job.id, outcome: "no_answer" }));

    expectSuccess(state, "No answer logged · back on your list tomorrow");
    const after = await reload(job.id);
    expect(after.lastContactAt).toEqual(job.lastContactAt);
    expect(after.followUpOn).toBe("2026-09-30");
    expect((await timelineOf(job.id)).at(-1)).toMatchObject({ type: "no_answer", meta: null });
    expect(sectionOf(await today(), "Eastside Market")).toBeNull();

    vi.setSystemTime(at("2026-09-30", "09:00"));
    const tomorrow = await today();
    expect(sectionOf(tomorrow, "Eastside Market")).toBe("callback_due");
    expect(cardOf(tomorrow, "Eastside Market")?.facts).toContain("Last contact Thursday");
  });

  it("no answer on an emergency: stays at the top of Today", async () => {
    const job = await openJob("Rosa's Taqueria");

    const state = await logCallAction(IDLE, form({ jobId: job.id, outcome: "no_answer" }));

    expectSuccess(state, "No answer logged · still on today's list");
    expect((await reload(job.id)).followUpOn).toBeNull();
    const view = await today();
    expect(view.sections[0].cards[0]).toMatchObject({ name: "Rosa's Taqueria", isEmergency: true });
  });

  it("voicemail on a new request: still new, but now shows the contact", async () => {
    const job = await openJob("Bluebonnet Florist");

    expectSuccess(await logCallAction(IDLE, form({ jobId: job.id, outcome: "voicemail" })), "Voicemail logged");

    const view = await today();
    expect(sectionOf(view, "Bluebonnet Florist")).toBe("new");
    expect(cardOf(view, "Bluebonnet Florist")?.facts).toBe("Last contact just now");
  });

  it("talking to a new customer who wants a price moves them to 'Waiting on a quote from us'", async () => {
    const job = await openJob("Bluebonnet Florist");

    await logCallAction(IDLE, form({ jobId: job.id, outcome: "talked", nextStep: "needs_quote" }));

    const view = await today();
    expect(sectionOf(view, "Bluebonnet Florist")).toBe("needs_quote");
    expect(cardOf(view, "Bluebonnet Florist")?.reason).toBe("Asked for a quote just now");
  });

  it("a call clears a future callback, bringing a held job back", async () => {
    const job = await openJob("Magnolia Bakehouse");
    expect(sectionOf(await today(), "Magnolia Bakehouse")).toBeNull();

    await logCallAction(IDLE, form({ jobId: job.id, outcome: "talked", note: "Landlord said yes." }));

    expect((await reload(job.id)).followUpOn).toBeNull();
    expect(sectionOf(await today(), "Magnolia Bakehouse")).toBe("needs_quote");
  });
});

// ── Validation: nothing is written and Today isn't refreshed ─────────────────

describe("validation", () => {
  const unchanged = async (jobId: number, before: Awaited<ReturnType<typeof reload>>, activityCount: number) => {
    expect(await reload(jobId)).toEqual(before);
    expect(await timelineOf(jobId)).toHaveLength(activityCount);
  };

  it("talking to a new customer needs a next step", async () => {
    const job = await openJob("Rosa's Taqueria");
    const count = (await timelineOf(job.id)).length;

    const state = await logCallAction(IDLE, form({ jobId: job.id, outcome: "talked" }));

    expectRejected(state);
    expect(state).toEqual({ status: "error", message: null, fieldErrors: { nextStep: "Pick what happens next." } });
    await unchanged(job.id, job, count);
  });

  it.each([
    ["an unreadable amount", { amount: "about three grand" }, { amount: "Enter an amount like 3,850 or 3850.50." }],
    ["no amount", { amount: "" }, { amount: "Enter the quote amount." }],
  ])("quote: %s", async (_label, fields, fieldErrors) => {
    const job = await openJob("Harbor Lane Grocery");
    const count = (await timelineOf(job.id)).length;

    const state = await markQuoteSentAction(IDLE, form({ jobId: job.id, ...fields }));

    expectRejected(state);
    expect(state).toMatchObject({ fieldErrors });
    await unchanged(job.id, job, count);
  });

  it("schedule: a date in the past, and a technician who doesn't exist", async () => {
    const job = await openJob("Tall Pines Brewing");
    const carlos = await technicianId("Carlos Rivera");

    const past = await scheduleAction(IDLE, form({ jobId: job.id, technicianId: carlos, visitOn: "2026-09-25" }));
    expect(past).toMatchObject({ fieldErrors: { visitOn: "That date has already passed." } });

    const nobody = await scheduleAction(IDLE, form({ jobId: job.id, technicianId: 999, visitOn: "2026-10-01" }));
    expect(nobody).toMatchObject({ fieldErrors: { technicianId: "Pick a technician." } });

    expect(revalidatePath).not.toHaveBeenCalled();
    expect(await reload(job.id)).toEqual(job);
  });

  it("schedule: a technician who's no longer active can't be booked", async () => {
    const job = await openJob("Tall Pines Brewing");
    const dave = await technicianId("Dave Lindqvist");
    await db.update(technicians).set({ active: false }).where(eq(technicians.id, dave));

    const state = await scheduleAction(IDLE, form({ jobId: job.id, technicianId: dave, visitOn: "2026-10-01" }));

    expectRejected(state);
    expect(state).toMatchObject({ fieldErrors: { technicianId: "Pick a technician." } });
    expect((await today()).technicians.map((t) => t.name)).not.toContain("Dave Lindqvist");
  });

  it("didn't go ahead: refused without the confirmation step", async () => {
    const job = await openJob("Bluebonnet Florist");

    const state = await markLostAction(IDLE, form({ jobId: job.id, reason: "too_expensive" }));

    expectRejected(state);
    expect(state).toMatchObject({ message: "Confirm that you want to close this job." });
    expect((await reload(job.id)).status).toBe("new");
  });

  it("a job that was already closed (e.g. from another tab)", async () => {
    const job = await openJob("Scoops & Co. Ice Cream");
    await markDoneAction(IDLE, form({ jobId: job.id }));
    vi.mocked(revalidatePath).mockClear();

    const again = await markDoneAction(IDLE, form({ jobId: job.id }));

    expectRejected(again);
    expect(again).toEqual({ status: "error", message: "This job is already closed.", fieldErrors: {} });
  });

  it("a job that doesn't exist", async () => {
    const state = await addNoteAction(IDLE, form({ jobId: 4242, note: "Hello?" }));
    expectRejected(state);
    expect(state).toMatchObject({ message: "This job no longer exists. Reload the page." });
  });

  it("an empty note", async () => {
    const job = await openJob("Rosa's Taqueria");
    const state = await addNoteAction(IDLE, form({ jobId: job.id, note: "   " }));
    expectRejected(state);
    expect(state).toMatchObject({ fieldErrors: { note: "Write the note first." } });
  });

  it("a database failure reports that nothing changed", async () => {
    const job = await openJob("Harbor Lane Grocery");
    vi.spyOn(db, "transaction").mockRejectedValueOnce(new Error("disk I/O error"));
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});

    const state = await markQuoteSentAction(IDLE, form({ jobId: job.id, amount: "500" }));

    expectRejected(state);
    expect(state).toEqual({ status: "error", message: "That didn't save. Nothing was changed. Try again.", fieldErrors: {} });
    expect(await reload(job.id)).toEqual(job);
    quiet.mockRestore();
  });
});

// ── Timelines written by actions tell the same story as the jobs ─────────────

describe("timeline replay after a busy morning", () => {
  it("every job's stored state matches replaying its timeline", async () => {
    let minute = 0;
    const tick = () => vi.setSystemTime(new Date(NOW.getTime() + ++minute * 60_000));
    const act = async (action: typeof logCallAction, fields: Record<string, string | number>) => {
      tick();
      const state = await action(IDLE, form(fields));
      expect(state.status, JSON.stringify(state)).toBe("success");
    };

    const carlos = await technicianId("Carlos Rivera");
    const tasha = await technicianId("Tasha Greene");
    const rosa = await openJob("Rosa's Taqueria");
    const smoke = await openJob("Smoke & Timber BBQ");
    const eastside = await openJob("Eastside Market");
    const harbor = await openJob("Harbor Lane Grocery");
    const hillcrest = await openJob("Hillcrest Elementary (cafeteria)");
    const magnolia = await openJob("Magnolia Bakehouse");
    const bluebonnet = await openJob("Bluebonnet Florist");

    await act(logCallAction, { jobId: rosa.id, outcome: "no_answer" });
    await act(logCallAction, { jobId: rosa.id, outcome: "talked", nextStep: "ready_to_schedule" });
    await act(scheduleAction, { jobId: rosa.id, technicianId: tasha, visitOn: "2026-09-29" });
    await act(addNoteAction, { jobId: rosa.id, note: "Tasha on her way." });

    await act(logCallAction, { jobId: smoke.id, outcome: "talked", nextStep: "ready_to_schedule" });
    await act(scheduleAction, { jobId: smoke.id, technicianId: carlos, visitOn: "2026-10-01" });
    await act(scheduleAction, { jobId: smoke.id, technicianId: tasha, visitOn: "2026-10-02" });

    await act(logCallAction, { jobId: eastside.id, outcome: "no_answer" });
    await act(logCallAction, { jobId: eastside.id, outcome: "voicemail", callbackOn: "2026-10-01" });

    await act(markQuoteSentAction, { jobId: harbor.id, amount: "1240" });
    await act(markQuoteSentAction, { jobId: harbor.id, amount: "1,180.50", note: "Revised." });

    await act(setCallbackAction, { jobId: hillcrest.id, callbackOn: "2026-10-06" });
    await act(markLostAction, { jobId: magnolia.id, reason: "other", confirmed: "yes" });
    await act(markDoneAction, { jobId: bluebonnet.id, note: "Reset the thermostat over the phone." });

    for (const row of await loadJobsWithTimeline(db)) {
      expect({ job: row.id, ...replayTimeline(row, TZ) }).toEqual({ job: row.id, ...storedState(row) });

      // Scheduling records the technician's id, and it matches the job.
      const lastBooking = row.activities.findLast((a) => a.type === "scheduled");
      if (lastBooking?.meta?.technicianId !== undefined) {
        expect(lastBooking.meta.technicianId).toBe(row.technicianId);
      }
    }

    // And Today still has each job in at most one section.
    await today();
  });
});
