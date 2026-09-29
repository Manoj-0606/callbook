import { describe, expect, it } from "vitest";
import { zonedDateTime } from "./dates";
import { ACTIVITY_TYPES, JOB_STATUSES, type ActivityType, type LocalDate } from "./domain";
import {
  buildTodayList,
  FOLLOW_UP_TITLES,
  followUpUpdatesFor,
  getFollowUp,
  type FollowUp,
  type FollowUpCategory,
  type FollowUpJob,
} from "./followups";

const TZ = "America/Chicago";

// Calendar used throughout (2026):
//   Mon Sep 21 … Thu 24 · Fri 25 · Sat 26 · Sun 27 · Mon 28 · Tue 29 · Wed 30 · Thu Oct 1 · Fri 2 · Mon 5
// "Now" is Tuesday Sep 29, 9:00 am in Chicago unless a test says otherwise.

/** A moment on Denise's clock. */
const at = (date: LocalDate, time = "10:00") => zonedDateTime(date, time, TZ);
const NOW = at("2026-09-29", "09:00");

let nextId = 1;
function job(overrides: Partial<FollowUpJob> = {}): FollowUpJob {
  const id = overrides.id ?? nextId++;
  return {
    id,
    customerId: id,
    status: "new",
    isEmergency: false,
    followUpOn: null,
    scheduledFor: null,
    lastContactAt: null,
    receivedAt: at("2026-09-28"),
    ...overrides,
  };
}

type RuleCase = {
  name: string;
  job: Partial<FollowUpJob>;
  now?: Date;
  expected: FollowUpCategory | null;
  details?: Partial<FollowUp>;
};

function checkRule({ job: overrides, now = NOW, expected, details }: RuleCase) {
  const result = getFollowUp(job(overrides), now, TZ);
  if (expected === null) {
    expect(result).toBeNull();
  } else {
    expect(result?.category).toBe(expected);
    if (details) expect(result).toMatchObject(details);
  }
}

