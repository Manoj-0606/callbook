import { describe, expect, it } from "vitest";
import {
  MAX_NOTE_LENGTH,
  parseCallbackInput,
  parseDoneInput,
  parseLogCallInput,
  parseLostInput,
  parseMoney,
  parseNewRequestInput,
  parseNoteInput,
  parseQuoteInput,
  parseScheduleInput,
} from "./action-inputs";

const TODAY = "2026-09-29";
const JOB = { jobId: "7" };

describe("parseMoney", () => {
  it.each([
    ["3850", 385000],
    ["$3,850", 385000],
    ["3,850.50", 385050],
    ["3850.5", 385050],
    [" $ 380 ", 38000],
    ["0.29", 29],
  ])("%j → %i cents", (raw, cents) => {
    expect(parseMoney(raw)).toEqual({ cents });
  });

  it.each([
    ["", "Enter the quote amount."],
    ["   ", "Enter the quote amount."],
    ["abc", "Enter an amount like 3,850 or 3850.50."],
    ["-500", "Enter an amount like 3,850 or 3850.50."],
    ["12.345", "Enter an amount like 3,850 or 3850.50."],
    ["0", "The amount must be more than $0."],
    ["1000000.01", "That's over $1,000,000. Check the amount."],
  ])("%j → %s", (raw, error) => {
    expect(parseMoney(raw)).toEqual({ error });
  });
});

describe("parseLogCallInput", () => {
  it("accepts a full call", () => {
    expect(
      parseLogCallInput(
        { ...JOB, outcome: "talked", nextStep: "ready_to_schedule", callbackOn: "2026-10-01", note: "  They said yes.  " },
        TODAY,
      ),
    ).toEqual({
      ok: true,
      value: { jobId: 7, outcome: "talked", nextStep: "ready_to_schedule", callbackOn: "2026-10-01", note: "They said yes." },
    });
  });

  it("treats empty optional fields as not given", () => {
    expect(parseLogCallInput({ ...JOB, outcome: "no_answer", nextStep: "", callbackOn: "", note: "   " }, TODAY)).toEqual({
      ok: true,
      value: { jobId: 7, outcome: "no_answer", nextStep: null, callbackOn: null, note: null },
    });
  });

  it("allows a callback for later today", () => {
    expect(parseLogCallInput({ ...JOB, outcome: "talked", callbackOn: TODAY }, TODAY).ok).toBe(true);
  });

  it.each([
    [{ outcome: "shouted" }, { outcome: "Choose how the call went." }],
    [{}, { outcome: "Choose how the call went." }],
    [{ outcome: "talked", nextStep: "done" }, { nextStep: "Choose what happens next." }],
    [{ outcome: "talked", callbackOn: "2026-09-28" }, { callbackOn: "That date has already passed." }],
    [{ outcome: "talked", callbackOn: "next week" }, { callbackOn: "Enter a valid date." }],
    [{ outcome: "talked", callbackOn: "2026-02-30" }, { callbackOn: "Enter a valid date." }],
    [{ outcome: "talked", note: "x".repeat(MAX_NOTE_LENGTH + 1) }, { note: "Keep the note under 2,000 characters." }],
  ])("rejects %j", (fields, errors) => {
    expect(parseLogCallInput({ ...JOB, ...fields }, TODAY)).toEqual({ ok: false, errors });
  });

  it.each([[{}], [{ jobId: "" }], [{ jobId: "abc" }], [{ jobId: "0" }], [{ jobId: "-3" }], [{ jobId: "1.5" }]])(
    "rejects a missing or bad job id %j",
    (fields) => {
      const result = parseLogCallInput({ outcome: "talked", ...fields }, TODAY);
      expect(result).toEqual({
        ok: false,
        errors: { form: "We couldn't tell which job this is. Reload the page and try again." },
      });
    },
  );
});

