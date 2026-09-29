import { afterEach, describe, expect, it } from "vitest";
import {
  addBusinessDays,
  addCalendarDays,
  businessDaysBetween,
  calendarDaysBetween,
  dayOfWeek,
  isBusinessDay,
  isValidLocalDate,
  localToday,
  startOfLocalDay,
  toLocalDate,
  zonedDateTime,
} from "./dates";

const TZ = "America/Chicago";

// Calendar used throughout (2026):
//   Thu Sep 24 · Fri 25 · Sat 26 · Sun 27 · Mon 28 · Tue 29 · Wed 30 · Thu Oct 1 · Fri 2
//   Chicago leaves daylight saving time on Sun Nov 1 (UTC−5 → UTC−6).

describe("localToday: Denise's today, not the server's", () => {
  it.each([
    ["9:00 am Tuesday", "2026-09-29T14:00:00Z", "2026-09-29"],
    ["12:30 am Tuesday (just after local midnight)", "2026-09-29T05:30:00Z", "2026-09-29"],
    ["11:59 pm Monday (UTC is already Tuesday)", "2026-09-29T04:59:00Z", "2026-09-28"],
    ["11:30 pm Tuesday (UTC is already Wednesday)", "2026-09-30T04:30:00Z", "2026-09-29"],
    ["11:30 pm in winter, UTC−6", "2026-12-01T05:30:00Z", "2026-11-30"],
  ])("%s", (_label, instant, expected) => {
    expect(localToday(new Date(instant), TZ)).toBe(expected);
  });
});

describe("zonedDateTime", () => {
  it.each([
    ["2026-09-29", "09:00", "2026-09-29T14:00:00.000Z"], // CDT, UTC−5
    ["2026-12-01", "09:00", "2026-12-01T15:00:00.000Z"], // CST, UTC−6
    ["2026-09-29", "23:30", "2026-09-30T04:30:00.000Z"],
  ])("%s %s in Chicago is %s", (date, time, expected) => {
    expect(zonedDateTime(date, time, TZ).toISOString()).toBe(expected);
  });

  it("round-trips with toLocalDate", () => {
    const instant = zonedDateTime("2026-11-01", "12:00", TZ);
    expect(toLocalDate(instant, TZ)).toBe("2026-11-01");
  });

  it("startOfLocalDay is local midnight", () => {
    expect(startOfLocalDay("2026-09-29", TZ).toISOString()).toBe("2026-09-29T05:00:00.000Z");
  });
});

describe("isValidLocalDate", () => {
  it.each([
    ["2026-09-29", true],
    ["2028-02-29", true], // leap day
    ["2026-02-29", false],
    ["2026-02-30", false],
    ["2026-13-01", false],
    ["2026-9-29", false],
    ["09/29/2026", false],
    ["", false],
  ])("%j → %s", (value, expected) => {
    expect(isValidLocalDate(value)).toBe(expected);
  });
});

describe("calendar arithmetic", () => {
  it.each([
    ["2026-09-29", 1, "2026-09-30"],
    ["2026-09-30", 1, "2026-10-01"], // month boundary
    ["2026-12-31", 1, "2027-01-01"], // year boundary
    ["2026-10-31", 2, "2026-11-02"], // across DST change
    ["2026-03-01", -1, "2026-02-28"],
  ])("addCalendarDays(%s, %i) = %s", (date, days, expected) => {
    expect(addCalendarDays(date, days)).toBe(expected);
  });

  it.each([
    ["2026-09-29", "2026-09-29", 0],
    ["2026-09-25", "2026-09-29", 4],
    ["2026-09-29", "2026-09-25", -4],
    ["2026-10-30", "2026-11-03", 4], // across DST change: still whole days
  ])("calendarDaysBetween(%s, %s) = %i", (from, to, expected) => {
    expect(calendarDaysBetween(from, to)).toBe(expected);
  });

  it.each([
    ["2026-09-26", 6, false], // Sat
    ["2026-09-27", 0, false], // Sun
    ["2026-09-28", 1, true], // Mon
    ["2026-10-02", 5, true], // Fri
  ])("%s is weekday %i, business day: %s", (date, weekday, business) => {
    expect(dayOfWeek(date)).toBe(weekday);
    expect(isBusinessDay(date)).toBe(business);
  });
});

