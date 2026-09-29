import { formatInTimeZone } from "date-fns-tz";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BUSINESS_TIMEZONE } from "../lib/config";
import { businessDaysBetween, localToday, toLocalDate, zonedDateTime } from "../lib/dates";
import { isOpenStatus, type LocalDate } from "../lib/domain";
import {
  buildTodayList,
  getFollowUp,
  type FollowUpCategory,
  type TodayList,
} from "../lib/followups";
import { phoneDigits } from "../lib/phone";
import { loadJobsWithTimeline, replayTimeline, storedState, type JobWithTimeline } from "../test/timeline";
import { createDatabase, type Database } from "./client";
import { runMigrations } from "./migrate";
import { resetDatabase } from "./seed";
import { buildSeedData } from "./seed-data";

const TZ = BUSINESS_TIMEZONE;

/** What Denise should see, whichever day and time the demo is seeded. */
const EXPECTED_TODAY: [FollowUpCategory, string[]][] = [
  ["new", ["Rosa's Taqueria", "Bluebonnet Florist"]], // emergency first
  ["ready_to_schedule", ["Tall Pines Brewing"]],
  ["callback_due", ["Casa Verde Cantina", "Eastside Market"]], // overdue first
  ["needs_quote", ["Harbor Lane Grocery", "Sunrise Diner", "Hillcrest Elementary (cafeteria)"]], // oldest first
  ["gone_quiet", ["Smoke & Timber BBQ"]],
  ["check_visit", ["Scoops & Co. Ice Cream"]],
];

// A representative week, Mon Sep 28 – Sun Oct 4 2026, from just after midnight to late evening.
const WEEK: LocalDate[] = [
  "2026-09-28",
  "2026-09-29",
  "2026-09-30",
  "2026-10-01",
  "2026-10-02",
  "2026-10-03",
  "2026-10-04",
];
const TIMES = ["00:15", "07:00", "12:30", "17:45", "23:30"];
const MOMENTS = WEEK.flatMap((day) =>
  TIMES.map((time) => {
    const now = zonedDateTime(day, time, TZ);
    return { label: formatInTimeZone(now, TZ, "EEE MMM d, HH:mm"), now };
  }),
);

let db: Database;

beforeAll(async () => {
  db = createDatabase({ url: ":memory:" });
  await runMigrations(db);
});

afterAll(() => {
  db.$client.close();
});


