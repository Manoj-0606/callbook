import type { Database } from "../db/client";
import { BUSINESS_TIMEZONE } from "../lib/config";
import type { JobStatus, LocalDate, LostReason } from "../lib/domain";
import { followUpUpdatesFor } from "../lib/followups";

/** Every job with its customer, technician and timeline (oldest first). */
export function loadJobsWithTimeline(db: Database) {
  return db.query.jobs.findMany({
    with: {
      customer: true,
      technician: true,
      activities: { orderBy: (a, { asc }) => [asc(a.createdAt), asc(a.id)] },
    },
    orderBy: (j, { asc }) => [asc(j.id)],
  });
}
export type JobWithTimeline = Awaited<ReturnType<typeof loadJobsWithTimeline>>[number];

type ReplayedState = {
  status: JobStatus;
  lastContactAt: Date | null;
  followUpOn: LocalDate | null;
  scheduledFor: LocalDate | null;
  technicianName: string | null;
  quoteAmountCents: number | null;
  quoteSentAt: Date | null;
  lostReason: LostReason | null;
  closedAt: Date | null;
};

/**
 * Rebuild a job's state from its stored history, using the engine's own
 * contact-clock rules. If this disagrees with the stored row, the timeline and
 * the job are telling two different stories.
 */
export function replayTimeline(row: JobWithTimeline, timezone = BUSINESS_TIMEZONE): ReplayedState {
  const state: ReplayedState = {
    status: "new",
    lastContactAt: null,
    followUpOn: null,
    scheduledFor: null,
    technicianName: null,
    quoteAmountCents: null,
    quoteSentAt: null,
    lostReason: null,
    closedAt: null,
  };

  for (const activity of row.activities) {
    Object.assign(state, followUpUpdatesFor(activity.type, activity.createdAt, row, timezone));
    const meta = activity.meta ?? {};

    if (activity.type === "scheduled") {
      state.scheduledFor = meta.date ?? null;
      state.technicianName = meta.technicianName ?? null;
    } else if (meta.date) {
      state.followUpOn = meta.date; // a callback date set during this activity
    }
    if (activity.type === "quote_sent") state.quoteSentAt = activity.createdAt;
    if (meta.quoteAmountCents !== undefined) state.quoteAmountCents = meta.quoteAmountCents;
    if (meta.toStatus) state.status = meta.toStatus;
    if (meta.toStatus === "done" || meta.toStatus === "lost") {
      state.followUpOn = null; // closing a job ends its follow-ups
      state.closedAt = activity.createdAt;
      state.lostReason = meta.lostReason ?? null;
    }
  }
  return state;
}

/** The same fields, as stored on the job. */
export function storedState(row: JobWithTimeline): ReplayedState {
  return {
    status: row.status,
    lastContactAt: row.lastContactAt,
    followUpOn: row.followUpOn,
    scheduledFor: row.scheduledFor,
    technicianName: row.technician?.name ?? null,
    quoteAmountCents: row.quoteAmountCents,
    quoteSentAt: row.quoteSentAt,
    lostReason: row.lostReason,
    closedAt: row.closedAt,
  };
}