describe("parseQuoteInput", () => {
  it("accepts an amount", () => {
    expect(parseQuoteInput({ ...JOB, amount: "$2,450", note: "Switch and recharge." })).toEqual({
      ok: true,
      value: { jobId: 7, amountCents: 245000, note: "Switch and recharge." },
    });
  });

  it("requires a real amount", () => {
    expect(parseQuoteInput({ ...JOB, amount: "" })).toEqual({ ok: false, errors: { amount: "Enter the quote amount." } });
  });
});

describe("parseScheduleInput", () => {
  it("accepts a technician and a date from today on", () => {
    expect(parseScheduleInput({ ...JOB, technicianId: "2", visitOn: TODAY }, TODAY)).toEqual({
      ok: true,
      value: { jobId: 7, technicianId: 2, visitOn: TODAY, note: null },
    });
  });

  it.each([
    [{ visitOn: "2026-10-01" }, { technicianId: "Pick a technician." }],
    [{ technicianId: "x", visitOn: "2026-10-01" }, { technicianId: "Pick a technician." }],
    [{ technicianId: "2" }, { visitOn: "Pick the visit date." }],
    [{ technicianId: "2", visitOn: "2026-09-25" }, { visitOn: "That date has already passed." }],
    [{}, { technicianId: "Pick a technician.", visitOn: "Pick the visit date." }],
  ])("rejects %j", (fields, errors) => {
    expect(parseScheduleInput({ ...JOB, ...fields }, TODAY)).toEqual({ ok: false, errors });
  });
});

describe("parseCallbackInput", () => {
  it("accepts a future date", () => {
    expect(parseCallbackInput({ ...JOB, callbackOn: "2026-10-05" }, TODAY)).toEqual({
      ok: true,
      value: { jobId: 7, callbackOn: "2026-10-05", note: null },
    });
  });

  it.each([
    [{}, { callbackOn: "Pick when to call back." }],
    [{ callbackOn: "" }, { callbackOn: "Pick when to call back." }],
    [{ callbackOn: "2026-09-01" }, { callbackOn: "That date has already passed." }],
  ])("rejects %j", (fields, errors) => {
    expect(parseCallbackInput({ ...JOB, ...fields }, TODAY)).toEqual({ ok: false, errors });
  });
});

describe("parseLostInput", () => {
  it("accepts a reason once confirmed", () => {
    expect(parseLostInput({ ...JOB, reason: "went_elsewhere", confirmed: "yes" })).toEqual({
      ok: true,
      value: { jobId: 7, reason: "went_elsewhere", note: null },
    });
  });

  it.each([
    [{ confirmed: "yes" }, { reason: "Pick a reason." }],
    [{ reason: "bad_vibes", confirmed: "yes" }, { reason: "Pick a reason." }],
    [{ reason: "too_expensive" }, { form: "Confirm that you want to close this job." }],
    [{ reason: "too_expensive", confirmed: "no" }, { form: "Confirm that you want to close this job." }],
  ])("rejects %j", (fields, errors) => {
    expect(parseLostInput({ ...JOB, ...fields })).toEqual({ ok: false, errors });
  });
});

describe("parseNoteInput", () => {
  it("accepts a note", () => {
    expect(parseNoteInput({ ...JOB, note: "Gate code 4411." })).toEqual({ ok: true, value: { jobId: 7, note: "Gate code 4411." } });
  });

  it.each([[{}], [{ note: "" }], [{ note: "   \n  " }]])("requires some text %j", (fields) => {
    expect(parseNoteInput({ ...JOB, ...fields })).toEqual({ ok: false, errors: { note: "Write the note first." } });
  });
});

describe("parseDoneInput", () => {
  it("needs only the job; the note is optional", () => {
    expect(parseDoneInput(JOB)).toEqual({ ok: true, value: { jobId: 7, note: null } });
  });
});

