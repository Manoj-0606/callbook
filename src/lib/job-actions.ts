import type { Job } from "../db/schema";
import { BUSINESS_TIMEZONE } from "./config";
import { localToday } from "./dates";
import {
  isOpenStatus,
  LOST_REASON_LABELS,
  STATUS_LABELS,
  type ActivityMeta,
  type ActivityType,
  type JobStatus,
  type LocalDate,
  type LostReason,
  type OpenJobStatus,
} from "./domain";
import { followUpUpdatesFor } from "./followups";
import { describeDay, firstName, formatMoney } from "./wording";

/**
 * What each of Denise's actions does to a job, as pure functions.
 *
 * Each `plan…` function takes the job as it is now plus validated input, and
 * returns the exact changes: the job fields to update, the one activity that
 * records what she did (with any status change in its details), and a short
 * confirmation. Nothing is written here; the caller applies the plan in one
 * transaction.
 *
 * Contact-clock rules come from the follow-up engine (`followUpUpdatesFor`),
 * so "no answer doesn't reset the clock" and "emergencies never hide on their
 * own" hold for every action.
 */

export const ACTION_KINDS = ["log_call", "quote", "schedule", "callback", "note", "done", "lost"] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];

/** What can be done to a job in each open status, in menu order. Notes work on any job. */
export const ALLOWED_ACTIONS: Record<OpenJobStatus, readonly ActionKind[]> = {
  new: ["log_call", "quote", "schedule", "callback", "note", "done", "lost"],
  needs_quote: ["log_call", "quote", "schedule", "callback", "note", "done", "lost"],
  quote_sent: ["log_call", "quote", "schedule", "callback", "note", "done", "lost"],
  ready_to_schedule: ["log_call", "schedule", "callback", "note", "done", "lost"],
  scheduled: ["log_call", "schedule", "callback", "note", "done", "lost"],
};

export function canPerform(action: ActionKind, status: JobStatus): boolean {
  if (action === "note") return true;
  return isOpenStatus(status) && ALLOWED_ACTIONS[status].includes(action);
}

export type NextStep = "needs_quote" | "ready_to_schedule";

/**
 * Where a call can move a job. Scheduling, quoting and closing have their own
 * actions. A scheduled job can't step back through a call, which would leave a
 * stale visit date behind; reschedule or close it instead.
 */
export const NEXT_STEPS: Record<OpenJobStatus, readonly NextStep[]> = {
  new: ["needs_quote", "ready_to_schedule"],
  needs_quote: ["ready_to_schedule"],
  quote_sent: ["ready_to_schedule", "needs_quote"],
  ready_to_schedule: ["needs_quote"],
  scheduled: [],
};

/**
 * Once Denise has actually talked to a new customer she must say what happens
 * next. Otherwise the job would stay under "nobody's called back yet".
 */
export function nextStepRequired(status: JobStatus, outcome: CallOutcome): boolean {
  return status === "new" && outcome === "talked";
}

export type CallOutcome = "talked" | "voicemail" | "no_answer";

export type LogCallInput = {
  outcome: CallOutcome;
  nextStep: NextStep | null;
  callbackOn: LocalDate | null;
  note: string | null;
};
export type QuoteInput = { amountCents: number; note: string | null };
export type ScheduleInput = {
  technician: { id: number; name: string };
  visitOn: LocalDate;
  note: string | null;
};
export type CallbackInput = { callbackOn: LocalDate; note: string | null };
export type DoneInput = { note: string | null };
export type LostInput = { reason: LostReason; note: string | null };
export type NoteInput = { note: string };

/** The job fields an action reads. */
export type ActionJob = Pick<Job, "status" | "isEmergency" | "followUpOn">;

export type JobUpdates = Partial<
  Pick<
    Job,
    | "status"
    | "lastContactAt"
    | "followUpOn"
    | "quoteAmountCents"
    | "quoteSentAt"
    | "technicianId"
    | "scheduledFor"
    | "closedAt"
    | "lostReason"
  >
>;

export type PlannedActivity = {
  type: ActivityType;
  note: string | null;
  meta: ActivityMeta | null;
  createdAt: Date;
};

export type JobChange = { job: JobUpdates; activity: PlannedActivity; summary: string };

export type ChangeResult =
  | { ok: true; change: JobChange }
  | { ok: false; error: string; field?: string };

const CALL_ACTIVITY: Record<CallOutcome, ActivityType> = {
  talked: "call_talked",
  voicemail: "voicemail",
  no_answer: "no_answer",
};

const CALL_LOGGED: Record<CallOutcome, string> = {
  talked: "Call logged",
  voicemail: "Voicemail logged",
  no_answer: "No answer logged",
};

