import { describe, expect, it } from "vitest";
import { zonedDateTime } from "./dates";
import { buildTodayList, FOLLOW_UP_CATEGORIES, getFollowUp, type FollowUpCategory } from "./followups";
import {
  buildTodayView,
  describeCustomerHint,
  describeFollowUp,
  PRIMARY_ACTIONS,
  type CardView,
  type TodayJob,
} from "./today-view";

const TZ = "America/Chicago";
const at = (date: string, time = "10:00") => zonedDateTime(date, time, TZ);
const NOW = at("2026-09-29", "09:00"); // Tuesday

// Calendar: Wed Sep 16 · Thu 17 · Fri 18 … Wed 23 · Thu 24 · Fri 25 · Mon 28 · Tue 29 (today) · Fri Oct 2

let nextId = 1;
function todayJob(overrides: Partial<TodayJob> = {}): TodayJob {
  const id = overrides.id ?? nextId++;
  return {
    id,
    customerId: id,
    status: "new",
    isEmergency: false,
    followUpOn: null,
    scheduledFor: null,
    lastContactAt: null,
    receivedAt: at("2026-09-29", "08:25"),
    description: "Walk-in cooler warm",
    source: "phone",
    referredBy: null,
    quoteAmountCents: null,
    quoteSentAt: null,
    technicianId: null,
    customer: { name: "Rosa Martinez", businessName: "Rosa's Taqueria", phone: "(512) 555-0143", email: null },
    technician: null,
    statusSince: at("2026-09-29", "08:25"),
    otherOpenJobs: 0,
    pastJobs: 0,
    ...overrides,
  };
}

const DAVE = { name: "Dave Lindqvist" };
const CARLOS = { name: "Carlos Rivera" };

type WordingCase = {
  name: string;
  job: Partial<TodayJob>;
  category: FollowUpCategory;
  reason: string;
  facts: string | null;
};

