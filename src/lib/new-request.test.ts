import { describe, expect, it } from "vitest";
import { zonedDateTime } from "./dates";
import { getFollowUp, type FollowUpJob } from "./followups";
import {
  describeRepeatCustomer,
  planNewRequest,
  type CustomerMatch,
  type NewRequestInput,
} from "./new-request";

const TZ = "America/Chicago";
const at = (date: string, time = "09:00") => zonedDateTime(date, time, TZ);
const NOW = at("2026-09-29"); // Tuesday

const input = (overrides: Partial<NewRequestInput> = {}): NewRequestInput => ({
  businessName: "Frost & Co. Deli",
  name: "Ana Ruiz",
  phone: "(512) 555-0199",
  phoneDigits: "5125550199",
  description: "Deli case warm since lunch",
  source: "phone",
  referredBy: null,
  isEmergency: false,
  email: null,
  address: null,
  note: null,
  callbackOn: null,
  ...overrides,
});

const sunrise: CustomerMatch = {
  id: 6,
  name: "Earl Whitaker",
  businessName: "Sunrise Diner",
  email: null,
  address: "7800 N Lamar Blvd",
  openJobs: [{ id: 20, description: "Ice machine making soft, cloudy ice", status: "needs_quote" }],
  pastJobs: 3,
};

describe("planNewRequest", () => {
  it("a new customer: creates the customer, a new job and the request activity", () => {
    expect(planNewRequest(input({ email: "ana@frostdeli.example", address: "12 Elm St" }), null, NOW, TZ)).toEqual({
      customer: {
        kind: "create",
        values: {
          name: "Ana Ruiz",
          businessName: "Frost & Co. Deli",
          email: "ana@frostdeli.example",
          address: "12 Elm St",
          phone: "(512) 555-0199",
          phoneDigits: "5125550199",
        },
      },
      job: {
        description: "Deli case warm since lunch",
        source: "phone",
        referredBy: null,
        status: "new",
        isEmergency: false,
        followUpOn: null,
        receivedAt: NOW,
      },
      activity: { type: "request_received", note: null, meta: { source: "phone" }, createdAt: NOW },
      displayName: "Frost & Co. Deli",
      summary: "Added to today's list",
    });
  });

  it("a repeat customer: reuses the record and only fills in what was missing", () => {
    const plan = planNewRequest(
      input({ businessName: "Sunrise Cafe", name: "Earl", email: "earl@sunrise.example", address: "somewhere else" }),
      sunrise,
      NOW,
      TZ,
    );
    // Name and address are already on file and stay as they are; the email was missing.
    expect(plan.customer).toEqual({ kind: "existing", id: 6, fill: { email: "earl@sunrise.example" } });
    expect(plan.displayName).toBe("Sunrise Diner");
  });

  it("a repeat customer with nothing new to add changes nothing on the record", () => {
    expect(planNewRequest(input({ businessName: "Sunrise Diner", name: null }), sunrise, NOW, TZ).customer).toEqual({
      kind: "existing",
      id: 6,
      fill: {},
    });
  });

  it("from the public form: never changes an existing record, keeps what was typed on the request", () => {
    const plan = planNewRequest(
      input({ businessName: "Sunrise Cafe", name: "Earl", email: "earl@sunrise.example", address: "somewhere else" }),
      sunrise,
      NOW,
      TZ,
      { updateExistingCustomer: false },
    );
    // Sunrise has no email on file, but a stranger's typing must not fill it in.
    expect(plan.customer).toEqual({ kind: "existing", id: 6, fill: {} });
    expect(plan.activity.note).toBe(
      "Details given on the form: Name: Earl · Business: Sunrise Cafe · Email: earl@sunrise.example · Address: somewhere else",
    );
  });

  it("from the public form: nothing extra on the note when only a phone and problem were given", () => {
    const plan = planNewRequest(input({ businessName: null, name: null }), sunrise, NOW, TZ, { updateExistingCustomer: false });
    expect(plan.activity.note).toBeNull();
  });

  it("from the public form: a brand-new customer is created from what they typed, as usual", () => {
    const plan = planNewRequest(input({ email: "ana@frostdeli.example" }), null, NOW, TZ, { updateExistingCustomer: false });
    expect(plan.customer).toMatchObject({ kind: "create", values: { email: "ana@frostdeli.example" } });
    expect(plan.activity.note).toBeNull();
  });

  it("fills a missing contact name on an existing record", () => {
    const noName = { ...sunrise, name: null };
    expect(planNewRequest(input({ name: "Earl Whitaker" }), noName, NOW, TZ).customer).toMatchObject({
      fill: { name: "Earl Whitaker" },
    });
  });

  it("a later callback date goes on the request and the job, and says when it'll come up", () => {
    const plan = planNewRequest(input({ callbackOn: "2026-10-05" }), null, NOW, TZ);
    expect(plan.job.followUpOn).toBe("2026-10-05");
    expect(plan.activity.meta).toEqual({ source: "phone", date: "2026-10-05" });
    expect(plan.summary).toBe("Added · on your list Monday");
  });

  it("a callback for today still lands on today's list", () => {
    expect(planNewRequest(input({ callbackOn: "2026-09-29" }), null, NOW, TZ).summary).toBe("Added to today's list");
  });

  it("notes are recorded on the request activity", () => {
    const plan = planNewRequest(input({ note: "Voicemail: case at 50°F, deli meats inside." }), null, NOW, TZ);
    expect(plan.activity.note).toBe("Voicemail: case at 50°F, deli meats inside.");
  });

  it("keeps who referred them only for referrals", () => {
    expect(planNewRequest(input({ source: "referral", referredBy: "Earl" }), null, NOW, TZ).job.referredBy).toBe("Earl");
    expect(planNewRequest(input({ source: "phone", referredBy: "Earl" }), null, NOW, TZ).job.referredBy).toBeNull();
  });

  it("carries the emergency flag", () => {
    expect(planNewRequest(input({ isEmergency: true }), null, NOW, TZ).job.isEmergency).toBe(true);
  });

  it("falls back to the person's name, then the phone, for the confirmation", () => {
    expect(planNewRequest(input({ businessName: null }), null, NOW, TZ).displayName).toBe("Ana Ruiz");
    expect(planNewRequest(input({ businessName: null, name: null }), null, NOW, TZ).displayName).toBe("(512) 555-0199");
  });

  describe("where it lands on Today (the follow-up engine, unchanged)", () => {
    const asJob = (plan: ReturnType<typeof planNewRequest>): FollowUpJob => ({
      id: 99,
      customerId: 99,
      status: plan.job.status,
      isEmergency: plan.job.isEmergency,
      followUpOn: plan.job.followUpOn,
      scheduledFor: null,
      // Receiving a request is not contact: the plan never sets a last contact.
      lastContactAt: null,
      receivedAt: plan.job.receivedAt,
    });

    it("no callback: 'New — nobody's called back yet' right away", () => {
      expect(getFollowUp(asJob(planNewRequest(input(), null, NOW, TZ)), NOW, TZ)?.category).toBe("new");
    });

    it("a later callback: hidden until that day, then new", () => {
      const job = asJob(planNewRequest(input({ callbackOn: "2026-10-05" }), null, NOW, TZ));
      expect(getFollowUp(job, NOW, TZ)).toBeNull();
      expect(getFollowUp(job, at("2026-10-02"), TZ)).toBeNull();
      expect(getFollowUp(job, at("2026-10-05"), TZ)?.category).toBe("new");
    });

    it("the plan never counts as contact", () => {
      const plan = planNewRequest(input({ callbackOn: "2026-10-05" }), null, NOW, TZ);
      expect(plan.job).not.toHaveProperty("lastContactAt");
      expect(plan.activity.type).toBe("request_received");
    });
  });
});