export function planLogCall(
  job: ActionJob,
  input: LogCallInput,
  now: Date,
  timezone: string = BUSINESS_TIMEZONE,
): ChangeResult {
  const blocked = guard("log_call", job);
  if (blocked) return blocked;

  const { outcome, nextStep, callbackOn } = input;
  if (nextStep && outcome !== "talked") {
    return fail("You can only change what happens next after talking to them.", "nextStep");
  }
  if (nextStep && !NEXT_STEPS[job.status as OpenJobStatus].includes(nextStep)) {
    return fail("That next step isn't available for this job.", "nextStep");
  }
  if (!nextStep && nextStepRequired(job.status, outcome)) {
    return fail("Pick what happens next.", "nextStep");
  }

  const type = CALL_ACTIVITY[outcome];
  const updates: JobUpdates = { ...followUpUpdatesFor(type, now, job, timezone) };
  if (nextStep) updates.status = nextStep;
  if (callbackOn) updates.followUpOn = callbackOn;

  const today = localToday(now, timezone);
  const summary = [CALL_LOGGED[outcome]];
  if (nextStep) summary.push(`now "${STATUS_LABELS[nextStep]}"`);
  if (callbackOn) {
    summary.push(`callback ${describeDay(callbackOn, today)}`);
  } else if (outcome === "no_answer") {
    summary.push(
      updates.followUpOn
        ? `back on your list ${describeDay(updates.followUpOn, today)}`
        : "still on today's list",
    );
  }

  return ok(
    updates,
    activity(type, input.note, now, {
      ...statusMeta(job.status, nextStep ?? job.status),
      ...(callbackOn ? { date: callbackOn } : {}),
    }),
    summary.join(" · "),
  );
}

export function planQuoteSent(
  job: ActionJob,
  input: QuoteInput,
  now: Date,
  timezone: string = BUSINESS_TIMEZONE,
): ChangeResult {
  const blocked = guard("quote", job);
  if (blocked) return blocked;

  return ok(
    {
      ...followUpUpdatesFor("quote_sent", now, job, timezone),
      status: "quote_sent",
      quoteAmountCents: input.amountCents,
      quoteSentAt: now,
    },
    activity("quote_sent", input.note, now, {
      ...statusMeta(job.status, "quote_sent"),
      quoteAmountCents: input.amountCents,
    }),
    `Quote ${formatMoney(input.amountCents)} recorded`,
  );
}

export function planSchedule(
  job: ActionJob,
  input: ScheduleInput,
  now: Date,
  timezone: string = BUSINESS_TIMEZONE,
): ChangeResult {
  const blocked = guard("schedule", job);
  if (blocked) return blocked;

  const { technician, visitOn } = input;
  const verb = job.status === "scheduled" ? "Rescheduled" : "Scheduled";
  return ok(
    {
      ...followUpUpdatesFor("scheduled", now, job, timezone),
      status: "scheduled",
      technicianId: technician.id,
      scheduledFor: visitOn,
    },
    activity("scheduled", input.note, now, {
      ...statusMeta(job.status, "scheduled"),
      technicianId: technician.id,
      technicianName: technician.name,
      date: visitOn,
    }),
    `${verb} with ${firstName(technician.name)} for ${describeDay(visitOn, localToday(now, timezone))}`,
  );
}

export function planCallback(
  job: ActionJob,
  input: CallbackInput,
  now: Date,
  timezone: string = BUSINESS_TIMEZONE,
): ChangeResult {
  const blocked = guard("callback", job);
  if (blocked) return blocked;

  return ok(
    { followUpOn: input.callbackOn },
    activity("follow_up_set", input.note, now, { date: input.callbackOn }),
    `Callback set for ${describeDay(input.callbackOn, localToday(now, timezone))}`,
  );
}

export function planDone(job: ActionJob, input: DoneInput, now: Date): ChangeResult {
  const blocked = guard("done", job);
  if (blocked) return blocked;

  return ok(
    { status: "done", closedAt: now, followUpOn: null },
    activity("status_change", input.note, now, statusMeta(job.status, "done")),
    "Marked done",
  );
}

export function planLost(job: ActionJob, input: LostInput, now: Date): ChangeResult {
  const blocked = guard("lost", job);
  if (blocked) return blocked;

  return ok(
    { status: "lost", lostReason: input.reason, closedAt: now, followUpOn: null },
    activity("status_change", input.note, now, {
      ...statusMeta(job.status, "lost"),
      lostReason: input.reason,
    }),
    `Closed · ${LOST_REASON_LABELS[input.reason]}`,
  );
}

export function planNote(job: ActionJob, input: NoteInput, now: Date): ChangeResult {
  const blocked = guard("note", job);
  if (blocked) return blocked;

  return ok({}, activity("note", input.note, now, {}), "Note added");
}

function guard(action: ActionKind, job: ActionJob): ChangeResult | null {
  if (canPerform(action, job.status)) return null;
  if (!isOpenStatus(job.status)) return fail("This job is already closed.");
  return fail(`That isn't available while the job is "${STATUS_LABELS[job.status]}".`);
}

function statusMeta(from: JobStatus, to: JobStatus): ActivityMeta {
  return from === to ? {} : { fromStatus: from, toStatus: to };
}

function activity(type: ActivityType, note: string | null, now: Date, meta: ActivityMeta): PlannedActivity {
  return { type, note, meta: Object.keys(meta).length ? meta : null, createdAt: now };
}

function ok(job: JobUpdates, planned: PlannedActivity, summary: string): ChangeResult {
  return { ok: true, change: { job, activity: planned, summary } };
}

function fail(error: string, field?: string): ChangeResult {
  return field ? { ok: false, error, field } : { ok: false, error };
}