describe("getFollowUp: the Today rules", () => {
  describe("New: nobody's called back yet", () => {
    it.each<RuleCase>([
      {
        name: "request that came in this morning",
        job: { status: "new", receivedAt: at("2026-09-29", "07:30") },
        expected: "new",
        details: { isEmergency: false, businessDaysSinceContact: 0 },
      },
      {
        name: "request from Friday still not called back on Tuesday",
        job: { status: "new", receivedAt: at("2026-09-25", "16:00") },
        expected: "new",
        details: { businessDaysSinceContact: 2 },
      },
      {
        name: "emergency request",
        job: { status: "new", isEmergency: true },
        expected: "new",
        details: { isEmergency: true },
      },
      {
        name: "voicemail left yesterday but still new",
        job: { status: "new", lastContactAt: at("2026-09-28") },
        expected: "new",
        details: { businessDaysSinceContact: 1 },
      },
    ])("$name", checkRule);
  });

  describe("Needs a quote: waiting on a quote from us", () => {
    it.each<RuleCase>([
      {
        name: "talked this morning: stays on the list until the quote goes out",
        job: { status: "needs_quote", lastContactAt: at("2026-09-29", "08:00") },
        expected: "needs_quote",
        details: { businessDaysSinceContact: 0 },
      },
      {
        name: "quiet for a week: still in its own section, not 'hasn't heard from us'",
        job: { status: "needs_quote", lastContactAt: at("2026-09-22") },
        expected: "needs_quote",
        details: { businessDaysSinceContact: 5 },
      },
    ])("$name", checkRule);
  });

  describe("Quote sent: waiting on the customer", () => {
    it.each<RuleCase>([
      {
        name: "sent yesterday: not on the list yet",
        job: { status: "quote_sent", lastContactAt: at("2026-09-28") },
        expected: null,
      },
      {
        name: "sent 2 business days ago (Friday): hasn't heard from us",
        job: { status: "quote_sent", lastContactAt: at("2026-09-25", "16:00") },
        expected: "gone_quiet",
        details: { businessDaysSinceContact: 2 },
      },
      {
        name: "sent Thursday, no word since",
        job: { status: "quote_sent", lastContactAt: at("2026-09-24") },
        expected: "gone_quiet",
        details: { businessDaysSinceContact: 3 },
      },
      {
        name: "no contact ever recorded: counts from when the request came in",
        job: { status: "quote_sent", lastContactAt: null, receivedAt: at("2026-09-24") },
        expected: "gone_quiet",
        details: { businessDaysSinceContact: 3 },
      },
    ])("$name", checkRule);
  });

  describe("Said yes: needs scheduling", () => {
    it.each<RuleCase>([
      {
        name: "said yes this morning",
        job: { status: "ready_to_schedule", lastContactAt: at("2026-09-29", "08:30") },
        expected: "ready_to_schedule",
      },
      {
        name: "said yes and quiet for 4 days: still 'said yes', not 'hasn't heard from us'",
        job: { status: "ready_to_schedule", lastContactAt: at("2026-09-23") },
        expected: "ready_to_schedule",
        details: { businessDaysSinceContact: 4 },
      },
    ])("$name", checkRule);
  });

  describe("Scheduled: check on visits", () => {
    it.each<RuleCase>([
      {
        name: "visit next week: nothing to do",
        job: { status: "scheduled", scheduledFor: "2026-10-05", lastContactAt: at("2026-09-28") },
        expected: null,
      },
      {
        name: "visit later today: nothing to do yet",
        job: { status: "scheduled", scheduledFor: "2026-09-29", lastContactAt: at("2026-09-28") },
        expected: null,
      },
      {
        name: "visit next week, quiet for 2 weeks: future visits never nag",
        job: { status: "scheduled", scheduledFor: "2026-10-05", lastContactAt: at("2026-09-14") },
        expected: null,
      },
      {
        name: "visit was yesterday and not marked done",
        job: { status: "scheduled", scheduledFor: "2026-09-28", lastContactAt: at("2026-09-24") },
        expected: "check_visit",
        details: { dueOn: "2026-09-28", daysOverdue: 1 },
      },
      {
        name: "visit was last Friday and quiet since: check on visits, not 'hasn't heard from us'",
        job: { status: "scheduled", scheduledFor: "2026-09-25", lastContactAt: at("2026-09-21") },
        expected: "check_visit",
        details: { dueOn: "2026-09-25", daysOverdue: 4 },
      },
      {
        name: "scheduled but missing a visit date: still surfaces once quiet",
        job: { status: "scheduled", scheduledFor: null, lastContactAt: at("2026-09-24") },
        expected: "gone_quiet",
      },
    ])("$name", checkRule);
  });

  describe("Callback dates: you said you'd call today", () => {
    it.each<RuleCase>([
      {
        name: "callback today",
        job: { status: "quote_sent", followUpOn: "2026-09-29", lastContactAt: at("2026-09-28") },
        expected: "callback_due",
        details: { dueOn: "2026-09-29", daysOverdue: 0 },
      },
      {
        name: "callback overdue since Friday",
        job: { status: "quote_sent", followUpOn: "2026-09-25", lastContactAt: at("2026-09-22") },
        expected: "callback_due",
        details: { dueOn: "2026-09-25", daysOverdue: 4 },
      },
      {
        name: "callback today on a needs-quote job: the promise comes first",
        job: { status: "needs_quote", followUpOn: "2026-09-29" },
        expected: "callback_due",
      },
      {
        name: "callback today on a visit scheduled next week",
        job: { status: "scheduled", scheduledFor: "2026-10-05", followUpOn: "2026-09-29" },
        expected: "callback_due",
      },
      {
        name: "callback today on a new request: 'new' comes first",
        job: { status: "new", followUpOn: "2026-09-29" },
        expected: "new",
      },
      {
        name: "callback overdue on a said-yes job: 'said yes' comes first",
        job: { status: "ready_to_schedule", followUpOn: "2026-09-28" },
        expected: "ready_to_schedule",
      },
    ])("$name", checkRule);
  });

  describe("Future callback date: hidden until then, overriding every other rule", () => {
    it.each<RuleCase>([
      {
        name: "hides a quote that has gone quiet",
        job: { status: "quote_sent", followUpOn: "2026-09-30", lastContactAt: at("2026-09-14") },
        expected: null,
      },
      {
        name: "hides a needs-quote job",
        job: { status: "needs_quote", followUpOn: "2026-10-01" },
        expected: null,
      },
      {
        name: "hides a new request",
        job: { status: "new", followUpOn: "2026-09-30" },
        expected: null,
      },
      {
        name: "hides an emergency (Denise chose the date)",
        job: { status: "new", isEmergency: true, followUpOn: "2026-09-30" },
        expected: null,
      },
      {
        name: "hides a said-yes job",
        job: { status: "ready_to_schedule", followUpOn: "2026-10-05" },
        expected: null,
      },
      {
        name: "hides a visit that has passed",
        job: { status: "scheduled", scheduledFor: "2026-09-25", followUpOn: "2026-09-30" },
        expected: null,
      },
    ])("$name", checkRule);
  });

  describe("Closed jobs never appear", () => {
    it.each<RuleCase>([
      { name: "done", job: { status: "done" }, expected: null },
      {
        name: "done, even with a callback due, an emergency flag and a passed visit",
        job: { status: "done", followUpOn: "2026-09-28", isEmergency: true, scheduledFor: "2026-09-25" },
        expected: null,
      },
      { name: "didn't go ahead", job: { status: "lost" }, expected: null },
      {
        name: "didn't go ahead, even when long quiet with a callback due today",
        job: { status: "lost", lastContactAt: at("2026-09-01"), followUpOn: "2026-09-29" },
        expected: null,
      },
    ])("$name", checkRule);
  });
});

