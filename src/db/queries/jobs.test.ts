import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { zonedDateTime } from "../../lib/dates";
import { OPEN_STATUSES, type JobStatus } from "../../lib/domain";
import type { JobFilter } from "../../lib/jobs-view";
import { createDatabase, type Database } from "../client";
import { runMigrations } from "../migrate";
import { customers, jobs } from "../schema";
import { seedDatabase } from "../seed";
import { loadJobDetail, loadJobsView, loadJobTitle } from "./jobs";
import { loadTodayView } from "./today";

const TZ = "America/Chicago";
const NOW = zonedDateTime("2026-09-29", "09:00", TZ); // Tuesday morning
let db: Database;

beforeAll(async () => {
  db = createDatabase({ url: ":memory:" });
  await runMigrations(db);
  await seedDatabase(db, NOW);
});

afterAll(() => {
  db.$client.close();
});

const list = (filter: JobFilter = "open", q = "") => loadJobsView(db, { filter, q }, NOW, TZ);
const names = async (filter: JobFilter, q: string) => (await list(filter, q)).rows.map((r) => r.name);

async function jobIdFor(businessName: string, statuses: readonly JobStatus[] = OPEN_STATUSES) {
  const [row] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .innerJoin(customers, eq(customers.id, jobs.customerId))
    .where(and(eq(customers.businessName, businessName), inArray(jobs.status, [...statuses])));
  return row.id;
}

