import { describe, expect, it } from "vitest";
import { zonedDateTime } from "./dates";
import { JOB_STATUSES, OPEN_STATUSES, type JobStatus } from "./domain";
import { getFollowUp, type FollowUpJob } from "./followups";
import {
  ACTION_KINDS,
  ALLOWED_ACTIONS,
  canPerform,
  NEXT_STEPS,
  planCallback,
  planDone,
  planLogCall,
  planLost,
  planNote,
  planQuoteSent,
  planSchedule,
  type ActionJob,
  type ChangeResult,
  type JobChange,
  type LogCallInput,
} from "./job-actions";

const TZ = "America/Chicago";
const at = (date: string, time = "10:00") => zonedDateTime(date, time, TZ);
const TUESDAY = at("2026-09-29", "09:30");
const FRIDAY = at("2026-10-02", "15:00");
const CARLOS = { id: 2, name: "Carlos Rivera" };

const job = (overrides: Partial<ActionJob> = {}): ActionJob => ({
  status: "quote_sent",
  isEmergency: false,
  followUpOn: null,
  ...overrides,
});

const call = (overrides: Partial<LogCallInput> = {}): LogCallInput => ({
  outcome: "talked",
  nextStep: null,
  callbackOn: null,
  note: null,
  ...overrides,
});

function changed(result: ChangeResult): JobChange {
  if (!result.ok) throw new Error(`Expected a change, got: ${result.error}`);
  return result.change;
}

describe("planLogCall", () => {
  it.each<{ name: string; job?: Partial<ActionJob>; input: Partial<LogCallInput>; now?: Date; expected: JobChange }>([
    {
      name: "talked: resets the contact clock and clears any callback",
      job: { followUpOn: "2026-09-29" },
      input: { outcome: "talked", note: "Still thinking it over." },
      expected: {
        job: { lastContactAt: TUESDAY, followUpOn: null },
        activity: { type: "call_talked", note: "Still thinking it over.", meta: null, createdAt: TUESDAY },
        summary: "Call logged",
      },
    },
    {
      name: "talked, and they said yes",
      input: { outcome: "talked", nextStep: "ready_to_schedule" },
      expected: {
        job: { lastContactAt: TUESDAY, followUpOn: null, status: "ready_to_schedule" },
        activity: {
          type: "call_talked",
          note: null,
          meta: { fromStatus: "quote_sent", toStatus: "ready_to_schedule" },
          createdAt: TUESDAY,
        },
        summary: 'Call logged · now "Said yes — needs scheduling"',
      },
    },
    {
      name: "talked to a new customer who wants a price",
      job: { status: "new" },
      input: { outcome: "talked", nextStep: "needs_quote" },
      expected: {
        job: { lastContactAt: TUESDAY, followUpOn: null, status: "needs_quote" },
        activity: {
          type: "call_talked",
          note: null,
          meta: { fromStatus: "new", toStatus: "needs_quote" },
          createdAt: TUESDAY,
        },
        summary: 'Call logged · now "Needs a quote"',
      },
    },
    {
      name: "talked, with a callback date: the callback goes on the call",
      input: { outcome: "talked", callbackOn: "2026-10-01" },
      expected: {
        job: { lastContactAt: TUESDAY, followUpOn: "2026-10-01" },
        activity: { type: "call_talked", note: null, meta: { date: "2026-10-01" }, createdAt: TUESDAY },
        summary: "Call logged · callback Thursday",
      },
    },
    {
      name: "voicemail: counts as contact",
      input: { outcome: "voicemail" },
      expected: {
        job: { lastContactAt: TUESDAY, followUpOn: null },
        activity: { type: "voicemail", note: null, meta: null, createdAt: TUESDAY },
        summary: "Voicemail logged",
      },
    },
    {
      name: "voicemail on a new job: it stays new, nobody has talked to them yet",
      job: { status: "new" },
      input: { outcome: "voicemail" },
      expected: {
        job: { lastContactAt: TUESDAY, followUpOn: null },
        activity: { type: "voicemail", note: null, meta: null, createdAt: TUESDAY },
        summary: "Voicemail logged",
      },
    },
    {
      name: "no answer: does NOT reset the clock, comes back the next business day",
      input: { outcome: "no_answer" },
      expected: {
        job: { followUpOn: "2026-09-30" },
        activity: { type: "no_answer", note: null, meta: null, createdAt: TUESDAY },
        summary: "No answer logged · back on your list tomorrow",
      },
    },
    {
      name: "no answer on a Friday comes back Monday",
      input: { outcome: "no_answer" },
      now: FRIDAY,
      expected: {
        job: { followUpOn: "2026-10-05" },
        activity: { type: "no_answer", note: null, meta: null, createdAt: FRIDAY },
        summary: "No answer logged · back on your list Monday",
      },
    },
    {
      name: "no answer on an emergency: stays on today's list",
      job: { status: "new", isEmergency: true },
      input: { outcome: "no_answer" },
      expected: {
        job: {},
        activity: { type: "no_answer", note: null, meta: null, createdAt: TUESDAY },
        summary: "No answer logged · still on today's list",
      },
    },
    {
      name: "no answer with a chosen callback: her date wins, clock still not reset",
      input: { outcome: "no_answer", callbackOn: "2026-10-05" },
      expected: {
        job: { followUpOn: "2026-10-05" },
        activity: { type: "no_answer", note: null, meta: { date: "2026-10-05" }, createdAt: TUESDAY },
        summary: "No answer logged · callback Monday",
      },
    },
  ])("$name", ({ job: overrides, input, now = TUESDAY, expected }) => {
    const change = changed(planLogCall(job(overrides), call(input), now, TZ));
    expect(change).toEqual(expected);
    if (input.outcome === "no_answer") expect(change.job).not.toHaveProperty("lastContactAt");
  });

  it.each<{ name: string; job: Partial<ActionJob>; input: Partial<LogCallInput>; error: string; field?: string }>([
    {
      name: "a new job needs a next step once you've talked",
      job: { status: "new" },
      input: { outcome: "talked" },
      error: "Pick what happens next.",
      field: "nextStep",
    },
    {
      name: "a next step needs an actual conversation",
      job: { status: "quote_sent" },
      input: { outcome: "voicemail", nextStep: "ready_to_schedule" },
      error: "You can only change what happens next after talking to them.",
      field: "nextStep",
    },
    {
      name: "a scheduled job can't step back through a call",
      job: { status: "scheduled" },
      input: { outcome: "talked", nextStep: "needs_quote" },
      error: "That next step isn't available for this job.",
      field: "nextStep",
    },
    {
      name: "a closed job",
      job: { status: "done" },
      input: { outcome: "talked" },
      error: "This job is already closed.",
    },
  ])("refuses: $name", ({ job: overrides, input, error, field }) => {
    const result = planLogCall(job(overrides), call(input), TUESDAY, TZ);
    expect(result).toEqual(field ? { ok: false, error, field } : { ok: false, error });
  });
});

