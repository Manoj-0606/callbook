import type { Job } from "../db/schema";
import { BUSINESS_TIMEZONE, SILENCE_BUSINESS_DAYS } from "./config";
import {
  addBusinessDays,
  businessDaysBetween,
  calendarDaysBetween,
  localToday,
  startOfLocalDay,
  toLocalDate,
} from "./dates";
import { countsAsContact, isOpenStatus, type ActivityType, type LocalDate } from "./domain";

/**
 * The follow-up engine: decides whether a job belongs on Today's list, and why.
 *
 * Today's list is never stored. It is calculated from each job's current state
 * every time it's needed, so it can't drift out of sync with the jobs.
 */

/** Today's sections, in the order they appear. */
export const FOLLOW_UP_CATEGORIES = [
  "new",
  "ready_to_schedule",
  "callback_due",
  "needs_quote",
  "gone_quiet",
  "check_visit",
] as const;
export type FollowUpCategory = (typeof FOLLOW_UP_CATEGORIES)[number];

export const FOLLOW_UP_TITLES: Record<FollowUpCategory, string> = {
  new: "New — nobody's called back yet",
  ready_to_schedule: "Said yes — needs scheduling",
  callback_due: "You said you'd call today",
  needs_quote: "Waiting on a quote from us",
  gone_quiet: `Hasn't heard from us in ${SILENCE_BUSINESS_DAYS}+ days`,
  check_visit: "Check on visits — did this get done?",
};

/** The job fields the rules read. A full `Job` row satisfies this. */
export type FollowUpJob = Pick<
  Job,
  | "id"
  | "customerId"
  | "status"
  | "isEmergency"
  | "followUpOn"
  | "scheduledFor"
  | "lastContactAt"
  | "receivedAt"
>;

export type FollowUp = {
  category: FollowUpCategory;
  isEmergency: boolean;
  /** When this job started waiting on us. Oldest is called first. */
  waitingSince: Date;
  /** Business days since the customer last heard from us (since the request came in, if never). */
  businessDaysSinceContact: number;
  /** callback_due: the date Denise promised. check_visit: the visit date. */
  dueOn?: LocalDate;
  /** Calendar days since `dueOn`: 0 means today. */
  daysOverdue?: number;
};

/**
 * Should this job be on Today's list, and why? `null` means no.
 *
 * Rules are checked in order and the first match wins, so a job has at most
 * one reason. Numbers match the rules table in the README.
 */
export function getFollowUp(
  job: FollowUpJob,
  now: Date,
  timezone: string = BUSINESS_TIMEZONE,
): FollowUp | null {
  // Done and "didn't go ahead" jobs never appear.
  if (!isOpenStatus(job.status)) return null;

  const today = localToday(now, timezone);

  // 1. A future callback date hides the job until that day, whatever else is true.
  if (job.followUpOn && job.followUpOn > today) return null;

  const lastHeardFromUs = job.lastContactAt ?? job.receivedAt;
  const common = {
    isEmergency: job.isEmergency,
    businessDaysSinceContact: businessDaysBetween(toLocalDate(lastHeardFromUs, timezone), today),
  };

  // 2. New: nobody has called back yet.
  if (job.status === "new") {
    return { ...common, category: "new", waitingSince: job.receivedAt };
  }

  // 3. Said yes: needs scheduling.
  if (job.status === "ready_to_schedule") {
    return { ...common, category: "ready_to_schedule", waitingSince: lastHeardFromUs };
  }

  // 4. Callback date is today or has passed (rule 1 already removed future dates).
  if (job.followUpOn) {
    return {
      ...common,
      category: "callback_due",
      waitingSince: startOfLocalDay(job.followUpOn, timezone),
      dueOn: job.followUpOn,
      daysOverdue: calendarDaysBetween(job.followUpOn, today),
    };
  }

  // 5. We owe them a quote.
  if (job.status === "needs_quote") {
    return { ...common, category: "needs_quote", waitingSince: lastHeardFromUs };
  }

  // 7. Scheduled jobs are judged only by the visit date: nothing to do until
  //    the visit has passed, then confirm it got done. Checked before rule 6 so a
  //    passed visit is never mislabelled "hasn't heard from us".
  if (job.status === "scheduled" && job.scheduledFor) {
    if (job.scheduledFor >= today) return null;
    return {
      ...common,
      category: "check_visit",
      waitingSince: startOfLocalDay(job.scheduledFor, timezone),
      dueOn: job.scheduledFor,
      daysOverdue: calendarDaysBetween(job.scheduledFor, today),
    };
  }

  // 6. Everything else still open (in practice, quote sent and waiting on the
  //    customer) comes back once it has gone quiet for too long.
  if (common.businessDaysSinceContact >= SILENCE_BUSINESS_DAYS) {
    return { ...common, category: "gone_quiet", waitingSince: lastHeardFromUs };
  }

  return null;
}