describe("describeRepeatCustomer", () => {
  it("names the customer, their past jobs, and warns about the open one", () => {
    expect(describeRepeatCustomer(sunrise)).toEqual({
      customerId: 6,
      title: "Repeat customer: Sunrise Diner — 3 past jobs",
      warning: "This customer already has an open job.",
      openJobs: [{ label: "Ice machine making soft, cloudy ice (Needs a quote)", href: "/jobs/20" }],
      customerHref: "/customers/6",
      prefill: { businessName: "Sunrise Diner", name: "Earl Whitaker" },
    });
  });

  it.each<[string, Partial<CustomerMatch>, string, string | null]>([
    ["one past job, nothing open", { pastJobs: 1, openJobs: [] }, "Repeat customer: Sunrise Diner — 1 past job", null],
    [
      "no past jobs yet, one open",
      { pastJobs: 0 },
      "Existing customer: Sunrise Diner",
      "This customer already has an open job.",
    ],
    [
      "two open jobs",
      {
        openJobs: [
          { id: 20, description: "Ice machine", status: "needs_quote" },
          { id: 25, description: "Walk-in door", status: "scheduled" },
        ],
      },
      "Repeat customer: Sunrise Diner — 3 past jobs",
      "This customer already has 2 open jobs.",
    ],
    ["no business name", { businessName: null }, "Repeat customer: Earl Whitaker — 3 past jobs", "This customer already has an open job."],
  ])("%s", (_label, overrides, title, warning) => {
    const view = describeRepeatCustomer({ ...sunrise, ...overrides });
    expect([view.title, view.warning]).toEqual([title, warning]);
  });
});