describe("businessDaysBetween: business days passed since a date", () => {
  it.each([
    ["same day", "2026-09-28", "2026-09-28", 0],
    ["Mon → Tue", "2026-09-28", "2026-09-29", 1],
    ["Mon → Wed", "2026-09-28", "2026-09-30", 2],
    ["Fri → Sat", "2026-09-25", "2026-09-26", 0],
    ["Fri → Sun", "2026-09-25", "2026-09-27", 0],
    ["Fri → Mon (the weekend doesn't count)", "2026-09-25", "2026-09-28", 1],
    ["Fri → Tue", "2026-09-25", "2026-09-29", 2],
    ["Thu → Mon", "2026-09-24", "2026-09-28", 2],
    ["Sat → Mon", "2026-09-26", "2026-09-28", 1],
    ["Sun → Mon", "2026-09-27", "2026-09-28", 1],
    ["Fri → next Fri", "2026-09-25", "2026-10-02", 5],
    ["two full weeks", "2026-09-28", "2026-10-12", 10],
    ["across DST change, Fri → Tue", "2026-10-30", "2026-11-03", 2],
    ["across year end (holidays are not excluded)", "2026-12-30", "2027-01-04", 3],
    ["end before start", "2026-09-29", "2026-09-25", 0],
  ])("%s = %i", (_label, from, to, expected) => {
    expect(businessDaysBetween(from, to)).toBe(expected);
  });
});

describe("addBusinessDays", () => {
  it.each([
    ["Mon + 0", "2026-09-28", 0, "2026-09-28"],
    ["Tue + 1", "2026-09-29", 1, "2026-09-30"],
    ["Fri + 1 → Mon", "2026-09-25", 1, "2026-09-28"],
    ["Sat + 1 → Mon", "2026-09-26", 1, "2026-09-28"],
    ["Sun + 1 → Mon", "2026-09-27", 1, "2026-09-28"],
    ["Thu + 2 → Mon", "2026-09-24", 2, "2026-09-28"],
    ["Wed + 5 → next Wed", "2026-09-30", 5, "2026-10-07"],
    ["Mon − 1 → Fri", "2026-09-28", -1, "2026-09-25"],
    ["Tue − 2 → Fri", "2026-09-29", -2, "2026-09-25"],
    ["Sat − 1 → Fri", "2026-09-26", -1, "2026-09-25"],
  ])("%s", (_label, date, days, expected) => {
    expect(addBusinessDays(date, days)).toBe(expected);
  });

  it("is the inverse of businessDaysBetween for every weekday and distance", () => {
    for (const day of ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"]) {
      for (let n = 0; n <= 12; n++) {
        expect(businessDaysBetween(addBusinessDays(day, -n), day)).toBe(n);
      }
    }
  });
});

describe("independent of the server's own timezone", () => {
  const originalTz = process.env.TZ;
  afterEach(() => {
    process.env.TZ = originalTz;
  });

  it.each(["UTC", "Asia/Kolkata", "Pacific/Auckland", "America/Los_Angeles"])(
    "same answers when the server runs in %s",
    (serverTz) => {
      process.env.TZ = serverTz;
      expect(localToday(new Date("2026-09-30T04:30:00Z"), TZ)).toBe("2026-09-29");
      expect(businessDaysBetween("2026-09-25", "2026-09-28")).toBe(1);
      expect(addBusinessDays("2026-09-25", 1)).toBe("2026-09-28");
      expect(dayOfWeek("2026-09-26")).toBe(6);
      expect(zonedDateTime("2026-09-29", "09:00", TZ).toISOString()).toBe("2026-09-29T14:00:00.000Z");
    },
  );
});
