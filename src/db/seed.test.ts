import { asc, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { countsAsContact } from "../lib/domain";
import { createDatabase, type Database } from "./client";
import { runMigrations } from "./migrate";
import { activities, jobs } from "./schema";
import { clearDatabase, isDatabaseEmpty, resetDatabase, seedDatabase } from "./seed";
import { buildSeedData } from "./seed-data";

const NOW = new Date("2026-09-29T14:00:00Z"); // Tuesday, 9 am in Denise's timezone

let db: Database;

beforeEach(async () => {
  db = createDatabase({ url: ":memory:" });
  await runMigrations(db);
});

afterEach(() => {
  db.$client.close();
});

describe("seed system", () => {
  it("seeds an empty database with everything in the demo data", async () => {
    expect(await isDatabaseEmpty(db)).toBe(true);

    const summary = await seedDatabase(db, NOW);
    const data = buildSeedData(NOW);

    expect(summary).toEqual({
      technicians: data.technicians.length,
      customers: data.customers.length,
      jobs: data.jobs.length,
      activities: data.jobs.reduce((n, j) => n + j.activities.length, 0),
    });
    expect(await isDatabaseEmpty(db)).toBe(false);
  });

  it("derives lastContactAt and quoteSentAt from each job's timeline", async () => {
    await seedDatabase(db, NOW);

    for (const job of await db.select().from(jobs)) {
      const timeline = await db
        .select()
        .from(activities)
        .where(eq(activities.jobId, job.id))
        .orderBy(asc(activities.createdAt));

      const contacts = timeline.filter((a) => countsAsContact(a.type));
      const quotes = timeline.filter((a) => a.type === "quote_sent");

      expect(job.lastContactAt?.getTime() ?? null).toBe(contacts.at(-1)?.createdAt.getTime() ?? null);
      expect(job.quoteSentAt?.getTime() ?? null).toBe(quotes.at(-1)?.createdAt.getTime() ?? null);
    }
  });

  it("is deterministic for a given seed time", () => {
    expect(buildSeedData(NOW)).toEqual(buildSeedData(NOW));
  });

  it("builds every date relative to the seed time", async () => {
    // Dates are counted in business days, so compare against the same weekday
    // four weeks later: every moment and every local date shifts by exactly 28 days.
    const fourWeeks = 28 * 24 * 60 * 60 * 1000;
    const early = buildSeedData(NOW);
    const late = buildSeedData(new Date(NOW.getTime() + fourWeeks));

    early.jobs.forEach((job, i) => {
      expect(late.jobs[i].receivedAt.getTime() - job.receivedAt.getTime()).toBe(fourWeeks);
      job.activities.forEach((activity, j) => {
        expect(late.jobs[i].activities[j].at.getTime() - activity.at.getTime()).toBe(fourWeeks);
      });
    });
  });

  it("reset wipes and reseeds, restarting IDs at 1", async () => {
    await seedDatabase(db, NOW);
    await resetDatabase(db, NOW);
    const first = await db.select({ id: jobs.id }).from(jobs).orderBy(asc(jobs.id));

    await resetDatabase(db, NOW);
    const second = await db.select({ id: jobs.id }).from(jobs).orderBy(asc(jobs.id));

    expect(first[0].id).toBe(1);
    expect(second).toEqual(first);
  });

  it("clear leaves an empty database with the schema intact", async () => {
    await seedDatabase(db, NOW);
    await clearDatabase(db);

    expect(await isDatabaseEmpty(db)).toBe(true);
    expect(await db.select().from(jobs)).toEqual([]);
  });
});