export type TodayItem<T extends FollowUpJob = FollowUpJob> = { job: T; followUp: FollowUp };

export type TodaySection<T extends FollowUpJob = FollowUpJob> = {
  category: FollowUpCategory;
  title: string;
  items: TodayItem<T>[];
};

export type TodayList<T extends FollowUpJob = FollowUpJob> = {
  today: LocalDate;
  /** Non-empty sections only, in display order. */
  sections: TodaySection<T>[];
  jobCount: number;
  /** Distinct customers: one person with two jobs on the list is still one call. */
  peopleCount: number;
};

/** Section order, then emergencies first, then whoever has waited longest. */
export function compareTodayItems(a: TodayItem, b: TodayItem): number {
  return (
    FOLLOW_UP_CATEGORIES.indexOf(a.followUp.category) -
      FOLLOW_UP_CATEGORIES.indexOf(b.followUp.category) ||
    Number(b.followUp.isEmergency) - Number(a.followUp.isEmergency) ||
    a.followUp.waitingSince.getTime() - b.followUp.waitingSince.getTime() ||
    a.job.id - b.job.id
  );
}

/** Today's call list: every job that needs attention, each in exactly one section. */
export function buildTodayList<T extends FollowUpJob>(
  jobs: readonly T[],
  now: Date,
  timezone: string = BUSINESS_TIMEZONE,
): TodayList<T> {
  const items: TodayItem<T>[] = [];
  for (const job of jobs) {
    const followUp = getFollowUp(job, now, timezone);
    if (followUp) items.push({ job, followUp });
  }
  items.sort(compareTodayItems);

  const sections = FOLLOW_UP_CATEGORIES.map((category) => ({
    category,
    title: FOLLOW_UP_TITLES[category],
    items: items.filter((item) => item.followUp.category === category),
  })).filter((section) => section.items.length > 0);

  return {
    today: localToday(now, timezone),
    sections,
    jobCount: items.length,
    peopleCount: new Set(items.map((item) => item.job.customerId)).size,
  };
}

/**
 * How logging an activity changes a job's follow-up fields.
 *
 * - Contact (talked, voicemail, text, email, they called us, quote sent,
 *   scheduled) resets the clock and clears any callback date.
 * - "No answer, no message" does NOT reset the clock. It moves the callback to
 *   the next business day so the job stops nagging today, except for
 *   emergencies, which are never hidden automatically.
 * - Everything else (notes, status changes, ...) changes neither.
 *
 * The caller applies an explicitly chosen callback date after this.
 */
export function followUpUpdatesFor(
  type: ActivityType,
  at: Date,
  job: Pick<Job, "isEmergency">,
  timezone: string = BUSINESS_TIMEZONE,
): Partial<Pick<Job, "lastContactAt" | "followUpOn">> {
  if (countsAsContact(type)) {
    return { lastContactAt: at, followUpOn: null };
  }
  if (type === "no_answer" && !job.isEmergency) {
    return { followUpOn: addBusinessDays(toLocalDate(at, timezone), 1) };
  }
  return {};
}
