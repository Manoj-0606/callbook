/**
 * The vocabulary of Denise's business: job statuses, where requests come from,
 * and what can happen on a job. Labels use her words, not CRM jargon.
 *
 * Imported by the database schema, so keep this file free of runtime
 * dependencies and path aliases.
 */

/** A calendar day in the business's local timezone, formatted `YYYY-MM-DD`. */
export type LocalDate = string;

export const JOB_STATUSES = [
  "new",
  "needs_quote",
  "quote_sent",
  "ready_to_schedule",
  "scheduled",
  "done",
  "lost",
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const OPEN_STATUSES = [
  "new",
  "needs_quote",
  "quote_sent",
  "ready_to_schedule",
  "scheduled",
] as const satisfies readonly JobStatus[];
export type OpenJobStatus = (typeof OPEN_STATUSES)[number];

export const CLOSED_STATUSES = ["done", "lost"] as const satisfies readonly JobStatus[];

export function isOpenStatus(status: JobStatus): status is OpenJobStatus {
  return (OPEN_STATUSES as readonly JobStatus[]).includes(status);
}

export const STATUS_LABELS: Record<JobStatus, string> = {
  new: "New",
  needs_quote: "Needs a quote",
  quote_sent: "Quote sent",
  ready_to_schedule: "Said yes — needs scheduling",
  scheduled: "Scheduled",
  done: "Done",
  lost: "Didn't go ahead",
};

export const JOB_SOURCES = [
  "phone",
  "website",
  "email",
  "text",
  "repeat",
  "referral",
  "other",
] as const;
export type JobSource = (typeof JOB_SOURCES)[number];

export const SOURCE_LABELS: Record<JobSource, string> = {
  phone: "Phone call",
  website: "Website form",
  email: "Email",
  text: "Text message",
  repeat: "Repeat customer",
  referral: "Referral",
  other: "Other",
};

export const LOST_REASONS = [
  "went_elsewhere",
  "too_expensive",
  "fixed_themselves",
  "no_response",
  "other",
] as const;
export type LostReason = (typeof LOST_REASONS)[number];

export const LOST_REASON_LABELS: Record<LostReason, string> = {
  went_elsewhere: "Went with someone else",
  too_expensive: "Too expensive",
  fixed_themselves: "Fixed it themselves",
  no_response: "Never heard back",
  other: "Other",
};

export const ACTIVITY_TYPES = [
  "request_received",
  "call_talked",
  "voicemail",
  "no_answer",
  "text",
  "email",
  "customer_called",
  "note",
  "status_change",
  "quote_sent",
  "scheduled",
  "follow_up_set",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

/**
 * Activities that mean the customer has heard from us (or we from them).
 * These reset the "hasn't heard from us" clock. A call with no answer and
 * no message deliberately does not.
 */
export const CONTACT_ACTIVITY_TYPES = [
  "call_talked",
  "voicemail",
  "text",
  "email",
  "customer_called",
  "quote_sent",
  "scheduled",
] as const satisfies readonly ActivityType[];

export function countsAsContact(type: ActivityType): boolean {
  return (CONTACT_ACTIVITY_TYPES as readonly ActivityType[]).includes(type);
}

/** Structured details stored alongside an activity, used to render the timeline. */
export type ActivityMeta = {
  fromStatus?: JobStatus;
  toStatus?: JobStatus;
  quoteAmountCents?: number;
  technicianId?: number;
  technicianName?: string;
  /** Scheduled visit date or callback date, depending on the activity. */
  date?: LocalDate;
  lostReason?: LostReason;
  source?: JobSource;
};
