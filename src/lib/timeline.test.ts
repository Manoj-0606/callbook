import { describe, expect, it } from "vitest";
import type { Activity } from "../db/schema";
import { buildSeedData } from "../db/seed-data";
import { zonedDateTime } from "./dates";
import { ACTIVITY_TYPES, type ActivityType } from "./domain";
import { buildTimeline, describeActivity } from "./timeline";

const TZ = "America/Chicago";
const TODAY = "2026-09-29";
const at = (date: string, time = "09:05") => zonedDateTime(date, time, TZ);

let nextId = 1;
const activity = (overrides: Partial<Activity> & { type: ActivityType }): Pick<Activity, "id" | "type" | "note" | "meta" | "createdAt"> => ({
  id: nextId++,
  note: null,
  meta: null,
  createdAt: at("2026-09-29"),
  ...overrides,
});

describe("describeActivity: readable lines from what was recorded", () => {
  it.each<[string, Partial<Activity> & { type: ActivityType }, { title: string; details?: string[]; note?: string | null }]>([
    ["request by phone", { type: "request_received", meta: { source: "phone" } }, { title: "Request received · Phone call" }],
    ["request from the website", { type: "request_received", meta: { source: "website" } }, { title: "Request received · Website form" }],
    [
      "request with a first callback",
      { type: "request_received", meta: { source: "text", date: "2026-10-05" } },
      { title: "Request received · Text message", details: ["Callback set for Mon, Oct 5"] },
    ],
    ["request with nothing recorded about it", { type: "request_received" }, { title: "Request received" }],
    [
      "request with the voicemail text",
      { type: "request_received", meta: { source: "phone" }, note: "Walk-in at 48°F." },
      { title: "Request received · Phone call", note: "Walk-in at 48°F." },
    ],
    ["talked", { type: "call_talked" }, { title: "Called · Talked to customer" }],
    [
      "talked, and the job moved on",
      { type: "call_talked", meta: { fromStatus: "quote_sent", toStatus: "ready_to_schedule" }, note: "Go ahead." },
      { title: "Called · Talked to customer", details: ['Moved to "Said yes — needs scheduling"'], note: "Go ahead." },
    ],
    [
      "talked, with a callback",
      { type: "call_talked", meta: { date: "2026-10-01" } },
      { title: "Called · Talked to customer", details: ["Callback set for Thu, Oct 1"] },
    ],
    ["voicemail", { type: "voicemail" }, { title: "Called · Left a voicemail" }],
    ["no answer", { type: "no_answer" }, { title: "No answer" }],
    ["texted", { type: "text" }, { title: "Texted customer" }],
    ["emailed", { type: "email" }, { title: "Emailed customer" }],
    ["they called us", { type: "customer_called" }, { title: "Customer called us" }],
    [
      "quote sent",
      { type: "quote_sent", meta: { fromStatus: "needs_quote", toStatus: "quote_sent", quoteAmountCents: 385000 } },
      { title: "Quote sent · $3,850" },
    ],
    ["quote updated (already sent)", { type: "quote_sent", meta: { quoteAmountCents: 350000 } }, { title: "Quote updated · $3,500" }],
    [
      "scheduled",
      { type: "scheduled", meta: { toStatus: "scheduled", technicianId: 2, technicianName: "Carlos Rivera", date: "2026-10-01" } },
      { title: "Scheduled Carlos for Thu, Oct 1" },
    ],
    [
      "rescheduled",
      { type: "scheduled", meta: { technicianName: "Dave Lindqvist", date: "2026-10-05" } },
      { title: "Rescheduled Dave for Mon, Oct 5" },
    ],
    ["callback set", { type: "follow_up_set", meta: { date: "2026-10-05" } }, { title: "Callback set for Mon, Oct 5" }],
    [
      "note: the note is the line itself",
      { type: "note", note: "Customer asked us to call Friday" },
      { title: "Note · Customer asked us to call Friday", note: null },
    ],
    ["done", { type: "status_change", meta: { fromStatus: "scheduled", toStatus: "done" } }, { title: "Status changed · Done" }],
    [
      "didn't go ahead, with the reason",
      { type: "status_change", meta: { toStatus: "lost", lostReason: "too_expensive" } },
      { title: "Status changed · Didn't go ahead", details: ["Too expensive"] },
    ],
  ])("%s", (_label, overrides, expected) => {
    const entry = describeActivity(activity(overrides), TODAY, TZ);
    expect({ title: entry.title, details: entry.details, note: entry.note }).toEqual({
      title: expected.title,
      details: expected.details ?? [],
      note: expected.note === undefined ? (overrides.note ?? null) : expected.note,
    });
  });

  it("dates each entry on Denise's clock", () => {
    // 11:30 pm in Chicago is already the next day in UTC.
    const late = describeActivity(activity({ type: "no_answer", createdAt: at("2026-09-28", "23:30") }), TODAY, TZ);
    expect(late.when).toBe("Mon, Sep 28 · 11:30 pm");
  });

  it("adds the year to anything from another year", () => {
    const old = describeActivity(
      activity({ type: "follow_up_set", meta: { date: "2026-01-05" }, createdAt: at("2025-12-29", "14:00") }),
      TODAY,
      TZ,
    );
    expect(old.when).toBe("Mon, Dec 29, 2025 · 2:00 pm");
    expect(old.title).toBe("Callback set for Mon, Jan 5");
  });

  it("has a line for every kind of activity", () => {
    for (const type of ACTIVITY_TYPES) {
      const entry = describeActivity(activity({ type }), TODAY, TZ);
      expect(entry.title, type).not.toBe(type);
      expect(entry.title.length, type).toBeGreaterThan(0);
    }
  });

  it("never prints a missing value for anything in the demo data", () => {
    const now = at("2026-09-29");
    for (const job of buildSeedData(now).jobs) {
      const entries = buildTimeline(
        job.activities.map((a, i) => ({ id: i + 1, type: a.type, note: a.note ?? null, meta: a.meta ?? null, createdAt: a.at })),
        TODAY,
        TZ,
      );
      expect(JSON.stringify(entries)).not.toMatch(/undefined|NaN|null ·/);
    }
  });
});

describe("buildTimeline: chronological", () => {
  it("puts the oldest first, whatever order they were loaded in", () => {
    const first = activity({ type: "request_received", meta: { source: "phone" }, createdAt: at("2026-09-24", "08:00") });
    const second = activity({ type: "call_talked", createdAt: at("2026-09-24", "08:30") });
    const third = activity({ type: "no_answer", createdAt: at("2026-09-28", "10:00") });

    expect(buildTimeline([third, first, second], TODAY, TZ).map((e) => e.id)).toEqual([first.id, second.id, third.id]);
  });

  it("keeps things recorded at the same moment in the order they were saved", () => {
    const same = at("2026-09-29", "10:00");
    const a = activity({ type: "call_talked", createdAt: same });
    const b = activity({ type: "note", note: "b", createdAt: same });
    expect(buildTimeline([b, a], TODAY, TZ).map((e) => e.id)).toEqual([a.id, b.id]);
  });
});

describe("a job closed during a call", () => {
  it("shows the reason on that call", () => {
    const entry = describeActivity(
      activity({
        type: "customer_called",
        meta: { fromStatus: "quote_sent", toStatus: "lost", lostReason: "too_expensive" },
        note: "Budget isn't there this year.",
      }),
      TODAY,
      TZ,
    );
    expect(entry).toMatchObject({
      title: "Customer called us",
      details: ['Moved to "Didn\'t go ahead"', "Too expensive"],
      note: "Budget isn't there this year.",
    });
  });
});