describe.each(MOMENTS)("demo seeded and opened $label", ({ now }) => {
  let rows: JobWithTimeline[];
  let list: TodayList<JobWithTimeline>;
  const today = localToday(now, TZ);
  const byBusiness = (name: string) => rows.find((r) => r.customer.businessName === name)!;
  const itemFor = (name: string) =>
    list.sections.flatMap((s) => s.items).find((i) => i.job.customer.businessName === name)!;

  beforeAll(async () => {
    await resetDatabase(db, now);
    rows = await loadJobsWithTimeline(db);
    list = buildTodayList(rows, now, TZ);
  });

  it("shows the intended Today sections, in order", () => {
    expect(
      list.sections.map((s) => [s.category, s.items.map((i) => i.job.customer.businessName)]),
    ).toEqual(EXPECTED_TODAY);
    expect(list.today).toBe(today);
    expect(list.jobCount).toBe(10);
    expect(list.peopleCount).toBe(10);

    expect(itemFor("Rosa's Taqueria").followUp.isEmergency).toBe(true);
    expect(itemFor("Eastside Market").followUp.daysOverdue).toBe(0);
    expect(itemFor("Casa Verde Cantina").followUp.daysOverdue).toBeGreaterThan(0);
    // "This one has not heard from us in two days."
    expect(itemFor("Smoke & Timber BBQ").followUp.businessDaysSinceContact).toBe(2);
    expect(itemFor("Scoops & Co. Ice Cream").followUp.daysOverdue).toBeGreaterThan(0);
  });

  it("keeps the other open jobs off Today for the intended reason", () => {
    const riverside = byBusiness("Riverside Bistro");
    expect(getFollowUp(riverside, now, TZ)).toBeNull();
    expect(businessDaysBetween(toLocalDate(riverside.lastContactAt!, TZ), today)).toBe(1);

    // Only the callback date holds these back; without it they'd be on the list.
    const cornerPantry = byBusiness("Corner Pantry");
    expect(cornerPantry.followUpOn! > today).toBe(true);
    expect(getFollowUp({ ...cornerPantry, followUpOn: null }, now, TZ)?.category).toBe("gone_quiet");

    const magnolia = byBusiness("Magnolia Bakehouse");
    expect(magnolia.followUpOn! > today).toBe(true);
    expect(getFollowUp({ ...magnolia, followUpOn: null }, now, TZ)?.category).toBe("needs_quote");

    // Upcoming visits never nag, even when quiet.
    for (const name of ["Oak & Ember Grill", "Lotus Noodle House"]) {
      const visit = rows.find((r) => r.customer.businessName === name && r.status === "scheduled")!;
      expect(visit.scheduledFor! > today).toBe(true);
      expect(getFollowUp(visit, now, TZ)).toBeNull();
    }
  });

  it("has the intended mix of open and closed jobs", () => {
    const counts = Object.fromEntries(
      (["new", "needs_quote", "quote_sent", "ready_to_schedule", "scheduled", "done", "lost"] as const).map(
        (status) => [status, rows.filter((r) => r.status === status).length],
      ),
    );
    expect(counts).toEqual({
      new: 2,
      needs_quote: 4,
      quote_sent: 5,
      ready_to_schedule: 1,
      scheduled: 3,
      done: 6,
      lost: 3,
    });
    expect(rows.filter((r) => isOpenStatus(r.status))).toHaveLength(15);
  });

  it("stores each job exactly as its own timeline says", () => {
    for (const row of rows) {
      expect({ job: row.id, ...replayTimeline(row, TZ) }).toEqual({ job: row.id, ...storedState(row) });
    }
  });

  it("dates every timeline in order, starting with the request, never in the future", () => {
    for (const row of rows) {
      const times = row.activities.map((a) => a.createdAt.getTime());
      expect(row.activities[0].type).toBe("request_received");
      expect(times[0]).toBe(row.receivedAt.getTime());
      expect(times).toEqual([...times].sort((a, b) => a - b));
      expect(Math.max(...times)).toBeLessThanOrEqual(now.getTime());
    }
  });
});

describe("demo data composition", () => {
  const data = buildSeedData(zonedDateTime("2026-09-29", "09:00", TZ));
  const jobsFor = (key: string) => data.jobs.filter((j) => j.customer === key);

  it("has 4 technicians, 20 customers and 24 jobs", () => {
    expect(data.technicians).toHaveLength(4);
    expect(data.customers).toHaveLength(20);
    expect(data.jobs).toHaveLength(24);
  });

  it("gives every customer at least one job", () => {
    for (const customer of data.customers) {
      expect(jobsFor(customer.key).length, customer.key).toBeGreaterThan(0);
    }
  });

  it("includes a repeat customer with past jobs and a new request", () => {
    const sunrise = jobsFor("sunrise");
    expect(sunrise.filter((j) => j.status === "done")).toHaveLength(3);
    expect(sunrise.filter((j) => isOpenStatus(j.status))).toHaveLength(1);
    expect(sunrise.some((j) => j.source === "repeat")).toBe(true);
  });

  it("includes open and past emergencies, and referrals with who referred them", () => {
    const emergencies = data.jobs.filter((j) => j.isEmergency);
    expect(emergencies.some((j) => isOpenStatus(j.status))).toBe(true);
    expect(emergencies.some((j) => !isOpenStatus(j.status))).toBe(true);

    const referrals = data.jobs.filter((j) => j.source === "referral");
    expect(referrals.length).toBeGreaterThanOrEqual(2);
    expect(referrals.every((j) => j.referredBy)).toBe(true);
  });

  it("uses every way a request comes in", () => {
    expect(new Set(data.jobs.map((j) => j.source))).toEqual(
      new Set(["phone", "website", "email", "text", "repeat", "referral"]),
    );
  });

  it("uses only fictional 555-01xx phone numbers, one per contact", () => {
    const phones = [...data.customers.map((c) => c.phone), ...data.technicians.map((t) => t.phone)];
    for (const phone of phones) expect(phone).toMatch(/^\(512\) 555-01\d\d$/);
    expect(new Set(phones.map(phoneDigits)).size).toBe(phones.length);
  });

  it("keeps a lost reason on every job that didn't go ahead, and only those", () => {
    for (const job of data.jobs) {
      expect(Boolean(job.lostReason), job.description).toBe(job.status === "lost");
    }
  });
});