describe("loadJobsView: the list", () => {
  it("shows every open job, grouped by stage, oldest first within a stage", async () => {
    const view = await list();
    expect(view.openJobsLabel).toBe("15 open jobs");
    expect(view.rows).toHaveLength(15);
    expect(view.rows.slice(0, 2).map((r) => r.name)).toEqual(["Bluebonnet Florist", "Rosa's Taqueria"]);

    const stages = ["new", "needs_quote", "quote_sent", "ready_to_schedule", "scheduled"];
    const order = view.rows.map((r) => stages.indexOf(r.status));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("counts each status for the chips", async () => {
    expect((await list()).chips.map((c) => [c.filter, c.count])).toEqual([
      ["open", 15],
      ["new", 2],
      ["needs_quote", 4],
      ["quote_sent", 5],
      ["ready_to_schedule", 1],
      ["scheduled", 3],
      ["closed", 9],
      ["all", 24],
    ]);
  });

  it("marks the jobs that are on today's list", async () => {
    const onToday = (await list()).rows.filter((r) => r.onToday).map((r) => r.name);
    const today = await loadTodayView(db, NOW, TZ);
    expect(onToday.sort()).toEqual(today.sections.flatMap((s) => s.cards.map((c) => c.name)).sort());
  });

  it.each<[JobFilter, number, JobStatus[]]>([
    ["new", 2, ["new"]],
    ["needs_quote", 4, ["needs_quote"]],
    ["quote_sent", 5, ["quote_sent"]],
    ["ready_to_schedule", 1, ["ready_to_schedule"]],
    ["scheduled", 3, ["scheduled"]],
    ["closed", 9, ["done", "lost"]],
    ["all", 24, ["new", "needs_quote", "quote_sent", "ready_to_schedule", "scheduled", "done", "lost"]],
  ])("filter %s: %i jobs", async (filter, count, statuses) => {
    const view = await list(filter);
    expect(view.rows).toHaveLength(count);
    expect(new Set(view.rows.map((r) => r.status))).toEqual(new Set(statuses));
    expect(view.chips.find((c) => c.current)?.filter).toBe(filter);
  });

  it("closed jobs: most recently closed first, with how they ended", async () => {
    const view = await list("closed");
    expect(view.rows[0]).toMatchObject({ name: "Parkside Coffee Co.", statusLabel: "Done", details: "Done Thursday" });
    expect(view.rows.find((r) => r.name === "Lakeview Inn")?.details).toMatch(/^Didn't go ahead .+ · Too expensive$/);
    expect(view.rows.every((r) => !r.onToday)).toBe(true);
  });
});

describe("loadJobsView: search", () => {
  it.each([
    ["business name", "sunrise", ["Sunrise Diner"]],
    ["any capitalisation", "SUNRISE diner", ["Sunrise Diner"]],
    ["contact name", "earl", ["Sunrise Diner"]],
    ["part of a name", "pines", ["Tall Pines Brewing"]],
    ["a name with an apostrophe", "rosa's", ["Rosa's Taqueria"]],
    ["full phone number", "(512) 555-0112", ["Sunrise Diner"]],
    ["formatted another way", "512.555.0112", ["Sunrise Diner"]],
    ["normalized digits", "5125550112", ["Sunrise Diner"]],
    ["with the country code", "+1 512 555 0112", ["Sunrise Diner"]],
    ["the last four digits", "0112", ["Sunrise Diner"]],
  ])("%s: %j", async (_label, q, expected) => {
    expect(await names("open", q)).toEqual(expected);
  });

  it("a partial number shared by several customers finds all of them", async () => {
    // Every demo number is (512) 555-01xx.
    expect(await names("open", "555-01")).toHaveLength(15);
  });

  it("no results", async () => {
    const view = await list("open", "zzz");
    expect(view.rows).toEqual([]);
    expect(view.chips.every((c) => c.count === 0)).toBe(true);
    expect(view.empty?.title).toBe("No jobs match “zzz”.");
  });

  it("finds closed jobs when looking at closed or everything", async () => {
    expect(await names("open", "lakeview")).toEqual([]);
    expect(await names("closed", "lakeview")).toEqual(["Lakeview Inn"]);
    expect((await list("all", "sunrise")).rows.map((r) => r.statusLabel)).toEqual(["Needs a quote", "Done", "Done", "Done"]);
  });

  it("counts on the chips follow the search", async () => {
    const chips = (await list("open", "sunrise")).chips;
    expect(chips.find((c) => c.filter === "needs_quote")?.count).toBe(1);
    expect(chips.find((c) => c.filter === "closed")?.count).toBe(3);
    expect(chips.find((c) => c.filter === "new")?.count).toBe(0);
  });

  it.each(["%", "_", "100%", "a_b"])("treats %j literally, not as a wildcard", async (q) => {
    expect(await names("all", q)).toEqual([]);
  });
});

describe("loadJobDetail", () => {
  it("returns nothing for a job that doesn't exist", async () => {
    expect(await loadJobDetail(db, 99999, NOW, TZ)).toBeNull();
    expect(await loadJobTitle(db, 99999)).toBeNull();
  });

  it("shows the customer, the job, its history and the customer's other jobs", async () => {
    const id = await jobIdFor("Sunrise Diner");
    const job = (await loadJobDetail(db, id, NOW, TZ))!;

    expect(job).toMatchObject({
      name: "Sunrise Diner",
      contactName: "Earl Whitaker",
      phone: { kind: "phone", label: "(512) 555-0112", href: "tel:+15125550112" },
      email: null,
      address: "7800 N Lamar Blvd",
      customerNotes: "Long-time customer. Earl prefers calls before 10 am or after 2 pm.",
      problem: "Ice machine making soft, cloudy ice: repair or replace?",
      status: "needs_quote",
      statusLabel: "Needs a quote",
      isEmergency: false,
      onToday: { section: "Waiting on a quote from us", reason: "Asked for a quote Friday", facts: null },
      offTodayReason: null,
    });
    expect(job.facts).toEqual([
      { label: "Status", value: "Needs a quote" },
      { label: "Equipment", value: "Ice machine" },
      { label: "Source", value: "Repeat customer" },
      { label: "Came in", value: "Fri, Sep 25 · 7:45 am" },
      { label: "Last contact", value: "Fri, Sep 25 · 8:05 am" },
    ]);
    expect(job.timeline.map((e) => e.title)).toEqual(["Request received · Repeat customer", "Called · Talked to customer"]);
    expect(job.timeline[1]).toMatchObject({
      details: ['Moved to "Needs a quote"'],
      note: "Machine is 11 years old. Wants a price to repair it and a price for a new one.",
    });
    expect(job.customerHistory.summary).toBe("Repeat customer · 3 past jobs");
    expect(job.customerHistory.jobs.map((j) => [j.problem, j.statusLabel])).toEqual([
      ["Reach-in freezer stopped overnight", "Done"],
      ["Ice machine descaled and sanitized", "Done"],
      ["Walk-in cooler thermostat replaced", "Done"],
    ]);
    expect(await loadJobTitle(db, id)).toBe("Sunrise Diner");
  });

  it("shows the whole timeline oldest first", async () => {
    const id = await jobIdFor("Lotus Noodle House");
    const job = (await loadJobDetail(db, id, NOW, TZ))!;
    expect(job.timeline.map((e) => e.title)).toEqual([
      "Request received · Repeat customer",
      "Called · Talked to customer",
      "Quote sent · $525",
      "Customer called us",
      "Scheduled Carlos for Tue, Oct 6",
    ]);
  });

  it("shows the quote, visit and how a closed job ended", async () => {
    const lakeview = (await loadJobDetail(db, await jobIdFor("Lakeview Inn", ["lost"]), NOW, TZ))!;
    expect(lakeview.facts.find((f) => f.label === "Quote")?.value).toBe("$6,200 · sent Wed, Sep 9 · 4:00 pm");
    expect(lakeview.facts.find((f) => f.label === "Closed")?.value).toBe("Didn't go ahead · Too expensive · Tue, Sep 15 · 11:00 am");
    // Tom called to say no, so the reason is recorded on that call.
    expect(lakeview.timeline.at(-1)).toMatchObject({
      title: "Customer called us",
      details: ['Moved to "Didn\'t go ahead"', "Too expensive"],
      note: "Tom said the budget isn't there this year. Maybe next spring.",
    });

    const oakEmber = (await loadJobDetail(db, await jobIdFor("Oak & Ember Grill"), NOW, TZ))!;
    expect(oakEmber.facts.find((f) => f.label === "Visit")?.value).toBe("Thu, Oct 1 · Mike Dawson");
  });

  it("a closed job can only take notes", async () => {
    const job = (await loadJobDetail(db, await jobIdFor("Parkside Coffee Co.", ["done"]), NOW, TZ))!;
    expect(job.onToday).toBeNull();
    expect(job.offTodayReason).toBe("This job is closed.");
    expect(job.actionTarget.actions).toEqual({
      primary: { kind: "note", label: "Add note", title: "Add a note" },
      more: [],
    });
  });

  it.each([
    ["Oak & Ember Grill", "Visit Thursday with Mike."],
    ["Corner Pantry", "You set a callback for Thursday."],
    ["Riverside Bistro", "Waiting to hear back from the customer."],
  ])("explains why %s isn't on today's list", async (name, reason) => {
    const job = (await loadJobDetail(db, await jobIdFor(name), NOW, TZ))!;
    expect(job.onToday).toBeNull();
    expect(job.offTodayReason).toBe(reason);
  });
});

describe("Today ↔ Job Detail", () => {
  it("every job on Today says the same thing, with the same actions, on its own page", async () => {
    const today = await loadTodayView(db, NOW, TZ);
    for (const section of today.sections) {
      for (const card of section.cards) {
        const detail = (await loadJobDetail(db, card.jobId, NOW, TZ))!;
        expect(detail.onToday, card.name).toEqual({ section: section.title, reason: card.reason, facts: card.facts });
        expect(detail.actionTarget, card.name).toEqual({
          jobId: card.jobId,
          name: card.name,
          problem: card.problem,
          actions: card.actions,
          form: card.form,
        });
        expect(detail.customerHistory.summary).toBe(card.hint);
      }
    }
  });

  it("leads with Today's action even where the status would suggest another", async () => {
    // A needs-quote job with a callback due today sits under "You said you'd call today",
    // so Today leads with "Log call", not the status's usual "Mark quote sent".
    const id = await jobIdFor("Harbor Lane Grocery");
    await db.update(jobs).set({ followUpOn: "2026-09-29" }).where(eq(jobs.id, id));
    try {
      const card = (await loadTodayView(db, NOW, TZ)).sections.flatMap((s) => s.cards).find((c) => c.jobId === id)!;
      const page = (await loadJobDetail(db, id, NOW, TZ))!;
      expect(card.actions.primary.kind).toBe("log_call");
      expect(page.actionTarget.actions.primary).toEqual(card.actions.primary);
      expect(page.onToday?.section).toBe("You said you'd call today");
    } finally {
      await db.update(jobs).set({ followUpOn: null }).where(eq(jobs.id, id));
    }
  });

  it("every open job that isn't on Today says why", async () => {
    const onToday = new Set((await loadTodayView(db, NOW, TZ)).sections.flatMap((s) => s.cards.map((c) => c.jobId)));
    for (const row of (await list()).rows.filter((r) => !onToday.has(r.jobId))) {
      const detail = (await loadJobDetail(db, row.jobId, NOW, TZ))!;
      expect(detail.onToday, row.name).toBeNull();
      expect(detail.offTodayReason, row.name).toBeTruthy();
    }
  });
});
