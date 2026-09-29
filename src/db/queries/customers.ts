import { asc, eq, inArray } from "drizzle-orm";
import { BUSINESS_TIMEZONE } from "../../lib/config";
import { buildCustomerView, type CustomerView } from "../../lib/customer-view";
import { isOpenStatus } from "../../lib/domain";
import type { CustomerMatch } from "../../lib/new-request";
import type { Executor } from "../executor";
import { activities, customers, jobs } from "../schema";
import { listJobs } from "./jobs";

/** A customer's page: details, every job, and every job's activities. Null if there's no such customer. */
export async function loadCustomerView(
  db: Executor,
  customerId: number,
  now: Date,
  timezone: string = BUSINESS_TIMEZONE,
): Promise<CustomerView | null> {
  const [customer] = await db.select().from(customers).where(eq(customers.id, customerId));
  if (!customer) return null;

  const customerJobs = await listJobs(db, eq(jobs.customerId, customerId));
  const jobIds = customerJobs.map((job) => job.id);
  const history = jobIds.length ? await db.select().from(activities).where(inArray(activities.jobId, jobIds)) : [];

  return buildCustomerView({ customer, jobs: customerJobs, activities: history }, now, timezone);
}

/** Just the name for the browser tab. */
export async function loadCustomerTitle(db: Executor, customerId: number): Promise<string | null> {
  const [row] = await db
    .select({ businessName: customers.businessName, name: customers.name })
    .from(customers)
    .where(eq(customers.id, customerId));
  return row ? (row.businessName ?? row.name) : null;
}

/**
 * The customer with this phone number (digits only, as `phoneDigits` stores
 * them), with their open jobs and a count of past ones. If two records share a
 * number, the oldest wins, so repeat requests keep landing on the same record.
 */
export async function findCustomerByPhone(db: Executor, digits: string): Promise<CustomerMatch | null> {
  const [customer] = await db
    .select({
      id: customers.id,
      name: customers.name,
      businessName: customers.businessName,
      email: customers.email,
      address: customers.address,
    })
    .from(customers)
    .where(eq(customers.phoneDigits, digits))
    .orderBy(asc(customers.id))
    .limit(1);
  if (!customer) return null;

  const customerJobs = await db
    .select({ id: jobs.id, description: jobs.description, status: jobs.status })
    .from(jobs)
    .where(eq(jobs.customerId, customer.id))
    .orderBy(asc(jobs.receivedAt), asc(jobs.id));

  return {
    ...customer,
    openJobs: customerJobs.filter((job) => isOpenStatus(job.status)),
    pastJobs: customerJobs.filter((job) => !isOpenStatus(job.status)).length,
  };
}