describe("parseNewRequestInput", () => {
  const valid = {
    phone: "5125550199",
    businessName: "Frost & Co. Deli",
    name: "",
    description: "Deli case warm since lunch",
    source: "phone",
  };

  it("accepts the required fields, tidying the phone number", () => {
    expect(parseNewRequestInput(valid, TODAY)).toEqual({
      ok: true,
      value: {
        businessName: "Frost & Co. Deli",
        name: null,
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
      },
    });
  });

  it("accepts every optional field", () => {
    const result = parseNewRequestInput(
      {
        ...valid,
        name: " Ana Ruiz ",
        source: "referral",
        referredBy: "Earl at Sunrise Diner",
        isEmergency: "yes",
        email: "ana@frostdeli.example",
        address: "12 Elm St",
        note: "Deli meats inside.",
        callbackOn: "2026-10-05",
      },
      TODAY,
    );
    expect(result).toMatchObject({
      ok: true,
      value: {
        name: "Ana Ruiz",
        source: "referral",
        referredBy: "Earl at Sunrise Diner",
        isEmergency: true,
        email: "ana@frostdeli.example",
        address: "12 Elm St",
        note: "Deli meats inside.",
        callbackOn: "2026-10-05",
      },
    });
  });

  it("a contact name alone is enough", () => {
    expect(parseNewRequestInput({ ...valid, businessName: "", name: "Ana Ruiz" }, TODAY).ok).toBe(true);
  });

  it("shows every missing required field at once", () => {
    expect(parseNewRequestInput({}, TODAY)).toEqual({
      ok: false,
      errors: {
        businessName: "Enter the business or the person's name.",
        phone: "Enter a phone number.",
        description: "Say what's wrong.",
        source: "Pick where this came from.",
      },
    });
  });

  it.each([
    [{ phone: "call me" }, { phone: "That doesn't look like a phone number." }],
    [{ phone: "555-01" }, { phone: "That doesn't look like a phone number." }],
    [{ phone: "1234567890123456" }, { phone: "That doesn't look like a phone number." }],
    [{ businessName: "   ", name: "  " }, { businessName: "Enter the business or the person's name." }],
    [{ businessName: "x".repeat(121) }, { businessName: "Keep this under 120 characters." }],
    [{ description: "   " }, { description: "Say what's wrong." }],
    [{ description: "x".repeat(501) }, { description: "Keep this under 500 characters. Put the rest in the notes." }],
    [{ source: "carrier_pigeon" }, { source: "Pick where this came from." }],
    [{ email: "ana at deli" }, { email: "Check the email address." }],
    [{ callbackOn: "2026-09-28" }, { callbackOn: "That date has already passed." }],
    [{ callbackOn: "soon" }, { callbackOn: "Enter a valid date." }],
  ])("rejects %j", (fields, errors) => {
    expect(parseNewRequestInput({ ...valid, ...fields }, TODAY)).toEqual({ ok: false, errors });
  });

  it("treats anything but a ticked box as not an emergency", () => {
    expect(parseNewRequestInput({ ...valid, isEmergency: "on" }, TODAY)).toMatchObject({ value: { isEmergency: false } });
    expect(parseNewRequestInput({ ...valid, isEmergency: "yes" }, TODAY)).toMatchObject({ value: { isEmergency: true } });
  });
});

describe("parseNewRequestInput: length limits on every field", () => {
  const valid = { phone: "5125550199", businessName: "Frost & Co. Deli", description: "Deli case warm", source: "phone" };

  it.each([
    [{ phone: `512 555 0199 ${"x".repeat(30)}` }, { phone: "Keep this under 40 characters." }],
    [{ email: `${"a".repeat(250)}@x.example` }, { email: "Keep this under 254 characters." }],
    [{ name: "x".repeat(121) }, { name: "Keep this under 120 characters." }],
    [{ referredBy: "x".repeat(121) }, { referredBy: "Keep this under 120 characters." }],
    [{ address: "x".repeat(201) }, { address: "Keep this under 200 characters." }],
  ])("rejects %j", (fields, errors) => {
    expect(parseNewRequestInput({ ...valid, ...fields }, TODAY)).toEqual({ ok: false, errors });
  });
});
