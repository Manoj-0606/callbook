import { addBusinessDays, addCalendarDays, dayOfWeek } from "./dates";
import type { LocalDate } from "./domain";
import { formatShortDate, weekdayName } from "./wording";

export type CallbackChoice = {
  key: "tomorrow" | "in_3_days" | "next_monday";
  label: string;
  date: LocalDate;
  /** "Wed, Sep 30", so each choice shows exactly which day it means. */
  dateLabel: string;
};

/**
 * Quick callback dates, counted in business days like the rest of the app,
 * so a callback never lands on a weekend:
 *
 *   Tomorrow     the next business day ("Monday" when today is Friday)
 *   In 3 days    three business days from today
 *   Next Monday  the coming Monday
 *
 * Choices that land on the same day are shown once, soonest first.
 */
export function callbackChoices(today: LocalDate): CallbackChoice[] {
  const nextBusinessDay = addBusinessDays(today, 1);
  const candidates: Omit<CallbackChoice, "dateLabel">[] = [
    {
      key: "tomorrow",
      label: nextBusinessDay === addCalendarDays(today, 1) ? "Tomorrow" : weekdayName(nextBusinessDay),
      date: nextBusinessDay,
    },
    { key: "in_3_days", label: "In 3 days", date: addBusinessDays(today, 3) },
    { key: "next_monday", label: "Next Monday", date: comingMonday(today) },
  ];

  const seen = new Set<LocalDate>();
  return candidates
    .filter((choice) => !seen.has(choice.date) && Boolean(seen.add(choice.date)))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((choice) => ({ ...choice, dateLabel: formatShortDate(choice.date) }));
}

/** The first Monday after today. */
function comingMonday(today: LocalDate): LocalDate {
  const daysAhead = ((8 - dayOfWeek(today)) % 7) || 7;
  return addCalendarDays(today, daysAhead);
}
