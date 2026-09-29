import { formatInTimeZone } from "date-fns-tz";
import { calendarDaysBetween, dayOfWeek, localToday, toLocalDate } from "./dates";
import type { LocalDate } from "./domain";
import { phoneDigits } from "./phone";

/**
 * Small formatting helpers for Denise-friendly wording. No business rules
 * here: only how dates, money and counts read on screen.
 *
 * Dates within a week read as day names ("Thursday") rather than "N days
 * ago". Day names are unambiguous, whereas "4 days ago" on a Monday could mean
 * business or calendar days.
 */

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "1 day", "4 days", "1 other open job". */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/**
 * A day relative to today: "today", "yesterday", "tomorrow", a day name within
 * a week either side ("Thursday"), otherwise a date ("Sep 14", or "Dec 30, 2025"
 * in another year).
 */
export function describeDay(date: LocalDate, today: LocalDate): string {
  const daysAgo = calendarDaysBetween(date, today);
  if (daysAgo === 0) return "today";
  if (daysAgo === 1) return "yesterday";
  if (daysAgo === -1) return "tomorrow";
  if (Math.abs(daysAgo) <= 6) return WEEKDAYS[dayOfWeek(date)];

  const [year, month, day] = date.split("-").map(Number);
  const short = `${MONTHS[month - 1].slice(0, 3)} ${day}`;
  return year === Number(today.slice(0, 4)) ? short : `${short}, ${year}`;
}

/**
 * When something happened: "35 min ago" or "3 hours ago" earlier today,
 * otherwise the day, as in `describeDay`.
 */
export function describeMoment(instant: Date, now: Date, timezone: string): string {
  const today = localToday(now, timezone);
  const day = toLocalDate(instant, timezone);
  if (day !== today) return describeDay(day, today);

  const minutes = Math.floor((now.getTime() - instant.getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  return `${plural(Math.floor(minutes / 60), "hour")} ago`;
}

/** "Tuesday, September 29". */
export function formatLongDate(date: LocalDate): string {
  const [, month, day] = date.split("-").map(Number);
  return `${WEEKDAYS[dayOfWeek(date)]}, ${MONTHS[month - 1]} ${day}`;
}

/** "Wed, Sep 30". */
export function formatShortDate(date: LocalDate): string {
  const [, month, day] = date.split("-").map(Number);
  return `${weekdayName(date).slice(0, 3)}, ${MONTHS[month - 1].slice(0, 3)} ${day}`;
}

/** "Monday". */
export function weekdayName(date: LocalDate): string {
  return WEEKDAYS[dayOfWeek(date)];
}

/** "Thu, Oct 1", or "Mon, Dec 29, 2025" when it isn't this year. */
export function formatDate(date: LocalDate, today: LocalDate): string {
  const short = formatShortDate(date);
  return date.slice(0, 4) === today.slice(0, 4) ? short : `${short}, ${date.slice(0, 4)}`;
}

/** "Tue, Sep 29 · 9:05 am" on Denise's clock (with the year when it isn't this year). */
export function formatTimestamp(instant: Date, today: LocalDate, timezone: string): string {
  const time = formatInTimeZone(instant, timezone, "h:mm a").toLowerCase();
  return `${formatDate(toLocalDate(instant, timezone), today)} · ${time}`;
}

const wholeDollars = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const dollarsAndCents = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** "$3,850", or "$1,150.50" when there are cents. */
export function formatMoney(cents: number): string {
  const amount = cents / 100;
  return (Number.isInteger(amount) ? wholeDollars : dollarsAndCents).format(amount);
}

/** A tel: link that works from a phone: "(512) 555-0143" → "tel:+15125550143". */
export function phoneHref(phone: string | null | undefined): string | null {
  const digits = phoneDigits(phone);
  if (!digits) return null;
  return digits.length === 10 ? `tel:+1${digits}` : `tel:${digits}`;
}

/** "Dave Lindqvist" → "Dave". */
export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0];
}