describe("planQuoteSent", () => {
  it("records the quote, starts waiting on the customer, and resets the clock", () => {
    const change = changed(
      planQuoteSent(job({ status: "needs_quote", followUpOn: "2026-09-29" }), { amountCents: 385000, note: "Compressor swap." }, TUESDAY, TZ),
    );
    expect(change).toEqual({
      job: {
        status: "quote_sent",
        quoteAmountCents: 385000,
        quoteSentAt: TUESDAY,
        lastContactAt: TUESDAY,
        followUpOn: null,
      },
      activity: {
        type: "quote_sent",
        note: "Compressor swap.",
        meta: { fromStatus: "needs_quote", toStatus: "quote_sent", quoteAmountCents: 385000 },
        createdAt: TUESDAY,
      },
      summary: "Quote $3,850 recorded",
    });
  });

  it("can update a quote that's already out, without a status change", () => {
    const change = changed(planQuoteSent(job({ status: "quote_sent" }), { amountCents: 350000, note: null }, TUESDAY, TZ));
    expect(change.job.status).toBe("quote_sent");
    expect(change.activity.meta).toEqual({ quoteAmountCents: 350000 });
  });

  it("can quote straight from a new request", () => {
    expect(planQuoteSent(job({ status: "new" }), { amountCents: 50000, note: null }, TUESDAY, TZ).ok).toBe(true);
  });

  it.each<[JobStatus, string]>([
    ["ready_to_schedule", 'That isn\'t available while the job is "Said yes — needs scheduling".'],
    ["scheduled", 'That isn\'t available while the job is "Scheduled".'],
    ["lost", "This job is already closed."],
  ])("refuses once the job is %s", (status, error) => {
    expect(planQuoteSent(job({ status }), { amountCents: 1000, note: null }, TUESDAY, TZ)).toEqual({ ok: false, error });
  });
});

