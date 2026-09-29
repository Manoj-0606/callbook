import { describe, expect, it } from "vitest";
import { HONEYPOT_FIELD, isHoneypotFilled, parsePublicRequestInput } from "./public-request";

const TODAY = "2026-09-29";
const valid = {
  name: "Ana Ruiz",
  businessName: "Frost & Co. Deli",
  phone: "512 555 0199",
  email: "ana@frostdeli.example",
  address: "12 Elm St",
  description: "Deli case warm since lunch",
};

describe("parsePublicRequestInput", () => {
  it("accepts the public fields and always files it as a website request", () => {
    expect(parsePublicRequestInput({ ...valid, isEmergency: "yes" }, TODAY)).toEqual({
      ok: true,
      value: {
        name: "Ana Ruiz",
        businessName: "Frost & Co. Deli",
        phone: "(512) 555-0199",
        phoneDigits: "5125550199",
        email: "ana@frostdeli.example",
        address: "12 Elm St",
        description: "Deli case warm since lunch",
        source: "website",
        isEmergency: true,
        referredBy: null,
        note: null,
        callbackOn: null,
      },
    });
  });

  it("ignores internal-only fields, even if someone adds them to the request", () => {
    const tampered = parsePublicRequestInput(
      { ...valid, source: "referral", referredBy: "Me", note: "Skip the queue", callbackOn: "2026-12-01", status: "done" },
      TODAY,
    );
    expect(tampered).toMatchObject({
      ok: true,
      value: { source: "website", referredBy: null, note: null, callbackOn: null },
    });
  });

  it.each<[Record<string, string>, string]>([
    [{ businessName: "" }, "a name alone"],
    [{ name: "" }, "a business alone"],
    [{ email: "", address: "" }, "no email or address"],
  ])("accepts %j (%s)", (overrides) => {
    expect(parsePublicRequestInput({ ...valid, ...overrides }, TODAY).ok).toBe(true);
  });

  it("asks for everything that's required, in the submitter's words", () => {
    expect(parsePublicRequestInput({}, TODAY)).toEqual({
      ok: false,
      errors: {
        name: "Please enter your name or your business name.",
        phone: "Please enter a phone number so we can call you back.",
        description: "Please tell us what's wrong.",
      },
    });
  });

  it.each([
    ["name", "x".repeat(121), { name: "Please keep this under 120 characters." }],
    ["businessName", "x".repeat(121), { businessName: "Please keep this under 120 characters." }],
    ["phone", `512 555 0199 ${"x".repeat(30)}`, { phone: "Please keep this under 40 characters." }],
    ["email", `${"a".repeat(250)}@x.example`, { email: "Please keep this under 254 characters." }],
    ["address", "x".repeat(201), { address: "Please keep this under 200 characters." }],
    ["description", "x".repeat(501), { description: "Please keep this under 500 characters." }],
    ["phone", "call me", { phone: "Please check the phone number." }],
    ["email", "ana at deli", { email: "Please check the email address." }],
  ])("rejects a bad %s", (field, value, errors) => {
    expect(parsePublicRequestInput({ ...valid, [field]: value }, TODAY)).toEqual({ ok: false, errors });
  });

  it("anything but a ticked box is not an emergency", () => {
    expect(parsePublicRequestInput({ ...valid, isEmergency: "true" }, TODAY)).toMatchObject({ value: { isEmergency: false } });
    expect(parsePublicRequestInput(valid, TODAY)).toMatchObject({ value: { isEmergency: false } });
  });
});

describe("isHoneypotFilled", () => {
  it.each([
    [{}, false],
    [{ [HONEYPOT_FIELD]: "" }, false],
    [{ [HONEYPOT_FIELD]: "   " }, false],
    [{ [HONEYPOT_FIELD]: "http://cheap-pills.example" }, true],
  ])("%j → %s", (fields, expected) => {
    expect(isHoneypotFilled(fields)).toBe(expected);
  });
});
