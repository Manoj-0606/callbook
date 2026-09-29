import { isValidLocalDate } from "./dates";
import { JOB_SOURCES, LOST_REASONS, type JobSource, type LocalDate, type LostReason } from "./domain";
import type { NewRequestInput } from "./new-request";
import { formatPhone, phoneDigits } from "./phone";
import type {
  CallbackInput,
  CallOutcome,
  DoneInput,
  LogCallInput,
  LostInput,
  NextStep,
  NoteInput,
  QuoteInput,
} from "./job-actions";

/**
 * Validates what the action forms send. Everything arrives as strings. These
 * turn it into typed input or into messages to show beside the fields.
 * Rules that depend on the job itself live in job-actions.ts.
 */

export type Fields = Record<string, string | undefined>;
export type FieldErrors = Record<string, string>;
export type Parsed<T> = { ok: true; value: T } | { ok: false; errors: FieldErrors };

type WithJob<T> = T & { jobId: number };

export const MAX_NOTE_LENGTH = 2000;
const MAX_QUOTE_CENTS = 1_000_000 * 100;

const OUTCOMES: readonly CallOutcome[] = ["talked", "voicemail", "no_answer"];
const NEXT_STEP_VALUES: readonly NextStep[] = ["needs_quote", "ready_to_schedule"];

export function parseLogCallInput(fields: Fields, today: LocalDate): Parsed<WithJob<LogCallInput>> {
  const errors: FieldErrors = {};
  const jobId = readJobId(fields, errors);

  const outcome = fields.outcome as CallOutcome;
  if (!OUTCOMES.includes(outcome)) errors.outcome = "Choose how the call went.";

  const nextStepRaw = text(fields.nextStep);
  const nextStep = nextStepRaw ? (nextStepRaw as NextStep) : null;
  if (nextStep && !NEXT_STEP_VALUES.includes(nextStep)) errors.nextStep = "Choose what happens next.";

  const callbackOn = optionalDate(fields.callbackOn, today, "callbackOn", errors);
  const note = readNote(fields, errors);

  return result(errors, () => ({ jobId: jobId!, outcome, nextStep, callbackOn, note }));
}

export function parseQuoteInput(fields: Fields): Parsed<WithJob<QuoteInput>> {
  const errors: FieldErrors = {};
  const jobId = readJobId(fields, errors);
  const amountCents = readMoney(fields.amount, errors);
  const note = readNote(fields, errors);
  return result(errors, () => ({ jobId: jobId!, amountCents: amountCents!, note }));
}

export function parseScheduleInput(
  fields: Fields,
  today: LocalDate,
): Parsed<WithJob<{ technicianId: number; visitOn: LocalDate; note: string | null }>> {
  const errors: FieldErrors = {};
  const jobId = readJobId(fields, errors);

  const technicianId = positiveInt(fields.technicianId);
  if (!technicianId) errors.technicianId = "Pick a technician.";

  const visitOn = optionalDate(fields.visitOn, today, "visitOn", errors);
  if (!visitOn && !errors.visitOn) errors.visitOn = "Pick the visit date.";

  const note = readNote(fields, errors);
  return result(errors, () => ({ jobId: jobId!, technicianId: technicianId!, visitOn: visitOn!, note }));
}

export function parseCallbackInput(fields: Fields, today: LocalDate): Parsed<WithJob<CallbackInput>> {
  const errors: FieldErrors = {};
  const jobId = readJobId(fields, errors);

  const callbackOn = optionalDate(fields.callbackOn, today, "callbackOn", errors);
  if (!callbackOn && !errors.callbackOn) errors.callbackOn = "Pick when to call back.";

  const note = readNote(fields, errors);
  return result(errors, () => ({ jobId: jobId!, callbackOn: callbackOn!, note }));
}

export function parseDoneInput(fields: Fields): Parsed<WithJob<DoneInput>> {
  const errors: FieldErrors = {};
  const jobId = readJobId(fields, errors);
  const note = readNote(fields, errors);
  return result(errors, () => ({ jobId: jobId!, note }));
}

export function parseLostInput(fields: Fields): Parsed<WithJob<LostInput>> {
  const errors: FieldErrors = {};
  const jobId = readJobId(fields, errors);

  const reason = fields.reason as LostReason;
  if (!LOST_REASONS.includes(reason)) errors.reason = "Pick a reason.";
  // Closing a job is the one action that asks twice.
  if (fields.confirmed !== "yes") errors.form = "Confirm that you want to close this job.";

  const note = readNote(fields, errors);
  return result(errors, () => ({ jobId: jobId!, reason, note }));
}

export function parseNoteInput(fields: Fields): Parsed<WithJob<NoteInput>> {
  const errors: FieldErrors = {};
  const jobId = readJobId(fields, errors);
  const note = readNote(fields, errors);
  if (!note && !errors.note) errors.note = "Write the note first.";
  return result(errors, () => ({ jobId: jobId!, note: note! }));
}

const MAX_NAME_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_ADDRESS_LENGTH = 200;
const MAX_PHONE_LENGTH = 40;
const MAX_EMAIL_LENGTH = 254;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** What the new-request form says when something is missing or wrong. */
export type NewRequestMessages = {
  nameRequired: string;
  phoneRequired: string;
  phoneInvalid: string;
  descriptionRequired: string;
  descriptionTooLong: string;
  emailInvalid: string;
  tooLong: (max: number) => string;
};

