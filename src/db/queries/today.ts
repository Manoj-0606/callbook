import { and, count, eq, inArray, max, sql } from "drizzle-orm";
import { BUSINESS_TIMEZONE } from "../../lib/config";
import { OPEN_STATUSES } from "../../lib/domain";
import { buildTodayList } from "../../lib/followups";
import { buildTodayView, type TodayJob, type TodayView } from "../../lib/today-view";
import type { Executor } from "../executor";
import { activities, jobs } from "../schema";
import { listActiveTechnicians } from "./technicians";

const OPEN = [...OPEN_STATUSES];

/**
 * Everything the Today page shows, read from the database. Read-only.
 *
 * Loads the open jobs, adds what their cards need, and hands them to the
 * follow-up engine unchanged. The engine decides who's on Today and in what order.
 */
export async function loadTodayView(
  db: Executor,
  now: Date,
  timezone: string = BUSINESS_TIMEZONE,
): Promise<TodayView> {
  const openJobs = await db.query.jobs.findMany({
    where: inArray(jobs.status, OPEN),
    with: { customer: true, technician: true },
  });

  const customerIds = [...new Set(openJobs.map((job) => job.customerId))];
  const [statusSince, jobCounts, technicians] = await Promise.all([
    loadStatusSince(db),
    loadCustomerJobCounts(db, customerIds),
    listActiveTechnicians(db),
  ]);

  const todayJobs: TodayJob[] = openJobs.map((job) => {
    const counts = jobCounts.get(job.customerId) ?? { open: 1, total: 1 };
    return {
      ...job,
      statusSince: statusSince.get(job.id) ?? job.receivedAt,
      otherOpenJobs: counts.open - 1,
      pastJobs: counts.total - counts.open,
    };
  });

  return buildTodayView(
    buildTodayList(todayJobs, now, timezone),
    { openJobCount: openJobs.length, technicians },
    now,
    timezone,
  );
}

/**
 * When each open job entered its current status: the latest activity whose
 * details moved it there. Jobs still "new" have none and fall back to when the
 * request came in.
 */
async function loadStatusSince(db: Executor): Promise<Map<number, Date>> {
  const rows = await db
    .select({ jobId: activities.jobId, at: max(activities.createdAt) })
    .from(activities)
    .innerJoin(jobs, eq(jobs.id, activities.jobId))
    .where(
      and(
        inArray(jobs.status, OPEN),
        sql`json_extract(${activities.meta}, '$.toStatus') = ${jobs.status}`,
      ),
    )
    .groupBy(activities.jobId);

  return new Map(rows.flatMap((row) => (row.at ? [[row.jobId, row.at] as const] : [])));
}

/** Open and total job counts per customer, for the repeat-customer hint. */
async function loadCustomerJobCounts(
  db: Executor,
  customerIds: number[],
): Promise<Map<number, { open: number; total: number }>> {
  if (customerIds.length === 0) return new Map();

  const rows = await db
    .select({
      customerId: jobs.customerId,
      open: sql<number>`sum(case when ${inArray(jobs.status, OPEN)} then 1 else 0 end)`.mapWith(Number),
      total: count(),
    })
    .from(jobs)
    .where(inArray(jobs.customerId, customerIds))
    .groupBy(jobs.customerId);

  return new Map(rows.map((row) => [row.customerId, { open: row.open, total: row.total }]));
}
