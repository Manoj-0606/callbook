import { describe, expect, it } from "vitest";
import { zonedDateTime } from "./dates";
import { getFollowUp } from "./followups";
import {
  buildFilterChips,
  buildJobRow,
  buildJobsView,
  compareJobs,
  describeStanding,
  jobsHref,
  parseJobSearch,
  parseJobsQuery,
  type JobListItem,
} from "./jobs-view";

const TZ = "America/Chicago";
const at = (date: string, time = "10:00") => zonedDateTime(date, time, TZ);
const NOW = at("2026-09-29", "09:00"); // Tuesday

let nextId = 1;
function item(overrides: Partial<JobListItem> = {}): JobListItem {
  const id = overrides.id ?? nextId++;
  return {
    id,
    customerId: id,
    status: "new",
    isEmergency: false,
    description: "Walk-in cooler warm",
    source: "phone",
    referredBy: null,
    quoteAmountCents: null,
    quoteSentAt: null,
    scheduledFor: null,
    followUpOn: null,
    lastContactAt: null,
    receivedAt: at("2026-09-28", "08:00"),
    closedAt: null,
    lostReason: null,
    customer: { name: "Rosa Martinez", businessName: "Rosa's Taqueria", phone: "(512) 555-0143", email: null },
    technician: null,
    ...overrides,
  };
}

describe("parseJobsQuery", () => {
  it.each([
    [{}, { filter: "open", q: "" }],
    [{ status: "needs_quote" }, { filter: "needs_quote", q: "" }],
    [{ status: "closed", q: " sunrise " }, { filter: "closed", q: "sunrise" }],
    [{ status: "all" }, { filter: "all", q: "" }],
    [{ status: "bogus" }, { filter: "open", q: "" }],
    [{ status: ["scheduled", "new"], q: ["a", "b"] }, { filter: "scheduled", q: "a" }],
  ])("%j → %j", (params, expected) => {
    expect(parseJobsQuery(params)).toEqual(expected);
  });

  it("keeps a runaway search short", () => {
    expect(parseJobsQuery({ q: "x".repeat(500) }).q).toHaveLength(100);
  });
});

describe("jobsHref", () => {
  it.each([
    [{}, "/jobs"],
    [{ filter: "open" as const }, "/jobs"],
    [{ filter: "closed" as const }, "/jobs?status=closed"],
    [{ q: "Rosa's" }, "/jobs?q=Rosa%27s"],
    [{ filter: "scheduled" as const, q: "555 0112" }, "/jobs?status=scheduled&q=555+0112"],
  ])("%j → %s", (query, href) => {
    expect(jobsHref(query)).toBe(href);
  });
});

describe("parseJobSearch: names vs phone numbers", () => {
  it.each([
    ["", null],
    ["   ", null],
    ["sunrise", { kind: "name", text: "sunrise" }],
    ["Earl", { kind: "name", text: "Earl" }],
    ["Pier 9", { kind: "name", text: "Pier 9" }],
    ["Rosa's", { kind: "name", text: "Rosa's" }],
    ["(512) 555-0112", { kind: "phone", digits: "5125550112" }],
    ["512.555.0112", { kind: "phone", digits: "5125550112" }],
    ["+1 512 555 0112", { kind: "phone", digits: "5125550112" }],
    ["5550112", { kind: "phone", digits: "5550112" }],
    ["0112", { kind: "phone", digits: "0112" }],
    ["12", { kind: "name", text: "12" }],
  ])("%j → %j", (q, expected) => {
    expect(parseJobSearch(q)).toEqual(expected);
  });
});

describe("buildFilterChips", () => {
  const counts = { new: 2, needs_quote: 4, quote_sent: 5, ready_to_schedule: 1, scheduled: 3, done: 6, lost: 3 };

  it("counts each status, all open, closed and everything", () => {
    const chips = buildFilterChips(counts, { filter: "open", q: "" });
    expect(chips.map((c) => [c.label, c.count])).toEqual([
      ["All open", 15],
      ["New", 2],
      ["Needs a quote", 4],
      ["Quote sent", 5],
      ["Said yes", 1],
      ["Scheduled", 3],
      ["Closed", 9],
      ["Everything", 24],
    ]);
    expect(chips.filter((c) => c.current).map((c) => c.filter)).toEqual(["open"]);
  });

  it("keeps the search in every chip's link", () => {
    const chips = buildFilterChips({ needs_quote: 1, done: 3 }, { filter: "all", q: "sunrise" });
    expect(chips.find((c) => c.filter === "closed")).toMatchObject({ count: 3, href: "/jobs?status=closed&q=sunrise" });
    expect(chips.find((c) => c.filter === "all")?.current).toBe(true);
  });
});

describe("compareJobs: the list order", () => {
  it("open jobs by stage then oldest first; closed after, newest closed first", () => {
    const jobs = [
      item({ id: 1, status: "done", closedAt: at("2026-09-01") }),
      item({ id: 2, status: "scheduled" }),
      item({ id: 3, status: "new", receivedAt: at("2026-09-28") }),
      item({ id: 4, status: "lost", closedAt: at("2026-09-20") }),
      item({ id: 5, status: "new", receivedAt: at("2026-09-25") }),
      item({ id: 6, status: "needs_quote" }),
    ];
    expect([...jobs].sort(compareJobs).map((j) => j.id)).toEqual([5, 3, 6, 2, 4, 1]);
  });
});

