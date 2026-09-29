import { describe, expect, it } from "vitest";
import type { Activity } from "../db/schema";
import { buildCustomerTimeline, buildCustomerView, type CustomerDetailInput } from "./customer-view";
import { zonedDateTime } from "./dates";
import type { JobListItem } from "./jobs-view";
import { describeActivity } from "./timeline";

const TZ = "America/Chicago";
const at = (date: string, time = "10:00") => zonedDateTime(date, time, TZ);
const NOW = at("2026-09-29", "09:00"); // Tuesday
const TODAY = "2026-09-29";

const customer = {
  id: 6,
  name: "Earl Whitaker",
  businessName: "Sunrise Diner",
  phone: "(512) 555-0112",
  email: null,
  address: "7800 N Lamar Blvd",
  notes: "Prefers calls before 10 am.",
};

function job(overrides: Partial<JobListItem> & { id: number }): JobListItem {
  return {
    customerId: 6,
    status: "done",
    isEmergency: false,
    description: `Job ${overrides.id}`,
    source: "repeat",
    referredBy: null,
    quoteAmountCents: null,
    quoteSentAt: null,
    scheduledFor: null,
    followUpOn: null,
    lastContactAt: null,
    receivedAt: at("2026-06-01"),
    closedAt: null,
    lostReason: null,
    customer: { name: customer.name, businessName: customer.businessName, phone: customer.phone, email: null },
    technician: null,
    ...overrides,
  };
}

let nextActivityId = 1;
const activity = (jobId: number, overrides: Partial<Activity> & Pick<Activity, "type" | "createdAt">) => ({
  id: nextActivityId++,
  jobId,
  note: null,
  meta: null,
  ...overrides,
});

const iceMachine = job({ id: 20, status: "needs_quote", description: "Ice machine making soft, cloudy ice", receivedAt: at("2026-09-25", "07:45"), lastContactAt: at("2026-09-25", "08:05") });
const freezer = job({ id: 18, status: "done", description: "Reach-in freezer stopped overnight", receivedAt: at("2026-08-17"), closedAt: at("2026-08-17", "11:45") });
const descale = job({ id: 17, status: "done", description: "Ice machine descaled and sanitized", receivedAt: at("2026-06-15"), closedAt: at("2026-06-18", "13:20") });

const input: CustomerDetailInput = {
  customer,
  jobs: [descale, iceMachine, freezer],
  activities: [
    activity(17, { type: "request_received", meta: { source: "repeat" }, createdAt: at("2026-06-15", "09:00") }),
    activity(17, { type: "status_change", meta: { fromStatus: "scheduled", toStatus: "done" }, createdAt: at("2026-06-18", "13:20") }),
    activity(20, { type: "request_received", meta: { source: "repeat" }, createdAt: at("2026-09-25", "07:45") }),
    activity(18, { type: "status_change", meta: { toStatus: "done" }, createdAt: at("2026-08-17", "11:45") }),
    activity(20, { type: "call_talked", meta: { fromStatus: "new", toStatus: "needs_quote" }, note: "Wants two prices.", createdAt: at("2026-09-25", "08:05") }),
  ],
};

describe("buildCustomerView", () => {
  it("shows who they are and how many jobs are current and previous", () => {
    expect(buildCustomerView(input, NOW, TZ)).toMatchObject({
      customerId: 6,
      name: "Sunrise Diner",
      contactName: "Earl Whitaker",
      phone: { kind: "phone", label: "(512) 555-0112", href: "tel:+15125550112" },
      email: null,
      address: "7800 N Lamar Blvd",
      notes: "Prefers calls before 10 am.",
      summary: "1 open job · 2 previous jobs",
    });
  });

  it("splits jobs into open and previous, each linking to its own page", () => {
    const view = buildCustomerView(input, NOW, TZ);
    expect(view.openJobs.map((j) => [j.jobId, j.href, j.statusLabel])).toEqual([[20, "/jobs/20", "Needs a quote"]]);
    // Previous jobs: most recently closed first.
    expect(view.previousJobs.map((j) => [j.jobId, j.href, j.statusLabel])).toEqual([
      [18, "/jobs/18", "Done"],
      [17, "/jobs/17", "Done"],
    ]);
  });

  it.each([
    [[], "0 open jobs · 0 previous jobs"],
    [[job({ id: 1, status: "lost", closedAt: at("2026-09-01") })], "0 open jobs · 1 previous job"],
    [[job({ id: 1, status: "new" }), job({ id: 2, status: "scheduled", scheduledFor: "2026-10-05" })], "2 open jobs · 0 previous jobs"],
  ])("summary for %j", (jobs, summary) => {
    expect(buildCustomerView({ customer, jobs, activities: [] }, NOW, TZ).summary).toBe(summary);
  });

  it("names the person when there's no business", () => {
    const view = buildCustomerView({ customer: { ...customer, businessName: null }, jobs: [], activities: [] }, NOW, TZ);
    expect([view.name, view.contactName]).toEqual(["Earl Whitaker", null]);
  });
});

describe("buildCustomerTimeline: one history across every job", () => {
  it("is newest first across all jobs, each entry saying which job it belongs to", () => {
    const timeline = buildCustomerTimeline(input, TODAY, TZ);
    expect(timeline.map((e) => [e.when, e.title, e.job.label])).toEqual([
      ["Fri, Sep 25 · 8:05 am", "Called · Talked to customer", "Ice machine making soft, cloudy ice"],
      ["Fri, Sep 25 · 7:45 am", "Request received · Repeat customer", "Ice machine making soft, cloudy ice"],
      ["Mon, Aug 17 · 11:45 am", "Status changed · Done", "Reach-in freezer stopped overnight"],
      ["Thu, Jun 18 · 1:20 pm", "Status changed · Done", "Ice machine descaled and sanitized"],
      ["Mon, Jun 15 · 9:00 am", "Request received · Repeat customer", "Ice machine descaled and sanitized"],
    ]);
    expect(timeline[0].job.href).toBe("/jobs/20");
  });

  it("uses exactly the same wording as a job's own timeline", () => {
    for (const entry of buildCustomerTimeline(input, TODAY, TZ)) {
      const source = input.activities.find((a) => a.id === entry.id)!;
      const { job, ...line } = entry;
      expect(line).toEqual(describeActivity(source, TODAY, TZ));
      expect(job.jobId).toBe(source.jobId);
    }
  });

  it("keeps things recorded at the same moment in saved order (newest saved first)", () => {
    const same = at("2026-09-29", "08:00");
    const first = activity(20, { type: "call_talked", createdAt: same });
    const second = activity(20, { type: "note", note: "After the call.", createdAt: same });
    const timeline = buildCustomerTimeline({ jobs: [iceMachine], activities: [first, second] }, TODAY, TZ);
    expect(timeline.map((e) => e.id)).toEqual([second.id, first.id]);
  });

  it("only includes activities from this customer's jobs", () => {
    const stray = activity(999, { type: "note", note: "Someone else's job", createdAt: at("2026-09-29") });
    const timeline = buildCustomerTimeline({ jobs: input.jobs, activities: [...input.activities, stray] }, TODAY, TZ);
    expect(timeline.some((e) => e.id === stray.id)).toBe(false);
  });
});