describe("business days: the Friday → Monday boundary", () => {
  const quoteSentFriday = { status: "quote_sent" as const, lastContactAt: at("2026-09-25", "16:00") };
  const quoteSentThursday = { status: "quote_sent" as const, lastContactAt: at("2026-09-24", "11:00") };

  it.each<RuleCase>([
    { name: "Fri contact, same Friday evening", job: quoteSentFriday, now: at("2026-09-25", "17:00"), expected: null },
    { name: "Fri contact, Saturday", job: quoteSentFriday, now: at("2026-09-26"), expected: null },
    { name: "Fri contact, Sunday", job: quoteSentFriday, now: at("2026-09-27"), expected: null },
    {
      name: "Fri contact, Monday: only 1 business day, so Monday isn't flooded",
      job: quoteSentFriday,
      now: at("2026-09-28", "09:00"),
      expected: null,
    },
    {
      name: "Fri contact, Tuesday: 2 business days",
      job: quoteSentFriday,
      now: at("2026-09-29", "09:00"),
      expected: "gone_quiet",
      details: { businessDaysSinceContact: 2 },
    },
    {
      name: "Fri contact, Wednesday",
      job: quoteSentFriday,
      now: at("2026-09-30", "09:00"),
      expected: "gone_quiet",
      details: { businessDaysSinceContact: 3 },
    },
    { name: "Thu contact, Saturday: 1 business day", job: quoteSentThursday, now: at("2026-09-26"), expected: null },
    {
      name: "Thu contact, Monday: 2 business days",
      job: quoteSentThursday,
      now: at("2026-09-28", "09:00"),
      expected: "gone_quiet",
      details: { businessDaysSinceContact: 2 },
    },
  ])("$name", checkRule);
});

describe("dates are evaluated in Denise's timezone", () => {
  it.each<RuleCase>([
    {
      name: "a Monday 11:30 pm call counts as Monday (UTC says Tuesday), so Wednesday is 2 days",
      job: { status: "quote_sent", lastContactAt: at("2026-09-28", "23:30") },
      now: at("2026-09-30", "09:00"),
      expected: "gone_quiet",
      details: { businessDaysSinceContact: 2 },
    },
    {
      name: "at 11:30 pm Tuesday, a visit scheduled for Tuesday is still today",
      job: { status: "scheduled", scheduledFor: "2026-09-29" },
      now: at("2026-09-29", "23:30"),
      expected: null,
    },
    {
      name: "at 11:30 pm Tuesday, a Wednesday callback is still in the future",
      job: { status: "quote_sent", followUpOn: "2026-09-30", lastContactAt: at("2026-09-14") },
      now: at("2026-09-29", "23:30"),
      expected: null,
    },
    {
      name: "just after midnight Wednesday, the Wednesday callback is due",
      job: { status: "quote_sent", followUpOn: "2026-09-30", lastContactAt: at("2026-09-14") },
      now: at("2026-09-30", "00:05"),
      expected: "callback_due",
      details: { daysOverdue: 0 },
    },
    {
      name: "across the end of daylight saving: Fri contact, Monday",
      job: { status: "quote_sent", lastContactAt: at("2026-10-30", "15:00") },
      now: at("2026-11-02", "09:00"),
      expected: null,
    },
    {
      name: "across the end of daylight saving: Fri contact, Tuesday",
      job: { status: "quote_sent", lastContactAt: at("2026-10-30", "15:00") },
      now: at("2026-11-03", "09:00"),
      expected: "gone_quiet",
      details: { businessDaysSinceContact: 2 },
    },
  ])("$name", checkRule);
});

