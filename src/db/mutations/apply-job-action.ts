import { eq } from "drizzle-orm";
import type { ChangeResult } from "../../lib/job-actions";
import type { Database } from "../client";
import { activities, jobs, type Job } from "../schema";

export type ApplyResult = { ok: true; summary: string } | { ok: false; error: string; field?: string };

/**
 * Apply one of Denise's actions to a job, all or nothing.
 *
 * Inside a single transaction: read the job as it is now, let `plan` (a pure
 * function from job-actions.ts) decide the changes, update the job, and record
 * the activity. If anything fails, nothing is written.
 */
export async function applyJobAction(
  db: Database,
  jobId: number,
  plan: (job: Job) => ChangeResult,
): Promise<ApplyResult> {
  return db.transaction(async (tx) => {
    const [job] = await tx.select().from(jobs).where(eq(jobs.id, jobId));
    if (!job) return { ok: false, error: "This job no longer exists. Reload the page." };

    const result = plan(job);
    if (!result.ok) return result;

    const { job: updates, activity, summary } = result.change;
    if (Object.keys(updates).length > 0) {
      await tx.update(jobs).set(updates).where(eq(jobs.id, jobId));
    }
    await tx.insert(activities).values({ jobId, ...activity });

    return { ok: true, summary };
  });
}