describe("describeFollowUp: Denise-friendly wording for every Today reason", () => {
  it.each<WordingCase>([
    // ── New ──
    {
      name: "phone call this morning",
      job: { status: "new", receivedAt: at("2026-09-29", "08:25"), source: "phone" },
      category: "new",
      reason: "Came in 35 min ago · Phone call",
      facts: null,
    },
    {
      name: "website form last night",
      job: { status: "new", receivedAt: at("2026-09-28", "19:42"), source: "website" },
      category: "new",
      reason: "Came in yesterday · Website form",
      facts: null,
    },
    {
      name: "referral, with who referred them",
      job: { status: "new", receivedAt: at("2026-09-25"), source: "referral", referredBy: "Rosa at Rosa's Taqueria" },
      category: "new",
      reason: "Came in Friday · Referred by Rosa at Rosa's Taqueria",
      facts: null,
    },
    {
      name: "referral, referrer unknown",
      job: { status: "new", receivedAt: at("2026-09-25"), source: "referral" },
      category: "new",
      reason: "Came in Friday · Referral",
      facts: null,
    },
    {
      name: "source 'other' is left out",
      job: { status: "new", receivedAt: at("2026-09-29", "06:00"), source: "other" },
      category: "new",
      reason: "Came in 3 hours ago",
      facts: null,
    },
    {
      name: "repeat customer calling in",
      job: { status: "new", source: "repeat" },
      category: "new",
      reason: "Came in 35 min ago · Repeat customer",
      facts: null,
    },
    {
      name: "still new, but we left a voicemail yesterday",
      job: { status: "new", receivedAt: at("2026-09-28", "08:00"), lastContactAt: at("2026-09-28", "15:00") },
      category: "new",
      reason: "Came in yesterday · Phone call",
      facts: "Last contact yesterday",
    },

    // ── Said yes ──
    {
      name: "said yes yesterday, with a quote",
      job: {
        status: "ready_to_schedule",
        statusSince: at("2026-09-28", "16:30"),
        lastContactAt: at("2026-09-28", "16:30"),
        quoteAmountCents: 245000,
      },
      category: "ready_to_schedule",
      reason: "Said yes yesterday",
      facts: "Quote $2,450",
    },
    {
      name: "said yes this morning, no quote recorded",
      job: { status: "ready_to_schedule", statusSince: at("2026-09-29", "07:00") },
      category: "ready_to_schedule",
      reason: "Said yes 2 hours ago",
      facts: null,
    },

    // ── You said you'd call ──
    {
      name: "callback today on a quote",
      job: {
        status: "quote_sent",
        followUpOn: "2026-09-29",
        quoteAmountCents: 38000,
        quoteSentAt: at("2026-09-18", "09:30"),
        lastContactAt: at("2026-09-24", "14:20"),
      },
      category: "callback_due",
      reason: "You said you'd call today",
      facts: "Quote $380 sent Sep 18 · Last contact Thursday",
    },
    {
      name: "callback overdue since Friday",
      job: {
        status: "quote_sent",
        followUpOn: "2026-09-25",
        quoteAmountCents: 115000,
        quoteSentAt: at("2026-09-17", "10:40"),
        lastContactAt: at("2026-09-23", "15:00"),
      },
      category: "callback_due",
      reason: "You said you'd call Friday · 4 days overdue",
      facts: "Quote $1,150 sent Sep 17 · Last contact Wednesday",
    },
    {
      name: "callback one day overdue",
      job: { status: "needs_quote", followUpOn: "2026-09-28" },
      category: "callback_due",
      reason: "You said you'd call yesterday · 1 day overdue",
      facts: "Needs a quote",
    },
    {
      name: "callback long overdue",
      job: { status: "needs_quote", followUpOn: "2026-09-14" },
      category: "callback_due",
      reason: "You said you'd call Sep 14 · 15 days overdue",
      facts: "Needs a quote",
    },
    {
      name: "callback on a quote with no amount recorded",
      job: { status: "quote_sent", followUpOn: "2026-09-29", quoteSentAt: at("2026-09-24") },
      category: "callback_due",
      reason: "You said you'd call today",
      facts: "Quote sent Thursday",
    },
    {
      name: "callback on a job with a visit coming up",
      job: {
        status: "scheduled",
        followUpOn: "2026-09-29",
        scheduledFor: "2026-10-02",
        technician: CARLOS,
        lastContactAt: at("2026-09-28", "11:00"),
      },
      category: "callback_due",
      reason: "You said you'd call today",
      facts: "Visit set for Friday with Carlos · Last contact yesterday",
    },
    {
      name: "callback on a visit with no technician yet",
      job: { status: "scheduled", followUpOn: "2026-09-29", scheduledFor: "2026-10-02" },
      category: "callback_due",
      reason: "You said you'd call today",
      facts: "Visit set for Friday",
    },

    // ── Waiting on a quote from us ──
    {
      name: "asked for a quote Thursday, talked the same day",
      job: {
        status: "needs_quote",
        statusSince: at("2026-09-24", "10:10"),
        lastContactAt: at("2026-09-24", "10:10"),
      },
      category: "needs_quote",
      reason: "Asked for a quote Thursday",
      facts: null,
    },
    {
      name: "asked Thursday, and they called again yesterday",
      job: {
        status: "needs_quote",
        statusSince: at("2026-09-24", "10:10"),
        lastContactAt: at("2026-09-28", "15:20"),
      },
      category: "needs_quote",
      reason: "Asked for a quote Thursday",
      facts: "Last contact yesterday",
    },

    // ── Hasn't heard from us ──
    {
      name: "quote sent Friday, nothing since",
      job: {
        status: "quote_sent",
        quoteAmountCents: 385000,
        quoteSentAt: at("2026-09-25", "11:15"),
        lastContactAt: at("2026-09-25", "11:15"),
      },
      category: "gone_quiet",
      reason: "Quote sent Friday · $3,850",
      facts: null,
    },
    {
      name: "quote sent a while ago, last contact since then",
      job: {
        status: "quote_sent",
        quoteAmountCents: 64000,
        quoteSentAt: at("2026-09-16"),
        lastContactAt: at("2026-09-25"),
      },
      category: "gone_quiet",
      reason: "Quote sent Sep 16 · $640",
      facts: "Last contact Friday",
    },
    {
      name: "quote sent with no amount recorded",
      job: { status: "quote_sent", quoteSentAt: at("2026-09-25"), lastContactAt: at("2026-09-25") },
      category: "gone_quiet",
      reason: "Quote sent Friday",
      facts: null,
    },
    {
      name: "scheduled but missing its visit date",
      job: { status: "scheduled", lastContactAt: at("2026-09-24") },
      category: "gone_quiet",
      reason: "Last contact Thursday",
      facts: null,
    },
    {
      name: "never contacted at all",
      job: { status: "quote_sent", receivedAt: at("2026-09-24") },
      category: "gone_quiet",
      reason: "Came in Thursday",
      facts: null,
    },

    // ── Check on visits ──
    {
      name: "technician was out yesterday",
      job: { status: "scheduled", scheduledFor: "2026-09-28", technician: DAVE },
      category: "check_visit",
      reason: "Dave was out yesterday",
      facts: null,
    },
    {
      name: "visit last Friday, no technician recorded",
      job: { status: "scheduled", scheduledFor: "2026-09-25" },
      category: "check_visit",
      reason: "Visit was Friday",
      facts: null,
    },
  ])("$name", ({ job: overrides, category, reason, facts }) => {
    const job = todayJob(overrides);
    const followUp = getFollowUp(job, NOW, TZ);

    // The fixture must really land in this section according to the engine.
    expect(followUp?.category).toBe(category);
    expect(describeFollowUp(job, followUp!, NOW, TZ)).toEqual({ reason, facts });
  });
});