describe("waitingSince: how long each job has been waiting on us", () => {
  it.each<{ name: string; job: Partial<FollowUpJob>; expected: Date }>([
    {
      name: "new: since the request came in",
      job: { status: "new", receivedAt: at("2026-09-28", "08:15"), lastContactAt: at("2026-09-28", "12:00") },
      expected: at("2026-09-28", "08:15"),
    },
    {
      name: "needs quote: since they last heard from us",
      job: { status: "needs_quote", receivedAt: at("2026-09-21"), lastContactAt: at("2026-09-24", "14:00") },
      expected: at("2026-09-24", "14:00"),
    },
    {
      name: "needs quote, never contacted: since the request came in",
      job: { status: "needs_quote", receivedAt: at("2026-09-21", "09:45") },
      expected: at("2026-09-21", "09:45"),
    },
    {
      name: "said yes: since they last heard from us",
      job: { status: "ready_to_schedule", lastContactAt: at("2026-09-25", "11:00") },
      expected: at("2026-09-25", "11:00"),
    },
    {
      name: "callback: since the start of the promised day",
      job: { status: "quote_sent", followUpOn: "2026-09-28" },
      expected: at("2026-09-28", "00:00"),
    },
    {
      name: "check on visit: since the start of the visit day",
      job: { status: "scheduled", scheduledFor: "2026-09-25" },
      expected: at("2026-09-25", "00:00"),
    },
    {
      name: "hasn't heard from us: since they last heard from us",
      job: { status: "quote_sent", lastContactAt: at("2026-09-23", "16:20") },
      expected: at("2026-09-23", "16:20"),
    },
  ])("$name", ({ job: overrides, expected }) => {
    expect(getFollowUp(job(overrides), NOW, TZ)?.waitingSince).toEqual(expected);
  });
});

