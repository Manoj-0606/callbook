import { describe, expect, it } from "vitest";
import { zonedDateTime } from "./dates";
import {
  describeDay,
  describeMoment,
  firstName,
  formatLongDate,
  formatMoney,
  phoneHref,
  plural,
} from "./wording";

const TZ = "America/Chicago";
const at = (date: string, time: string) => zonedDateTime(date, time, TZ);
const TUESDAY_9AM = at("2026-09-29", "09:00");

// Calendar: Tue Sep 29 2026 is "today". Fri Sep 25 · Sat 26 · Sun 27 · Mon 28 · Wed 30 · Thu Oct 1 · Fri 2.

describe("describeDay", () => {
  it.each([
    ["2026-09-29", "today"],
    ["2026-09-28", "yesterday"],
    ["2026-09-30", "tomorrow"],
    ["2026-09-25", "Friday"],
    ["2026-09-23", "Wednesday"], // 6 days ago: still unambiguous
    ["2026-09-22", "Sep 22"], // 7 days ago would be "Tuesday", same as today
    ["2026-10-02", "Friday"], // coming up
    ["2026-10-05", "Monday"],
    ["2026-10-06", "Oct 6"],
    ["2025-12-30", "Dec 30, 2025"],
    ["2027-01-04", "Jan 4, 2027"],
  ])("%s → %s", (date, expected) => {
    expect(describeDay(date, "2026-09-29")).toBe(expected);
  });
});

describe("describeMoment", () => {
  it.each([
    ["this instant", at("2026-09-29", "09:00"), "just now"],
    ["30 seconds ago", at("2026-09-29", "08:59:30"), "just now"],
    ["1 minute ago", at("2026-09-29", "08:59"), "1 min ago"],
    ["35 minutes ago", at("2026-09-29", "08:25"), "35 min ago"],
    ["exactly an hour ago", at("2026-09-29", "08:00"), "1 hour ago"],
    ["61 minutes ago", at("2026-09-29", "07:59"), "1 hour ago"],
    ["3 hours ago", at("2026-09-29", "06:00"), "3 hours ago"],
    ["just after midnight", at("2026-09-29", "00:05"), "8 hours ago"],
    ["late last night", at("2026-09-28", "23:50"), "yesterday"],
    ["yesterday evening", at("2026-09-28", "19:42"), "yesterday"],
    ["last Friday", at("2026-09-25", "11:15"), "Friday"],
    ["12 days ago", at("2026-09-17", "10:40"), "Sep 17"],
  ])("%s → %s", (_label, instant, expected) => {
    expect(describeMoment(instant, TUESDAY_9AM, TZ)).toBe(expected);
  });

  it("uses Denise's day, not UTC's", () => {
    // 11:30 pm Tuesday in Chicago is already Wednesday in UTC.
    const lateTuesday = at("2026-09-29", "23:30");
    expect(describeMoment(at("2026-09-29", "22:00"), lateTuesday, TZ)).toBe("1 hour ago");
    expect(describeMoment(at("2026-09-29", "00:30"), lateTuesday, TZ)).toBe("23 hours ago");
    expect(describeMoment(at("2026-09-28", "22:00"), lateTuesday, TZ)).toBe("yesterday");
  });

  it("switches to 'yesterday' at local midnight, even for something 20 minutes ago", () => {
    expect(describeMoment(at("2026-09-29", "23:50"), at("2026-09-30", "00:10"), TZ)).toBe("yesterday");
  });
});

describe("formatLongDate", () => {
  it.each([
    ["2026-09-29", "Tuesday, September 29"],
    ["2027-01-01", "Friday, January 1"],
    ["2026-12-31", "Thursday, December 31"],
  ])("%s → %s", (date, expected) => {
    expect(formatLongDate(date)).toBe(expected);
  });
});

describe("formatMoney", () => {
  it.each([
    [385000, "$3,850"],
    [38000, "$380"],
    [115050, "$1,150.50"],
    [99, "$0.99"],
    [0, "$0"],
    [1234567800, "$12,345,678"],
  ])("%i cents → %s", (cents, expected) => {
    expect(formatMoney(cents)).toBe(expected);
  });
});

describe("phoneHref", () => {
  it.each([
    ["(512) 555-0143", "tel:+15125550143"],
    ["512.555.0143", "tel:+15125550143"],
    ["+1 512 555 0143", "tel:+15125550143"],
    ["555-0143", "tel:5550143"],
  ])("%s → %s", (phone, expected) => {
    expect(phoneHref(phone)).toBe(expected);
  });

  it.each([[null], [undefined], [""], ["ask for the kitchen"]])("%j → null", (phone) => {
    expect(phoneHref(phone)).toBeNull();
  });
});

describe("plural", () => {
  it.each([
    [1, "day", undefined, "1 day"],
    [4, "day", undefined, "4 days"],
    [0, "open job", undefined, "0 open jobs"],
    [1, "person", "people", "1 person"],
    [10, "person", "people", "10 people"],
  ])("%i %s", (count, singular, pluralForm, expected) => {
    expect(plural(count, singular, pluralForm)).toBe(expected);
  });
});

describe("firstName", () => {
  it.each([
    ["Dave Lindqvist", "Dave"],
    ["  Tasha   Greene ", "Tasha"],
    ["Amir", "Amir"],
  ])("%j → %s", (name, expected) => {
    expect(firstName(name)).toBe(expected);
  });
});
