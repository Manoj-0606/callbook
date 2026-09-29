import { inArray } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { zonedDateTime } from "../../lib/dates";
import { OPEN_STATUSES } from "../../lib/domain";
import { createDatabase, type Database } from "../client";
import { runMigrations } from "../migrate";
import { activities, customers, jobs } from "../schema";
import { seedDatabase } from "../seed";
import { loadTodayView } from "./today";

const TZ = "America/Chicago";
const NOW = zonedDateTime("2026-09-29", "09:00", TZ); // Tuesday morning

let db: Database;

beforeEach(async () => {
  db = createDatabase({ url: ":memory:" });
  await runMigrations(db);
});

afterEach(() => {
  db.$client.close();
});

describe("loadTodayView with the demo data", () => {
  it("turns the seeded jobs into Denise's morning list, word for word", async () => {
    await seedDatabase(db, NOW);
    const view = await loadTodayView(db, NOW, TZ);

    expect(view).toMatchObject({
      dateLabel: "Tuesday, September 29",
      peopleLabel: "10 people to call",
      openJobsLabel: "15 open jobs",
      isEmpty: false,
    });

    const cards = view.sections.map((s) => [
      s.title,
      s.cards.map((c) => ({
        name: c.name,
        reason: c.reason,
        facts: c.facts,
        hint: c.hint,
        action: c.actions.primary.label,
        ...(c.isEmergency ? { isEmergency: true } : {}),
      })),
    ]);

    expect(cards).toEqual([
      [
        "New — nobody's called back yet",
        [
          {
            name: "Rosa's Taqueria",
            reason: "Came in 35 min ago · Phone call",
            facts: null,
            hint: null,
            action: "Log call",
            isEmergency: true,
          },
          {
            name: "Bluebonnet Florist",
            reason: "Came in yesterday · Website form",
            facts: null,
            hint: null,
            action: "Log call",
          },
        ],
      ],
      [
        "Said yes — needs scheduling",
        [
          {
            name: "Tall Pines Brewing",
            reason: "Said yes yesterday",
            facts: "Quote $2,450",
            hint: null,
            action: "Schedule",
          },
        ],
      ],
      [
        "You said you'd call today",
        [
          {
            name: "Casa Verde Cantina",
            reason: "You said you'd call Friday · 4 days overdue",
            facts: "Quote $1,150 sent Sep 17 · Last contact Wednesday",
            hint: null,
            action: "Log call",
          },
          {
            name: "Eastside Market",
            reason: "You said you'd call today",
            facts: "Quote $380 sent Sep 18 · Last contact Thursday",
            hint: null,
            action: "Log call",
          },
        ],
      ],
      [
        "Waiting on a quote from us",
        [
          {
            name: "Harbor Lane Grocery",
            reason: "Asked for a quote Thursday",
            facts: null,
            hint: null,
            action: "Mark quote sent",
          },
          {
            name: "Sunrise Diner",
            reason: "Asked for a quote Friday",
            facts: null,
            hint: "Repeat customer · 3 past jobs",
            action: "Mark quote sent",
          },
          {
            name: "Hillcrest Elementary (cafeteria)",
            reason: "Asked for a quote yesterday",
            facts: null,
            hint: null,
            action: "Mark quote sent",
          },
        ],
      ],
      [
        "Hasn't heard from us in 2+ days",
        [
          {
            name: "Smoke & Timber BBQ",
            reason: "Quote sent Friday · $3,850",
            facts: null,
            hint: null,
            action: "Log call",
          },
        ],
      ],
      [
        "Check on visits — did this get done?",
        [
          {
            name: "Scoops & Co. Ice Cream",
            reason: "Dave was out yesterday",
            facts: null,
            hint: null,
            action: "Mark done",
          },
        ],
      ],
    ]);
  });

  it("gives every card a contact person and a tap-to-call number", async () => {
    await seedDatabase(db, NOW);
    const view = await loadTodayView(db, NOW, TZ);
    const rosa = view.sections[0].cards[0];

    expect(rosa.contactName).toBe("Rosa Martinez");
    expect(rosa.contact).toEqual({ kind: "phone", label: "(512) 555-0143", href: "tel:+15125550143" });
    for (const card of view.sections.flatMap((s) => s.cards)) {
      expect(card.contact?.href).toMatch(/^tel:\+1512555\d{4}$/);
    }
  });

  it("counts a customer's other open jobs for the hint", async () => {
    await seedDatabase(db, NOW);
    const [sunrise] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(inArray(customers.businessName, ["Sunrise Diner"]));
    await db.insert(jobs).values({
      customerId: sunrise.id,
      description: "Walk-in door closer broken",
      source: "repeat",
      status: "scheduled",
      scheduledFor: "2026-10-05",
      receivedAt: NOW,
    });

    const view = await loadTodayView(db, NOW, TZ);
    const card = view.sections.flatMap((s) => s.cards).find((c) => c.name === "Sunrise Diner");

    expect(card?.hint).toBe("Repeat customer · 3 past jobs · 1 other open job");
    expect(view.openJobsLabel).toBe("16 open jobs");
  });

  it("only reads: loading Today changes nothing in the database", async () => {
    await seedDatabase(db, NOW);
    const snapshot = async () => ({
      jobs: await db.select().from(jobs),
      activities: await db.select().from(activities),
      customers: await db.select().from(customers),
    });

    const before = await snapshot();
    await loadTodayView(db, NOW, TZ);
    expect(await snapshot()).toEqual(before);
  });

  it("renders every day of the week without gaps in the wording", async () => {
    for (const day of ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]) {
      const now = zonedDateTime(day, "08:00", TZ);
      const fresh = createDatabase({ url: ":memory:" });
      await runMigrations(fresh);
      await seedDatabase(fresh, now);

      const view = await loadTodayView(fresh, now, TZ);
      const text = JSON.stringify(view);
      expect(view.peopleLabel, day).toBe("10 people to call");
      expect(text, day).not.toMatch(/undefined|NaN|null ·|· null/);
      fresh.$client.close();
    }
  });
});

describe("loadTodayView when there's nothing to do", () => {
  it("is empty with no jobs at all", async () => {
    const view = await loadTodayView(db, NOW, TZ);

    expect(view).toMatchObject({
      isEmpty: true,
      sections: [],
      peopleLabel: "0 people to call",
      openJobsLabel: "0 open jobs",
      emptyMessage: "No open jobs right now. New requests will show up here.",
    });
  });

  it("is 'all caught up' when every open job is waiting on a later date", async () => {
    await seedDatabase(db, NOW);
    await db.update(jobs).set({ followUpOn: "2026-12-01" }).where(inArray(jobs.status, [...OPEN_STATUSES]));

    const view = await loadTodayView(db, NOW, TZ);

    expect(view).toMatchObject({
      isEmpty: true,
      openJobsLabel: "15 open jobs",
      emptyMessage: "Nobody needs a call today. 15 open jobs, all on track.",
    });
  });
});