/** Denise's quick "New request" form. */
export const QUICK_ADD_MESSAGES: NewRequestMessages = {
  nameRequired: "Enter the business or the person's name.",
  phoneRequired: "Enter a phone number.",
  phoneInvalid: "That doesn't look like a phone number.",
  descriptionRequired: "Say what's wrong.",
  descriptionTooLong: `Keep this under ${MAX_DESCRIPTION_LENGTH} characters. Put the rest in the notes.`,
  emailInvalid: "Check the email address.",
  tooLong: (max) => `Keep this under ${max} characters.`,
};

/**
 * A new request, from Denise's quick-add form or (with customer-facing
 * messages) the public "Request service" form. Every limit is enforced here on
 * the server, whatever the browser sent.
 */
export function parseNewRequestInput(
  fields: Fields,
  today: LocalDate,
  messages: NewRequestMessages = QUICK_ADD_MESSAGES,
): Parsed<NewRequestInput> {
  const errors: FieldErrors = {};
  const limited = (raw: string | undefined, max: number, field: string) => {
    const value = text(raw);
    if (value.length > max) errors[field] = messages.tooLong(max);
    return value || null;
  };

  const businessName = limited(fields.businessName, MAX_NAME_LENGTH, "businessName");
  const name = limited(fields.name, MAX_NAME_LENGTH, "name");
  if (!businessName && !name && !errors.businessName && !errors.name) {
    errors.businessName = messages.nameRequired;
  }

  const typedPhone = text(fields.phone);
  const digits = phoneDigits(typedPhone);
  if (!typedPhone) errors.phone = messages.phoneRequired;
  else if (typedPhone.length > MAX_PHONE_LENGTH) errors.phone = messages.tooLong(MAX_PHONE_LENGTH);
  else if (!digits || digits.length < 7 || digits.length > 15) errors.phone = messages.phoneInvalid;

  const description = text(fields.description);
  if (!description) errors.description = messages.descriptionRequired;
  else if (description.length > MAX_DESCRIPTION_LENGTH) errors.description = messages.descriptionTooLong;

  const source = fields.source as JobSource;
  if (!JOB_SOURCES.includes(source)) errors.source = "Pick where this came from.";
  const referredBy = limited(fields.referredBy, MAX_NAME_LENGTH, "referredBy");

  const email = text(fields.email) || null;
  if (email && email.length > MAX_EMAIL_LENGTH) errors.email = messages.tooLong(MAX_EMAIL_LENGTH);
  else if (email && !EMAIL_PATTERN.test(email)) errors.email = messages.emailInvalid;
  const address = limited(fields.address, MAX_ADDRESS_LENGTH, "address");

  const callbackOn = optionalDate(fields.callbackOn, today, "callbackOn", errors);
  const note = readNote(fields, errors);

  return result(errors, () => ({
    businessName,
    name,
    phone: formatPhone(typedPhone),
    phoneDigits: digits!,
    description,
    source,
    referredBy,
    isEmergency: fields.isEmergency === "yes",
    email,
    address,
    note,
    callbackOn,
  }));
}

/** "$3,850", "3850", "3,850.50" → cents. */
export function parseMoney(raw: string | undefined): { cents: number } | { error: string } {
  const cleaned = text(raw).replace(/[$,\s]/g, "");
  if (!cleaned) return { error: "Enter the quote amount." };
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return { error: "Enter an amount like 3,850 or 3850.50." };

  const cents = Math.round(Number(cleaned) * 100);
  if (cents <= 0) return { error: "The amount must be more than $0." };
  if (cents > MAX_QUOTE_CENTS) return { error: "That's over $1,000,000. Check the amount." };
  return { cents };
}

function readMoney(raw: string | undefined, errors: FieldErrors): number | null {
  const parsed = parseMoney(raw);
  if ("error" in parsed) {
    errors.amount = parsed.error;
    return null;
  }
  return parsed.cents;
}

function readJobId(fields: Fields, errors: FieldErrors): number | null {
  const id = positiveInt(fields.jobId);
  if (!id) errors.form = "We couldn't tell which job this is. Reload the page and try again.";
  return id;
}

function readNote(fields: Fields, errors: FieldErrors): string | null {
  const note = text(fields.note);
  if (note.length > MAX_NOTE_LENGTH) {
    errors.note = `Keep the note under ${MAX_NOTE_LENGTH.toLocaleString("en-US")} characters.`;
  }
  return note || null;
}

/** A date that is today or later, or null when left empty. */
function optionalDate(
  raw: string | undefined,
  today: LocalDate,
  field: string,
  errors: FieldErrors,
): LocalDate | null {
  const value = text(raw);
  if (!value) return null;
  if (!isValidLocalDate(value)) {
    errors[field] = "Enter a valid date.";
    return null;
  }
  if (value < today) {
    errors[field] = "That date has already passed.";
    return null;
  }
  return value;
}

function positiveInt(raw: string | undefined): number | null {
  const value = text(raw);
  if (!/^\d+$/.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

function text(raw: string | undefined): string {
  return (raw ?? "").trim();
}

function result<T>(errors: FieldErrors, build: () => T): Parsed<T> {
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: build() };
}