describe("buildTodayList", () => {
  it("reads like Denise's sentence", () => {
    // "These three people are waiting on a quote, this one said yes and needs
    //  scheduling, this one has not heard from us in two days."
    const list = buildTodayList(
      [
        job({ status: "needs_quote", lastContactAt: at("2026-09-24") }),
        job({ status: "needs_quote", lastContactAt: at("2026-09-25") }),
        job({ status: "needs_quote", lastContactAt: at("2026-09-28") }),
        job({ status: "ready_to_schedule", lastContactAt: at("2026-09-28") }),
        job({ status: "quote_sent", lastContactAt: at("2026-09-25") }),
        // Not on today's list:
        job({ status: "quote_sent", lastContactAt: at("2026-09-28") }),
        job({ status: "scheduled", scheduledFor: "2026-10-05" }),
        job({ status: "done" }),
        job({ status: "lost" }),
      ],
      NOW,
      TZ,
    );

    expect(list.today).toBe("2026-09-29");
    expect(list.sections.map((s) => [s.title, s.items.length])).toEqual([
      ["Said yes — needs scheduling", 1],
      ["Waiting on a quote from us", 3],
      ["Hasn't heard from us in 2+ days", 1],
    ]);
    expect(list.jobCount).toBe(5);
    expect(list.peopleCount).toBe(5);
  });

  it("orders sections the same way every time and leaves out empty ones", () => {
    const list = buildTodayList(
      [
        job({ status: "scheduled", scheduledFor: "2026-09-28" }),
        job({ status: "quote_sent", lastContactAt: at("2026-09-21") }),
        job({ status: "needs_quote" }),
        job({ status: "quote_sent", followUpOn: "2026-09-29" }),
        job({ status: "ready_to_schedule" }),
        job({ status: "new" }),
      ],
      NOW,
      TZ,
    );

    expect(list.sections.map((s) => s.category)).toEqual([
      "new",
      "ready_to_schedule",
      "callback_due",
      "needs_quote",
      "gone_quiet",
      "check_visit",
    ]);
    expect(list.sections.map((s) => s.title)).toEqual(list.sections.map((s) => FOLLOW_UP_TITLES[s.category]));
  });

  it("puts emergencies first within a section, then whoever has waited longest", () => {
    const oldest = job({ status: "needs_quote", lastContactAt: at("2026-09-21") });
    const emergencyNewest = job({ status: "needs_quote", isEmergency: true, lastContactAt: at("2026-09-28") });
    const middle = job({ status: "needs_quote", lastContactAt: at("2026-09-24") });
    const emergencyOlder = job({ status: "needs_quote", isEmergency: true, lastContactAt: at("2026-09-25") });
    const plainNewRequest = job({ status: "new" });

    const list = buildTodayList([oldest, emergencyNewest, middle, emergencyOlder, plainNewRequest], NOW, TZ);

    // Emergency is a priority within a section; it doesn't move a job to another section.
    expect(list.sections[0].items.map((i) => i.job.id)).toEqual([plainNewRequest.id]);
    expect(list.sections[1].category).toBe("needs_quote");
    expect(list.sections[1].items.map((i) => i.job.id)).toEqual([
      emergencyOlder.id,
      emergencyNewest.id,
      oldest.id,
      middle.id,
    ]);
  });

  it("applies emergency priority in every section", () => {
    const quietOld = job({ status: "quote_sent", lastContactAt: at("2026-09-14") });
    const quietEmergency = job({ status: "quote_sent", isEmergency: true, lastContactAt: at("2026-09-24") });
    const newOld = job({ status: "new", receivedAt: at("2026-09-25") });
    const newEmergency = job({ status: "new", isEmergency: true, receivedAt: at("2026-09-29", "08:00") });

    const list = buildTodayList([quietOld, quietEmergency, newOld, newEmergency], NOW, TZ);
    const ids = (category: FollowUpCategory) =>
      list.sections.find((s) => s.category === category)?.items.map((i) => i.job.id);

    expect(ids("new")).toEqual([newEmergency.id, newOld.id]);
    expect(ids("gone_quiet")).toEqual([quietEmergency.id, quietOld.id]);
  });

  it("breaks exact ties by job number so the order never shuffles", () => {
    const a = job({ id: 101, status: "needs_quote", lastContactAt: at("2026-09-24") });
    const b = job({ id: 102, status: "needs_quote", lastContactAt: at("2026-09-24") });

    expect(buildTodayList([b, a], NOW, TZ).sections[0].items.map((i) => i.job.id)).toEqual([101, 102]);
  });

  it("puts every job in at most one section, across every combination of state", () => {
    const dates: (LocalDate | null)[] = [null, "2026-09-25", "2026-09-29", "2026-10-01"]; // none, past, today, future
    const contacts = [at("2026-09-29", "08:00"), at("2026-09-21")]; // recent, long quiet
    const jobs: FollowUpJob[] = [];
    for (const status of JOB_STATUSES)
      for (const followUpOn of dates)
        for (const scheduledFor of dates)
          for (const lastContactAt of contacts)
            for (const isEmergency of [false, true])
              jobs.push(job({ status, followUpOn, scheduledFor, lastContactAt, isEmergency }));

    const list = buildTodayList(jobs, NOW, TZ);
    const listed = list.sections.flatMap((s) => s.items);
    const listedIds = listed.map((i) => i.job.id);

    expect(jobs).toHaveLength(448);
    expect(new Set(listedIds).size).toBe(listedIds.length);
    expect(list.jobCount).toBe(listedIds.length);

    for (const j of jobs) {
      const followUp = getFollowUp(j, NOW, TZ);
      const sectionsContaining = list.sections.filter((s) => s.items.some((i) => i.job.id === j.id));
      expect(sectionsContaining.map((s) => s.category)).toEqual(followUp ? [followUp.category] : []);
    }

    expect(listed.some((i) => i.job.status === "done" || i.job.status === "lost")).toBe(false);
    expect(listed.some((i) => i.job.followUpOn && i.job.followUpOn > "2026-09-29")).toBe(false);
  });

  it("counts people, not jobs: one customer with two jobs is one call", () => {
    const list = buildTodayList(
      [
        job({ customerId: 7, status: "needs_quote" }),
        job({ customerId: 7, status: "ready_to_schedule" }),
        job({ customerId: 8, status: "new" }),
      ],
      NOW,
      TZ,
    );

    expect(list.jobCount).toBe(3);
    expect(list.peopleCount).toBe(2);
  });

  it("is empty when there's nothing to do", () => {
    const list = buildTodayList(
      [job({ status: "done" }), job({ status: "quote_sent", lastContactAt: at("2026-09-29", "08:00") })],
      NOW,
      TZ,
    );

    expect(list).toEqual({ today: "2026-09-29", sections: [], jobCount: 0, peopleCount: 0 });
  });
});

