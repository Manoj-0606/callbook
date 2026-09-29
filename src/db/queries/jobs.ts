import { and, count, eq, inArray, ne, or, sql, type SQL } from "drizzle-orm";
import { BUSINESS_TIMEZONE } from "../../lib/config";
import { OPEN_STATUSES, type JobStatus } from "../../lib/domain";
import { buildJobDetailView, type JobDetailView } from "../../lib/job-detail-view";
import {
  buildJobsView,
  parseJobSearch,
  statusesFor,
  type JobListItem,
  type JobSearch,
  type JobsQuery,
  type JobsView,
} from "../../lib/jobs-view";
import type { Executor } from "../executor";
import { customers, jobs, technicians } from "../schema";
import { listActiveTechnicians } from "./technicians";

/** The Jobs page: counts per status for the search, and the matching jobs. Read-only. */
export async function loadJobsView(
  db: Executor,
  query: JobsQuery,
  now: Date,
  timezone: string = BUSINESS_TIMEZONE,
): Promise<JobsView> {
  const search = searchCondition(parseJobSearch(query.q));

  const [countRows, items, [open]] = await Promise.all([
    db
      .select({ status: jobs.status, n: count() })
      .from(jobs)
      .innerJoin(customers, eq(customers.id, jobs.customerId))
      .where(search)
      .groupBy(jobs.status),
    listJobs(db, and(search, inArray(jobs.status, [...statusesFor(query.filter)]))),
    db.select({ n: count() }).from(jobs).where(inArray(jobs.status, [...OPEN_STATUSES])),
  ]);

  const counts: Partial<Record<JobStatus, number>> = Object.fromEntries(countRows.map((row) => [row.status, row.n]));
  return buildJobsView({ query, items, counts, openJobCount: open.n }, now, timezone);
}

/** One job with its customer, timeline and the customer's other jobs. Null if there's no such job. */
export async function loadJobDetail(
  db: Executor,
  jobId: number,
  now: Date,
  timezone: string = BUSINESS_TIMEZONE,
): Promise<JobDetailView | null> {
  const job = await db.query.jobs.findFirst({
    where: eq(jobs.id, jobId),
    with: { customer: true, technician: true, activities: true },
  });
  if (!job) return null;

  const [otherJobs, activeTechnicians] = await Promise.all([
    db
      .select({
        id: jobs.id,
        description: jobs.description,
        status: jobs.status,
        receivedAt: jobs.receivedAt,
        closedAt: jobs.closedAt,
      })
      .from(jobs)
      .where(and(eq(jobs.customerId, job.customerId), ne(jobs.id, job.id))),
    listActiveTechnicians(db),
  ]);

  return buildJobDetailView(
    { ...job, technician: job.technician ? { name: job.technician.name } : null, otherJobs },
    activeTechnicians,
    now,
    timezone,
  );
}

/** Just the name for the browser tab. */
export async function loadJobTitle(db: Executor, jobId: number): Promise<string | null> {
  const [row] = await db
    .select({ businessName: customers.businessName, name: customers.name })
    .from(jobs)
    .innerJoin(customers, eq(customers.id, jobs.customerId))
    .where(eq(jobs.id, jobId));
  return row ? (row.businessName ?? row.name) : null;
}

/**
 * Names match anywhere in the business or contact name, ignoring case. Phone
 * searches match the stored digits (`phoneDigits`), so partial numbers work.
 */
function searchCondition(search: JobSearch): SQL | undefined {
  if (!search) return undefined;
  if (search.kind === "phone") return contains(customers.phoneDigits, search.digits);
  return or(contains(customers.businessName, search.text), contains(customers.name, search.text));
}

/** `column LIKE %text%`, with LIKE's wildcards in the text taken literally. */
function contains(column: typeof customers.name | typeof customers.businessName | typeof customers.phoneDigits, text: string): SQL {
  const pattern = `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  return sql`${column} LIKE ${pattern} ESCAPE '\\'`;
}

/** Jobs with the customer and technician details a job row needs. */
export async function listJobs(db: Executor, where: SQL | undefined): Promise<JobListItem[]> {
  const rows = await db
    .select({
      job: jobs,
      customer: {
        name: customers.name,
        businessName: customers.businessName,
        phone: customers.phone,
        email: customers.email,
      },
      technicianName: technicians.name,
    })
    .from(jobs)
    .innerJoin(customers, eq(customers.id, jobs.customerId))
    .leftJoin(technicians, eq(technicians.id, jobs.technicianId))
    .where(where);

  return rows.map((row) => ({
    ...row.job,
    customer: row.customer,
    technician: row.technicianName ? { name: row.technicianName } : null,
  }));
}
