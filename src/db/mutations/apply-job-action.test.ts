import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { zonedDateTime } from "../../lib/dates";
import type { ActivityType, JobStatus } from "../../lib/domain";
import { planNote, type ChangeResult } from "../../lib/job-actions";
import { createDatabase, type Database } from "../client";
import { runMigrations } from "../migrate";
import { activities, jobs, type Job } from "../schema";
import { seedDatabase } from "../seed";
import { applyJobAction } from "./apply-job-action";

const NOW = zonedDateTime("2026-09-29", "09:00", "America/Chicago");

let db: Database;
let jobId: number;

beforeEach(async () => {
  db = createDatabase({ url: ":memory:" });
  await runMigrations(db);
  await seedDatabase(db, NOW);
  const [first] = await db.select().from(jobs).where(eq(jobs.status, "quote_sent"));
  jobId = first.id;
});

afterEach(() => {
  db.$client.close();
});

const snapshot = async () => ({
  job: (await db.select().from(jobs).where(eq(jobs.id, jobId)))[0],
  activityCount: (await db.select().from(activities)).length,
});

const change = (status: JobStatus, type: ActivityType): ChangeResult => ({
  ok: true,
  change: {
    job: { status, closedAt: NOW, followUpOn: null },
    activity: { type, note: "closing", meta: { toStatus: status }, createdAt: NOW },
    summary: "Done",
  },
});

describe("applyJobAction", () => {
  it("updates the job and records exactly one activity", async () => {
    const before = await snapshot();
    const result = await applyJobAction(db, jobId, () => change("done", "status_change"));

    expect(result).toEqual({ ok: true, summary: "Done" });
    const after = await snapshot();
    expect(after.job.status).toBe("done");
    expect(after.job.closedAt).toEqual(NOW);
    expect(after.activityCount).toBe(before.activityCount + 1);

    const [recorded] = await db
      .select()
      .from(activities)
      .where(eq(activities.jobId, jobId))
      .orderBy(activities.id)
      .then((rows) => rows.slice(-1));
    expect(recorded).toMatchObject({ type: "status_change", note: "closing", meta: { toStatus: "done" }, createdAt: NOW });
  });

  it("hands the plan the job as it is right now", async () => {
    await db.update(jobs).set({ followUpOn: "2026-10-09" }).where(eq(jobs.id, jobId));
    let seen: Job | undefined;
    await applyJobAction(db, jobId, (job) => {
      seen = job;
      return planNote(job, { note: "hi" }, NOW);
    });
    expect(seen?.followUpOn).toBe("2026-10-09");
  });

  it("writes nothing when the job doesn't exist", async () => {
    const before = await snapshot();
    expect(await applyJobAction(db, 9999, () => change("done", "status_change"))).toEqual({
      ok: false,
      error: "This job no longer exists. Reload the page.",
    });
    expect(await snapshot()).toEqual(before);
  });

  it("writes nothing when the plan refuses", async () => {
    const before = await snapshot();
    const result = await applyJobAction(db, jobId, () => ({ ok: false, error: "Nope.", field: "note" }));
    expect(result).toEqual({ ok: false, error: "Nope.", field: "note" });
    expect(await snapshot()).toEqual(before);
  });

  it("rolls back the job update if recording the activity fails", async () => {
    const before = await snapshot();
    // An activity type the database rejects, after the job row was already updated.
    const broken = change("done", "carrier_pigeon" as ActivityType);

    const error = await applyJobAction(db, jobId, () => broken).catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect(String((error as Error & { cause?: Error }).cause?.message)).toMatch(/CHECK constraint failed/);
    expect(await snapshot()).toEqual(before);
  });

  it("rolls back if the job update itself fails", async () => {
    const before = await snapshot();
    const broken = change("vanished" as JobStatus, "status_change");

    const error = await applyJobAction(db, jobId, () => broken).catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect(String((error as Error & { cause?: Error }).cause?.message)).toMatch(/CHECK constraint failed/);
    expect(await snapshot()).toEqual(before);
  });
});