describe("followUpUpdatesFor: the contact clock", () => {
  const TUESDAY_10AM = at("2026-09-29", "10:00");
  const regular = { isEmergency: false };

  // Every activity type must be listed here: TypeScript fails the build if one is missing.
  const EFFECT: Record<ActivityType, "resets clock" | "retry next business day" | "no change"> = {
    call_talked: "resets clock",
    voicemail: "resets clock",
    text: "resets clock",
    email: "resets clock",
    customer_called: "resets clock",
    quote_sent: "resets clock",
    scheduled: "resets clock",
    no_answer: "retry next business day",
    request_received: "no change",
    note: "no change",
    status_change: "no change",
    follow_up_set: "no change",
  };

  it("covers every activity type", () => {
    expect(Object.keys(EFFECT).sort()).toEqual([...ACTIVITY_TYPES].sort());
  });

  it.each(Object.entries(EFFECT) as [ActivityType, string][])("%s: %s", (type, effect) => {
    const updates = followUpUpdatesFor(type, TUESDAY_10AM, regular, TZ);
    if (effect === "resets clock") {
      expect(updates).toEqual({ lastContactAt: TUESDAY_10AM, followUpOn: null });
    } else if (effect === "retry next business day") {
      expect(updates).toEqual({ followUpOn: "2026-09-30" });
    } else {
      expect(updates).toEqual({});
    }
  });

  it.each([
    ["Friday afternoon → Monday", at("2026-10-02", "15:00"), "2026-10-05"],
    ["Friday 11:30 pm (Saturday in UTC) → Monday", at("2026-10-02", "23:30"), "2026-10-05"],
    ["Saturday → Monday", at("2026-10-03", "10:00"), "2026-10-05"],
  ])("no answer on %s", (_label, when, expected) => {
    expect(followUpUpdatesFor("no_answer", when, regular, TZ)).toEqual({ followUpOn: expected });
  });

  it("no answer on an emergency keeps it on the list", () => {
    expect(followUpUpdatesFor("no_answer", TUESDAY_10AM, { isEmergency: true }, TZ)).toEqual({});
  });

  it("no answer does not reset the contact clock (full sequence)", () => {
    const thursdayCall = at("2026-09-24", "15:00");
    let quote: FollowUpJob = job({ status: "quote_sent", lastContactAt: thursdayCall });

    // Tuesday 9 am: quiet since Thursday, so it's on the list.
    expect(getFollowUp(quote, NOW, TZ)?.category).toBe("gone_quiet");

    // Denise calls. No answer, no message.
    quote = { ...quote, ...followUpUpdatesFor("no_answer", at("2026-09-29", "09:05"), quote, TZ) };
    expect(quote.lastContactAt).toEqual(thursdayCall);
    expect(quote.followUpOn).toBe("2026-09-30");

    // Off the list for the rest of Tuesday...
    expect(getFollowUp(quote, at("2026-09-29", "14:00"), TZ)).toBeNull();

    // ...back on Wednesday, still counting from Thursday's call.
    expect(getFollowUp(quote, at("2026-09-30", "09:00"), TZ)).toMatchObject({
      category: "callback_due",
      daysOverdue: 0,
      businessDaysSinceContact: 4,
    });

    // Wednesday she leaves a voicemail. That is contact: the clock restarts.
    quote = { ...quote, ...followUpUpdatesFor("voicemail", at("2026-09-30", "09:10"), quote, TZ) };
    expect(quote.followUpOn).toBeNull();
    expect(getFollowUp(quote, at("2026-09-30", "14:00"), TZ)).toBeNull();
    expect(getFollowUp(quote, at("2026-10-01", "09:00"), TZ)).toBeNull();
    expect(getFollowUp(quote, at("2026-10-02", "09:00"), TZ)?.category).toBe("gone_quiet");
  });

  it("no answer on an emergency doesn't hide it", () => {
    let emergency = job({ status: "new", isEmergency: true, receivedAt: at("2026-09-29", "08:40") });
    emergency = { ...emergency, ...followUpUpdatesFor("no_answer", at("2026-09-29", "08:45"), emergency, TZ) };

    expect(getFollowUp(emergency, at("2026-09-29", "09:00"), TZ)?.category).toBe("new");
  });
});
