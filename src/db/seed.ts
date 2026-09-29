import { count, sql } from "drizzle-orm";
import { countsAsContact } from "../lib/domain";
import { phoneDigits } from "../lib/phone";
import type { Database } from "./client";
import type { Executor } from "./executor";
import {
  activities,
  customers,
  jobs,
  technicians,
  type NewActivity,
  type NewCustomer,
  type NewJob,
} from "./schema";
import { buildSeedData, type SeedData } from "./seed-data";

export async function isDatabaseEmpty(db: Executor): Promise<boolean> {
  const [techs] = await db.select({ n: count() }).from(technicians);
  const [custs] = await db.select({ n: count() }).from(customers);
  return techs.n === 0 && custs.n === 0;
}

/** Delete every row and restart ID numbering. Keeps the schema. */
export async function clearDatabase(db: Executor): Promise<void> {
  await db.delete(activities);
  await db.delete(jobs);
  await db.delete(customers);
  await db.delete(technicians);
  await db.run(
    sql`DELETE FROM sqlite_sequence WHERE name IN ('activities', 'jobs', 'customers', 'technicians')`,
  );
}

/** Insert the demo data. Expects an empty database. */
export async function seedDatabase(db: Executor, now: Date = new Date()): Promise<SeedSummary> {
  return insertSeedData(db, buildSeedData(now), now);
}

/** Wipe and reseed atomically, so a failure never leaves an empty database. */
export async function resetDatabase(db: Database, now: Date = new Date()): Promise<SeedSummary> {
  return db.transaction(async (tx) => {
    await clearDatabase(tx);
    return seedDatabase(tx, now);
  });
}

export type SeedSummary = {
  technicians: number;
  customers: number;
  jobs: number;
  activities: number;
};

/**
 * IDs are assigned here rather than by the database so each table goes in as
 * a single bulk insert: a handful of round trips even against remote Turso.
 */
async function insertSeedData(db: Executor, data: SeedData, now: Date): Promise<SeedSummary> {
  const technicianIds = new Map(data.technicians.map((t, i) => [t.key, i + 1]));
  const customerIds = new Map(data.customers.map((c, i) => [c.key, i + 1]));

  const technicianRows = data.technicians.map((t) => ({
    id: technicianIds.get(t.key)!,
    name: t.name,
    phone: t.phone,
  }));

  const customerRows: NewCustomer[] = data.customers.map((c) => ({
    id: customerIds.get(c.key)!,
    name: c.name ?? null,
    businessName: c.businessName ?? null,
    phone: c.phone ?? null,
    phoneDigits: phoneDigits(c.phone),
    email: c.email ?? null,
    address: c.address ?? null,
    notes: c.notes ?? null,
    createdAt: earliestReceivedAt(data, c.key) ?? now,
  }));

  const jobRows: NewJob[] = [];
  const activityRows: NewActivity[] = [];

  data.jobs.forEach((job, index) => {
    const jobId = index + 1;
    const customerId = customerIds.get(job.customer);
    if (!customerId) throw new Error(`Seed job references unknown customer "${job.customer}"`);

    let technicianId: number | null = null;
    if (job.technician) {
      technicianId = technicianIds.get(job.technician) ?? null;
      if (!technicianId) throw new Error(`Seed job references unknown technician "${job.technician}"`);
    }

    // Derive contact fields from the timeline so the two can never disagree.
    const contactTimes = job.activities.filter((a) => countsAsContact(a.type)).map((a) => a.at);
    const quoteTimes = job.activities.filter((a) => a.type === "quote_sent").map((a) => a.at);
    const lastActivityAt = latest(job.activities.map((a) => a.at)) ?? job.receivedAt;

    jobRows.push({
      id: jobId,
      customerId,
      description: job.description,
      equipment: job.equipment ?? null,
      source: job.source,
      referredBy: job.referredBy ?? null,
      status: job.status,
      isEmergency: job.isEmergency ?? false,
      quoteAmountCents: job.quoteAmountCents ?? null,
      quoteSentAt: latest(quoteTimes),
      technicianId,
      scheduledFor: job.scheduledFor ?? null,
      followUpOn: job.followUpOn ?? null,
      lastContactAt: latest(contactTimes),
      receivedAt: job.receivedAt,
      closedAt: job.closedAt ?? null,
      lostReason: job.lostReason ?? null,
      createdAt: job.receivedAt,
      updatedAt: lastActivityAt,
    });

    for (const activity of job.activities) {
      activityRows.push({
        jobId,
        type: activity.type,
        note: activity.note ?? null,
        meta: activity.meta ?? null,
        createdAt: activity.at,
      });
    }
  });

  if (technicianRows.length) await db.insert(technicians).values(technicianRows);
  if (customerRows.length) await db.insert(customers).values(customerRows);
  if (jobRows.length) await db.insert(jobs).values(jobRows);
  if (activityRows.length) await db.insert(activities).values(activityRows);

  return {
    technicians: technicianRows.length,
    customers: customerRows.length,
    jobs: jobRows.length,
    activities: activityRows.length,
  };
}

function latest(dates: Date[]): Date | null {
  if (dates.length === 0) return null;
  return new Date(Math.max(...dates.map((d) => d.getTime())));
}

function earliestReceivedAt(data: SeedData, customerKey: string): Date | null {
  const times = data.jobs.filter((j) => j.customer === customerKey).map((j) => j.receivedAt.getTime());
  return times.length ? new Date(Math.min(...times)) : null;
}
