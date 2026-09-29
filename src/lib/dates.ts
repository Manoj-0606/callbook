import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import type { LocalDate } from "./domain";

/**
 * Date helpers for Denise's calendar.
 *
 * Two kinds of value:
 * - An instant (`Date`): a moment in time, e.g. when a call happened.
 * - A `LocalDate` (`YYYY-MM-DD`): a day on Denise's calendar, e.g. a callback
 *   date. It has no timezone of its own.
 *
 * Instants become local dates only through `toLocalDate`, which always takes
 * the business timezone. Arithmetic on local dates is pure calendar math and
 * never touches the server's own timezone, so results are identical on a
 * laptop in India and a Vercel server running in UTC.
 *
 * Business days are Monday to Friday. Public holidays are not excluded.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isValidLocalDate(value: string): value is LocalDate {
  if (!LOCAL_DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/** The day on Denise's calendar when `instant` happened. */
export function toLocalDate(instant: Date, timezone: string): LocalDate {
  return formatInTimeZone(instant, timezone, "yyyy-MM-dd");
}

/** Denise's "today". */
export function localToday(now: Date, timezone: string): LocalDate {
  return toLocalDate(now, timezone);
}

/** The instant a wall-clock time happens on Denise's calendar, e.g. ("2026-09-29", "09:30"). */
export function zonedDateTime(date: LocalDate, time: string, timezone: string): Date {
  return fromZonedTime(`${date}T${time}`, timezone);
}

/** The instant Denise's day starts (local midnight). */
export function startOfLocalDay(date: LocalDate, timezone: string): Date {
  return zonedDateTime(date, "00:00", timezone);
}

export function addCalendarDays(date: LocalDate, days: number): LocalDate {
  const d = parse(date);
  d.setUTCDate(d.getUTCDate() + days);
  return format(d);
}

/** Calendar days from `from` to `to`. Negative when `to` is earlier. */
export function calendarDaysBetween(from: LocalDate, to: LocalDate): number {
  return Math.round((parse(to).getTime() - parse(from).getTime()) / MS_PER_DAY);
}

/** 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(date: LocalDate): number {
  return parse(date).getUTCDay();
}

export function isBusinessDay(date: LocalDate): boolean {
  const day = dayOfWeek(date);
  return day !== 0 && day !== 6;
}

/**
 * Business days that have passed since `from`, up to and including `to`.
 * Counts each Mon–Fri day d where from < d ≤ to.
 *
 *   Mon → Wed = 2    Fri → Mon = 1    Fri → Tue = 2    Fri → Sun = 0
 *
 * Returns 0 when `to` is on or before `from`.
 */
export function businessDaysBetween(from: LocalDate, to: LocalDate): number {
  const totalDays = calendarDaysBetween(from, to);
  if (totalDays <= 0) return 0;

  const fullWeeks = Math.floor(totalDays / 7);
  let count = fullWeeks * 5;
  // Every run of 7 consecutive days holds exactly 5 business days; walk the rest.
  let day = addCalendarDays(from, fullWeeks * 7);
  for (let i = 0; i < totalDays % 7; i++) {
    day = addCalendarDays(day, 1);
    if (isBusinessDay(day)) count++;
  }
  return count;
}

/**
 * Move `days` business days forward (or back, if negative), skipping weekends.
 *
 *   Fri + 1 = Mon    Sat + 1 = Mon    Mon − 1 = Fri
 */
export function addBusinessDays(date: LocalDate, days: number): LocalDate {
  const step = days < 0 ? -1 : 1;
  let remaining = Math.abs(days);
  let current = date;
  while (remaining > 0) {
    current = addCalendarDays(current, step);
    if (isBusinessDay(current)) remaining--;
  }
  return current;
}

/** Local dates as UTC midnights: calendar math without any real timezone involved. */
function parse(date: LocalDate): Date {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function format(date: Date): LocalDate {
  return date.toISOString().slice(0, 10);
}
