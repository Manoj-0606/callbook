/**
 * Business settings. These are constants on purpose: they get tuned with
 * Denise in conversation, not through a settings screen.
 */

/**
 * How the business appears on the public "Request service" page. Placeholders:
 * the brief doesn't name Denise's company, and the number is a fictional 555-01xx one.
 */
export const BUSINESS_NAME = "Denise's Refrigeration";
export const BUSINESS_PHONE = "(512) 555-0100";

/** Denise's local timezone. Every "today" and every business-day count uses it. */
export const BUSINESS_TIMEZONE = "America/Chicago";

/**
 * "This one has not heard from us in two days."
 *
 * ASSUMPTION: Denise said "two days" without saying business or calendar days.
 * We count business days (Mon–Fri) so Friday's calls don't flood Monday's list.
 * To be confirmed with her; change the number here.
 */
export const SILENCE_BUSINESS_DAYS = 2;