describe("describeCustomerHint", () => {
  it.each([
    [0, 0, null],
    [1, 0, "Also has 1 other open job"],
    [2, 0, "Also has 2 other open jobs"],
    [0, 1, "Repeat customer · 1 past job"],
    [0, 3, "Repeat customer · 3 past jobs"],
    [1, 3, "Repeat customer · 3 past jobs · 1 other open job"],
  ])("%i other open, %i past → %j", (otherOpen, past, expected) => {
    expect(describeCustomerHint(otherOpen, past)).toBe(expected);
  });
});

describe("PRIMARY_ACTIONS", () => {
  it("gives every Today section its own leading action", () => {
    expect(Object.keys(PRIMARY_ACTIONS).sort()).toEqual([...FOLLOW_UP_CATEGORIES].sort());
    expect(PRIMARY_ACTIONS).toEqual({
      new: "log_call",
      ready_to_schedule: "schedule",
      callback_due: "log_call",
      needs_quote: "quote",
      gone_quiet: "log_call",
      check_visit: "done",
    });
  });
});

describe("buildTodayView", () => {
  const view = (jobs: TodayJob[], openJobCount = jobs.length) =>
    buildTodayView(buildTodayList(jobs, NOW, TZ), { openJobCount, technicians: [] }, NOW, TZ);

  it("heads the page with the date, who to call and how many jobs are open", () => {
    const v = view(
      [
        todayJob({ customerId: 1, status: "needs_quote" }),
        todayJob({ customerId: 1, status: "ready_to_schedule" }),
        todayJob({ customerId: 2, status: "new" }),
      ],
      5,
    );
    expect(v).toMatchObject({
      dateLabel: "Tuesday, September 29",
      peopleLabel: "2 people to call",
      openJobsLabel: "5 open jobs",
      isEmpty: false,
    });
  });

  it("uses the singular for one", () => {
    expect(view([todayJob({ status: "new" })], 1)).toMatchObject({
      peopleLabel: "1 person to call",
      openJobsLabel: "1 open job",
    });
  });

  it("keeps the engine's sections and card order exactly", () => {
    const jobs = [
      todayJob({ status: "needs_quote", statusSince: at("2026-09-24"), lastContactAt: at("2026-09-24") }),
      todayJob({ status: "new", isEmergency: true }),
      todayJob({ status: "scheduled", scheduledFor: "2026-09-28" }),
      todayJob({ status: "needs_quote", statusSince: at("2026-09-21"), lastContactAt: at("2026-09-21") }),
      todayJob({ status: "new", receivedAt: at("2026-09-28") }),
    ];
    const list = buildTodayList(jobs, NOW, TZ);
    const v = buildTodayView(list, { openJobCount: jobs.length, technicians: [] }, NOW, TZ);

    expect(v.sections.map((s) => [s.category, s.title, s.cards.map((c) => c.jobId)])).toEqual(
      list.sections.map((s) => [s.category, s.title, s.items.map((i) => i.job.id)]),
    );
  });

  it("builds each card from the job and customer", () => {
    const [card] = view([
      todayJob({
        id: 42,
        isEmergency: true,
        description: "Walk-in cooler at 48°F",
        otherOpenJobs: 1,
        pastJobs: 2,
      }),
    ]).sections[0].cards;

    expect(card).toEqual({
      jobId: 42,
      href: "/jobs/42",
      customerHref: "/customers/42",
      isEmergency: true,
      name: "Rosa's Taqueria",
      contactName: "Rosa Martinez",
      contact: { kind: "phone", label: "(512) 555-0143", href: "tel:+15125550143" },
      problem: "Walk-in cooler at 48°F",
      reason: "Came in 35 min ago · Phone call",
      facts: null,
      hint: "Repeat customer · 2 past jobs · 1 other open job",
      actions: {
        primary: { kind: "log_call", label: "Log call", title: "Log a call" },
        more: [
          { kind: "log_call", label: "Log call", title: "Log a call" },
          { kind: "quote", label: "Mark quote sent", title: "Record the quote" },
          { kind: "schedule", label: "Schedule", title: "Schedule a visit" },
          { kind: "callback", label: "Set callback", title: "Set a callback" },
          { kind: "note", label: "Add note", title: "Add a note" },
          { kind: "done", label: "Mark done", title: "Mark this job done" },
          { kind: "lost", label: "Didn't go ahead", title: "Didn't go ahead" },
        ],
      },
      form: {
        nextSteps: [
          { value: "needs_quote", label: "Needs a quote" },
          { value: "ready_to_schedule", label: "Said yes — needs scheduling" },
        ],
        nextStepRequired: true,
        noAnswerHint: "It's an emergency, so it stays on today's list.",
        quoteAmount: "",
        technicianId: null,
        visitOn: "2026-09-30",
      },
    });
  });

  it.each<[string, Partial<TodayJob>, Partial<CardView["form"]>]>([
    [
      "a quote with cents keeps them",
      { status: "quote_sent", quoteAmountCents: 115050, quoteSentAt: at("2026-09-28"), followUpOn: "2026-09-29" },
      { quoteAmount: "1150.50", nextStepRequired: false },
    ],
    [
      "a whole-dollar quote drops the cents",
      { status: "quote_sent", quoteAmountCents: 385000, quoteSentAt: at("2026-09-25"), lastContactAt: at("2026-09-25") },
      { quoteAmount: "3850" },
    ],
    [
      "a regular job's no-answer hint says when it comes back",
      { status: "new" },
      { noAnswerHint: "It comes back tomorrow." },
    ],
    [
      "an upcoming visit keeps its date and technician for rescheduling",
      { status: "scheduled", scheduledFor: "2026-10-02", technicianId: 3, followUpOn: "2026-09-29" },
      { visitOn: "2026-10-02", technicianId: 3, nextSteps: [] },
    ],
    [
      "a visit that already passed suggests the next business day",
      { status: "scheduled", scheduledFor: "2026-09-25" },
      { visitOn: "2026-09-30" },
    ],
  ])("form defaults: %s", (_label, overrides, expected) => {
    const [card] = view([todayJob(overrides)]).sections[0].cards;
    expect(card.form).toMatchObject(expected);
  });

  it.each<[string, Partial<TodayJob>, string, string[]]>([
    ["needs a quote", { status: "needs_quote" }, "Mark quote sent", ["log_call", "quote", "schedule", "callback", "note", "done", "lost"]],
    ["said yes", { status: "ready_to_schedule" }, "Schedule", ["log_call", "schedule", "callback", "note", "done", "lost"]],
    ["visit passed", { status: "scheduled", scheduledFor: "2026-09-25" }, "Mark done", ["log_call", "schedule", "callback", "note", "done", "lost"]],
  ])("actions for a job that %s", (_label, overrides, primaryLabel, kinds) => {
    const [card] = view([todayJob(overrides)]).sections[0].cards;
    expect(card.actions.primary.label).toBe(primaryLabel);
    expect(card.actions.more.map((a) => a.kind)).toEqual(kinds);
  });

  it("labels rescheduling and re-quoting for what they are", () => {
    const [visit] = view([todayJob({ status: "scheduled", scheduledFor: "2026-09-25" })]).sections[0].cards;
    const [quote] = view([
      todayJob({ status: "quote_sent", quoteSentAt: at("2026-09-24"), lastContactAt: at("2026-09-24") }),
    ]).sections[0].cards;

    expect(visit.actions.more.find((a) => a.kind === "schedule")).toEqual({
      kind: "schedule",
      label: "Reschedule",
      title: "Reschedule the visit",
    });
    expect(quote.actions.more.find((a) => a.kind === "quote")).toEqual({
      kind: "quote",
      label: "Update quote",
      title: "Update the quote",
    });
  });

  it("shares today's date, the technicians and the callback choices with the forms", () => {
    const v = buildTodayView(
      buildTodayList([todayJob()], NOW, TZ),
      { openJobCount: 1, technicians: [{ id: 2, name: "Carlos Rivera" }] },
      NOW,
      TZ,
    );
    expect(v.today).toBe("2026-09-29");
    expect(v.technicians).toEqual([{ id: 2, name: "Carlos Rivera" }]);
    expect(v.callbackChoices.map((c) => c.date)).toEqual(["2026-09-30", "2026-10-02", "2026-10-05"]);
  });

  it.each([
    [
      "business and person",
      { name: "Rosa Martinez", businessName: "Rosa's Taqueria" },
      "Rosa's Taqueria",
      "Rosa Martinez",
    ],
    ["business only", { name: null, businessName: "Corner Pantry" }, "Corner Pantry", null],
    ["person only", { name: "Hannah Cho", businessName: null }, "Hannah Cho", null],
    ["neither (a voicemail with just a number)", { name: null, businessName: null }, "Unknown caller", null],
  ])("names the card: %s", (_label, names, expectedName, expectedContact) => {
    const [card] = view([
      todayJob({ customer: { ...names, phone: "(512) 555-0143", email: null } }),
    ]).sections[0].cards;
    expect([card.name, card.contactName]).toEqual([expectedName, expectedContact]);
  });

  it.each([
    [
      "phone number",
      { phone: "(512) 555-0143", email: "rosa@example.com" },
      { kind: "phone", label: "(512) 555-0143", href: "tel:+15125550143" },
    ],
    [
      "email when there's no phone",
      { phone: null, email: "pat@example.com" },
      { kind: "email", label: "pat@example.com", href: "mailto:pat@example.com" },
    ],
    [
      "email when the phone field has no digits",
      { phone: "front desk", email: "pat@example.com" },
      { kind: "email", label: "pat@example.com", href: "mailto:pat@example.com" },
    ],
    ["nothing when there's neither", { phone: null, email: null }, null],
  ])("contact link: %s", (_label, contact, expected) => {
    const [card] = view([
      todayJob({ customer: { name: "Pat", businessName: "Hillcrest", ...contact } }),
    ]).sections[0].cards;
    expect(card.contact).toEqual(expected);
  });

  it("says 'all caught up' in the right words when nobody needs a call", () => {
    const quiet = todayJob({ status: "quote_sent", lastContactAt: at("2026-09-29", "08:00") });

    expect(view([quiet], 15)).toMatchObject({
      isEmpty: true,
      sections: [],
      peopleLabel: "0 people to call",
      emptyMessage: "Nobody needs a call today. 15 open jobs, all on track.",
    });
    expect(view([], 0)).toMatchObject({
      isEmpty: true,
      emptyMessage: "No open jobs right now. New requests will show up here.",
    });
  });
});
