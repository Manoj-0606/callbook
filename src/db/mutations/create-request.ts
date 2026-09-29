import { eq } from "drizzle-orm";
import { BUSINESS_TIMEZONE } from "../../lib/config";
import { planNewRequest, type NewRequestInput, type NewRequestOptions } from "../../lib/new-request";
import type { Database } from "../client";
import { findCustomerByPhone } from "../queries/customers";
import { activities, customers, jobs } from "../schema";

export type CreateRequestResult = {
  jobId: number;
  customerId: number;
  isRepeatCustomer: boolean;
  displayName: string;
  summary: string;
};

/**
 * Record a new request, all or nothing.
 *
 * The phone number is matched again inside the transaction, so a repeat
 * customer is never duplicated, even if the form saved before its lookup
 * came back.
 */
export async function createRequest(
  db: Database,
  input: NewRequestInput,
  now: Date,
  timezone: string = BUSINESS_TIMEZONE,
  options: NewRequestOptions = {},
): Promise<CreateRequestResult> {
  return db.transaction(async (tx) => {
    const existing = await findCustomerByPhone(tx, input.phoneDigits);
    const plan = planNewRequest(input, existing, now, timezone, options);

    let customerId: number;
    if (plan.customer.kind === "create") {
      const [created] = await tx
        .insert(customers)
        .values({ ...plan.customer.values, createdAt: now, updatedAt: now })
        .returning({ id: customers.id });
      customerId = created.id;
    } else {
      customerId = plan.customer.id;
      if (Object.keys(plan.customer.fill).length > 0) {
        await tx.update(customers).set(plan.customer.fill).where(eq(customers.id, customerId));
      }
    }

    const [job] = await tx
      .insert(jobs)
      .values({ ...plan.job, customerId, createdAt: now, updatedAt: now })
      .returning({ id: jobs.id });
    await tx.insert(activities).values({ ...plan.activity, jobId: job.id });

    return {
      jobId: job.id,
      customerId,
      isRepeatCustomer: plan.customer.kind === "existing",
      displayName: plan.displayName,
      summary: plan.summary,
    };
  });
}
