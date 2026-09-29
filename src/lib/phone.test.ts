import { describe, expect, it } from "vitest";
import { formatPhone, phoneDigits } from "./phone";

describe("phoneDigits", () => {
  it.each([
    ["(512) 555-0143", "5125550143"],
    ["512.555.0143", "5125550143"],
    ["512-555-0143", "5125550143"],
    ["+1 512 555 0143", "5125550143"],
    ["1-512-555-0143", "5125550143"],
    ["555-0143", "5550143"],
  ])("normalizes %s to %s", (input, expected) => {
    expect(phoneDigits(input)).toBe(expected);
  });

  it.each([[null], [undefined], [""], ["call Rosa back"]])("returns null for %j", (input) => {
    expect(phoneDigits(input)).toBeNull();
  });
});

describe("formatPhone", () => {
  it.each([
    ["5125550199", "(512) 555-0199"],
    ["512.555.0199", "(512) 555-0199"],
    ["+1 512 555 0199", "(512) 555-0199"],
    ["  (512) 555-0199 ", "(512) 555-0199"],
    ["5550199", "555-0199"],
    ["+44 20 7946 0958", "+44 20 7946 0958"],
    ["ext 22", "ext 22"],
  ])("%j → %j", (input, expected) => {
    expect(formatPhone(input)).toBe(expected);
  });
});

describe("matching the same customer however the number is typed", () => {
  it("every common way of writing a number gives the same digits", () => {
    const ways = ["(512) 555-0112", "512-555-0112", "512.555.0112", "5125550112", "+1 512 555 0112", "1 (512) 555-0112"];
    expect(new Set(ways.map(phoneDigits))).toEqual(new Set(["5125550112"]));
  });

  it("a different number never matches", () => {
    expect(phoneDigits("(512) 555-0113")).not.toBe(phoneDigits("(512) 555-0112"));
  });
});