describe("describeStanding: where a job stands, in one line", () => {
  it.each<[string, Partial<JobListItem>, string]>([
    ["new, by phone", { status: "new" }, "Phone call · Came in yesterday"],
    ["new, a referral", { status: "new", source: "referral", referredBy: "Rosa" }, "Referred by Rosa · Came in yesterday"],
    ["needs a quote, talked Thursday", { status: "needs_quote", lastContactAt: at("2026-09-24") }, "Last contact Thursday"],
    [
      "quote sent Friday, nothing since",
      { status: "quote_sent", quoteAmountCents: 385000, quoteSentAt: at("2026-09-25"), lastContactAt: at("2026-09-25") },
      "Quote $3,850 sent Friday",
    ],
    [
      "quote sent, followed up since",
      { status: "quote_sent", quoteAmountCents: 64000, quoteSentAt: at("2026-09-16"), lastContactAt: at("2026-09-28") },
      "Quote $640 sent Sep 16 · Last contact yesterday",
    ],
    [
      "said yes, with a quote",
      { status: "ready_to_schedule", quoteAmountCents: 245000, lastContactAt: at("2026-09-28") },
      "Quote $2,450 · Last contact yesterday",
    ],
    [
      "visit coming up",
      { status: "scheduled", scheduledFor: "2026-10-01", technician: { name: "Carlos Rivera" }, lastContactAt: at("2026-09-28") },
      "Visit Thursday with Carlos · Last contact yesterday",
    ],
    [
      "visit already happened",
      { status: "scheduled", scheduledFor: "2026-09-28", technician: { name: "Dave Lindqvist" }, lastContactAt: at("2026-09-24") },
      "Visit was yesterday with Dave · Last contact Thursday",
    ],
    [
      "callback set",
      { status: "needs_quote", followUpOn: "2026-10-05", lastContactAt: at("2026-09-28") },
      "Callback Monday · Last contact yesterday",
    ],
    ["done", { status: "done", closedAt: at("2026-09-15") }, "Done Sep 15"],
    [
      "didn't go ahead",
      { status: "lost", closedAt: at("2026-09-25"), lostReason: "too_expensive" },
      "Didn't go ahead Friday · Too expensive",
    ],
  ])("%s", (_label, overrides, expected) => {
    expect(describeStanding(item(overrides), NOW, TZ)).toBe(expected);
  });
});

describe("buildJobRow", () => {
  it("builds the row, opening the job's page", () => {
    expect(buildJobRow(item({ id: 12, isEmergency: true }), NOW, TZ)).toEqual({
      jobId: 12,
      href: "/jobs/12",
      name: "Rosa's Taqueria",
      contactName: "Rosa Martinez",
      contact: { kind: "phone", label: "(512) 555-0143", href: "tel:+15125550143" },
      problem: "Walk-in cooler warm",
      status: "new",
      statusLabel: "New",
      isEmergency: true,
      onToday: true,
      details: "Phone call · Came in yesterday",
    });
  });

  it.each<[string, Partial<JobListItem>]>([
    ["a new request", { status: "new" }],
    ["a quote sent yesterday", { status: "quote_sent", quoteSentAt: at("2026-09-28"), lastContactAt: at("2026-09-28") }],
    ["a quiet quote", { status: "quote_sent", quoteSentAt: at("2026-09-24"), lastContactAt: at("2026-09-24") }],
    ["a visit next week", { status: "scheduled", scheduledFor: "2026-10-05" }],
    ["a held job", { status: "needs_quote", followUpOn: "2026-10-05" }],
    ["a closed job", { status: "done", closedAt: at("2026-09-28") }],
  ])("'On today's list' agrees with the follow-up engine: %s", (_label, overrides) => {
    const job = item(overrides);
    expect(buildJobRow(job, NOW, TZ).onToday).toBe(getFollowUp(job, NOW, TZ) !== null);
  });

  it("closed emergencies aren't flagged as emergencies any more", () => {
    expect(buildJobRow(item({ status: "done", isEmergency: true, closedAt: at("2026-09-01") }), NOW, TZ).isEmergency).toBe(false);
  });
});

describe("buildJobsView", () => {
  const view = (items: JobListItem[], q = "", filter: "open" | "closed" = "open") =>
    buildJobsView({ query: { filter, q }, items, counts: { new: items.length }, openJobCount: 15 }, NOW, TZ);

  it("labels the results and the open-job count", () => {
    expect(view([item(), item()])).toMatchObject({ openJobsLabel: "15 open jobs", resultLabel: "2 jobs", empty: null });
    expect(view([item()], "rosa").resultLabel).toBe("1 job matching “rosa”");
    expect(view([item({ status: "done" })], "", "closed").resultLabel).toBe("1 job · Closed");
  });

  it("explains an empty search, and an empty filter", () => {
    expect(view([], "zzz").empty).toEqual({
      title: "No jobs match “zzz”.",
      hint: "Try part of the name, or the last four digits of the phone number.",
    });
    expect(view([], "", "closed").empty).toEqual({ title: "Nothing here right now.", hint: null });
  });
});