describe("planSchedule", () => {
  it("books the technician and visit, storing both the id and the name", () => {
    const change = changed(
      planSchedule(job({ status: "ready_to_schedule" }), { technician: CARLOS, visitOn: "2026-10-01", note: null }, TUESDAY, TZ),
    );
    expect(change).toEqual({
      job: {
        status: "scheduled",
        technicianId: 2,
        scheduledFor: "2026-10-01",
        lastContactAt: TUESDAY,
        followUpOn: null,
      },
      activity: {
        type: "scheduled",
        note: null,
        meta: {
          fromStatus: "ready_to_schedule",
          toStatus: "scheduled",
          technicianId: 2,
          technicianName: "Carlos Rivera",
          date: "2026-10-01",
        },
        createdAt: TUESDAY,
      },
      summary: "Scheduled with Carlos for Thursday",
    });
  });

  it("reschedules without a status change", () => {
    const change = changed(
      planSchedule(job({ status: "scheduled" }), { technician: { id: 4, name: "Dave Lindqvist" }, visitOn: "2026-10-05", note: null }, TUESDAY, TZ),
    );
    expect(change.activity.meta).toEqual({ technicianId: 4, technicianName: "Dave Lindqvist", date: "2026-10-05" });
    expect(change.summary).toBe("Rescheduled with Dave for Monday");
  });

  it("refuses a closed job", () => {
    expect(planSchedule(job({ status: "done" }), { technician: CARLOS, visitOn: "2026-10-01", note: null }, TUESDAY, TZ).ok).toBe(false);
  });
});

describe("planCallback", () => {
  it("sets the callback without counting as contact", () => {
    const change = changed(planCallback(job(), { callbackOn: "2026-10-05", note: "After the landlord replies." }, TUESDAY, TZ));
    expect(change).toEqual({
      job: { followUpOn: "2026-10-05" },
      activity: { type: "follow_up_set", note: "After the landlord replies.", meta: { date: "2026-10-05" }, createdAt: TUESDAY },
      summary: "Callback set for Monday",
    });
  });
});

describe("planDone", () => {
  it("closes the job and clears the callback", () => {
    const change = changed(planDone(job({ status: "scheduled", followUpOn: "2026-10-01" }), { note: "Replaced the relay." }, TUESDAY));
    expect(change).toEqual({
      job: { status: "done", closedAt: TUESDAY, followUpOn: null },
      activity: {
        type: "status_change",
        note: "Replaced the relay.",
        meta: { fromStatus: "scheduled", toStatus: "done" },
        createdAt: TUESDAY,
      },
      summary: "Marked done",
    });
  });

  it("refuses a job that's already done", () => {
    expect(planDone(job({ status: "done" }), { note: null }, TUESDAY)).toEqual({ ok: false, error: "This job is already closed." });
  });
});

describe("planLost", () => {
  it("closes the job with its reason and clears the callback", () => {
    const change = changed(planLost(job({ followUpOn: "2026-10-01" }), { reason: "too_expensive", note: null }, TUESDAY));
    expect(change).toEqual({
      job: { status: "lost", lostReason: "too_expensive", closedAt: TUESDAY, followUpOn: null },
      activity: {
        type: "status_change",
        note: null,
        meta: { fromStatus: "quote_sent", toStatus: "lost", lostReason: "too_expensive" },
        createdAt: TUESDAY,
      },
      summary: "Closed · Too expensive",
    });
  });
});

describe("planNote", () => {
  it("adds to the timeline without touching the job", () => {
    expect(changed(planNote(job(), { note: "Gate code 4411." }, TUESDAY))).toEqual({
      job: {},
      activity: { type: "note", note: "Gate code 4411.", meta: null, createdAt: TUESDAY },
      summary: "Note added",
    });
  });

  it("works on closed jobs too", () => {
    expect(planNote(job({ status: "done" }), { note: "Paid in full." }, TUESDAY).ok).toBe(true);
  });
});

