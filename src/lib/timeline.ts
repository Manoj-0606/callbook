import type { Activity } from "../db/schema";
import {
  LOST_REASON_LABELS,
  SOURCE_LABELS,
  STATUS_LABELS,
  type ActivityType,
  type LocalDate,
} from "./domain";
import { firstName, formatDate, formatMoney, formatTimestamp } from "./wording";

/**
 * Turns a job's activities into readable timeline lines, using only what was
 * recorded:
 *
 *   Request received · Phone call
 *   Called · Talked to customer        Moved to "Said yes — needs scheduling"
 *   Quote sent · $3,850
 *   Scheduled Carlos for Thu, Oct 1
 *   No answer
 *   Note · Customer asked us to call Friday
 *   Status changed · Done
 */

export type TimelineKind = "request" | "contact" | "attempt" | "quote" | "visit" | "callback" | "note" | "status";

export type TimelineEntry = {
  id: number;
  /** "Tue, Sep 29 · 9:05 am" */
  when: string;
  title: string;
  /** Extra facts recorded with it, e.g. a status change or a callback date. */
  details: string[];
  /** What Denise typed, when it isn't already the title. */
  note: string | null;
  kind: TimelineKind;
};

type TimelineActivity = Pick<Activity, "id" | "type" | "note" | "meta" | "createdAt">;

const CALLS: Partial<Record<ActivityType, { title: string; kind: TimelineKind }>> = {
  call_talked: { title: "Called · Talked to customer", kind: "contact" },
  voicemail: { title: "Called · Left a voicemail", kind: "contact" },
  no_answer: { title: "No answer", kind: "attempt" },
  text: { title: "Texted customer", kind: "contact" },
  email: { title: "Emailed customer", kind: "contact" },
  customer_called: { title: "Customer called us", kind: "contact" },
};

export function describeActivity(activity: TimelineActivity, today: LocalDate, timezone: string): TimelineEntry {
  const meta = activity.meta ?? {};
  const date = (value: LocalDate) => formatDate(value, today);
  const statusChange = meta.toStatus ? `Moved to "${STATUS_LABELS[meta.toStatus]}"` : null;
  const callback = meta.date ? `Callback set for ${date(meta.date)}` : null;
  // A job can be closed during a call ("the budget isn't there"), so any entry may carry the reason.
  const lostReason = meta.lostReason ? LOST_REASON_LABELS[meta.lostReason] : null;

  const entry = (title: string, kind: TimelineKind, details: (string | null)[] = [], note = activity.note): TimelineEntry => ({
    id: activity.id,
    when: formatTimestamp(activity.createdAt, today, timezone),
    title,
    details: details.filter((d): d is string => Boolean(d)),
    note: note ?? null,
    kind,
  });

  const call = CALLS[activity.type];
  if (call) return entry(call.title, call.kind, [statusChange, lostReason, callback]);

  switch (activity.type) {
    case "request_received":
      return entry(
        meta.source ? `Request received · ${SOURCE_LABELS[meta.source]}` : "Request received",
        "request",
        [callback],
      );

    case "quote_sent": {
      const amount = meta.quoteAmountCents !== undefined ? ` · ${formatMoney(meta.quoteAmountCents)}` : "";
      // A quote recorded while one was already out is an update.
      return entry(`${meta.toStatus ? "Quote sent" : "Quote updated"}${amount}`, "quote");
    }

    case "scheduled": {
      const verb = meta.toStatus ? "Scheduled" : "Rescheduled";
      const who = meta.technicianName ? ` ${firstName(meta.technicianName)}` : "";
      const when = meta.date ? ` for ${date(meta.date)}` : "";
      return entry(`${verb}${who}${when}`, "visit");
    }

    case "follow_up_set":
      return entry(meta.date ? `Callback set for ${date(meta.date)}` : "Callback set", "callback");

    case "status_change":
      return entry(
        meta.toStatus ? `Status changed · ${STATUS_LABELS[meta.toStatus]}` : "Status changed",
        "status",
        [lostReason],
      );

    case "note":
      return entry(activity.note ? `Note · ${activity.note}` : "Note", "note", [], null);

    default:
      return entry(activity.type, "note");
  }
}

/** A job's whole history, oldest first (ties keep the order they were recorded in). */
export function buildTimeline(activities: TimelineActivity[], today: LocalDate, timezone: string): TimelineEntry[] {
  return [...activities]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id)
    .map((activity) => describeActivity(activity, today, timezone));
}