describe("what's allowed", () => {
  it("allows notes on every job and nothing else on closed ones", () => {
    for (const status of JOB_STATUSES) {
      expect(canPerform("note", status)).toBe(true);
    }
    for (const action of ACTION_KINDS.filter((a) => a !== "note")) {
      expect(canPerform(action, "done")).toBe(false);
      expect(canPerform(action, "lost")).toBe(false);
    }
  });

  it("lets every open job be called, scheduled, called back, closed or noted", () => {
    for (const status of OPEN_STATUSES) {
      expect(ALLOWED_ACTIONS[status]).toEqual(expect.arrayContaining(["log_call", "schedule", "callback", "note", "done", "lost"]));
    }
  });

  it("never offers a call's next step that is the status the job already has", () => {
    for (const status of OPEN_STATUSES) {
      expect(NEXT_STEPS[status]).not.toContain(status);
    }
  });
});

describe("the Today consequence of each action", () => {
  // Apply the planned change, then ask the follow-up engine where the job lands.
  const base: FollowUpJob = {
    id: 1,
    customerId: 1,
    status: "needs_quote",
    isEmergency: false,
    followUpOn: null,
    scheduledFor: null,
    lastContactAt: at("2026-09-24"),
    receivedAt: at("2026-09-24"),
  };
  const after = (start: FollowUpJob, result: ChangeResult): FollowUpJob => ({ ...start, ...changed(result).job });
  const on = (j: FollowUpJob, when: Date) => getFollowUp(j, when, TZ)?.category ?? null;

  it("quote sent: off Today until it has gone quiet for 2 business days", () => {
    const quoted = after(base, planQuoteSent(base, { amountCents: 100000, note: null }, TUESDAY, TZ));
    expect(on(base, TUESDAY)).toBe("needs_quote");
    expect(on(quoted, TUESDAY)).toBeNull();
    expect(on(quoted, at("2026-09-30"))).toBeNull();
    expect(on(quoted, at("2026-10-01"))).toBe("gone_quiet");
  });

  it("schedule for a future day: off Today until the visit has passed", () => {
    const booked = after(base, planSchedule(base, { technician: CARLOS, visitOn: "2026-10-01", note: null }, TUESDAY, TZ));
    expect(on(booked, TUESDAY)).toBeNull();
    expect(on(booked, at("2026-10-01"))).toBeNull();
    expect(on(booked, at("2026-10-02"))).toBe("check_visit");
  });

  it("callback: hidden until the day, then 'You said you'd call'", () => {
    const later = after(base, planCallback(base, { callbackOn: "2026-10-05", note: null }, TUESDAY, TZ));
    expect(on(later, TUESDAY)).toBeNull();
    expect(on(later, at("2026-10-05"))).toBe("callback_due");
  });

  it("done and didn't go ahead: gone for good", () => {
    expect(on(after(base, planDone(base, { note: null }, TUESDAY)), at("2026-12-01"))).toBeNull();
    expect(on(after(base, planLost(base, { reason: "went_elsewhere", note: null }, TUESDAY)), at("2026-12-01"))).toBeNull();
  });

  it("no answer: off for today, back tomorrow, still counting from the last real contact", () => {
    const quiet: FollowUpJob = { ...base, status: "quote_sent" };
    const tried = after(quiet, planLogCall(quiet, call({ outcome: "no_answer" }), TUESDAY, TZ));
    expect(on(tried, TUESDAY)).toBeNull();
    expect(getFollowUp(tried, at("2026-09-30"), TZ)).toMatchObject({
      category: "callback_due",
      businessDaysSinceContact: 4,
    });
  });

  it("no answer on an emergency: still on today's list", () => {
    const emergency: FollowUpJob = { ...base, status: "new", isEmergency: true, lastContactAt: null };
    const tried = after(emergency, planLogCall(emergency, call({ outcome: "no_answer" }), TUESDAY, TZ));
    expect(on(tried, TUESDAY)).toBe("new");
  });

  it("they said yes: moves to 'Said yes — needs scheduling'", () => {
    const quiet: FollowUpJob = { ...base, status: "quote_sent" };
    const yes = after(quiet, planLogCall(quiet, call({ nextStep: "ready_to_schedule" }), TUESDAY, TZ));
    expect(on(quiet, TUESDAY)).toBe("gone_quiet");
    expect(on(yes, TUESDAY)).toBe("ready_to_schedule");
  });
});
