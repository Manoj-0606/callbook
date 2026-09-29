import { BUSINESS_TIMEZONE } from "./config";
import { localToday } from "./dates";
import { STATUS_LABELS, type JobSource, type JobStatus, type LocalDate } from "./domain";
import type { PlannedActivity } from "./job-actions";
import { customerHref, jobHref } from "./links";
import { describeDay, plural } from "./wording";

/**
 * Capturing a new request, as pure functions: what gets created, and how a
 * phone-number match with an existing customer is described.
 */

export type NewRequestInput = {
  businessName: string | null;
  name: string | null;
  phone: string;
  phoneDigits: string;
  description: string;
  source: JobSource;
  referredBy: string | null;
  isEmergency: boolean;
  email: string | null;
  address: string | null;
  note: string | null;
  callbackOn: LocalDate | null;
};

/** An existing customer found by phone number. */
export type CustomerMatch = {
  id: number;
  name: string | null;
  businessName: string | null;
  email: string | null;
  address: string | null;
  openJobs: { id: number; description: string; status: JobStatus }[];
  pastJobs: number;
};

type ContactFields = { name: string | null; businessName: string | null; email: string | null; address: string | null };

export type NewRequestPlan = {
  customer:
    | { kind: "create"; values: ContactFields & { phone: string; phoneDigits: string } }
    /** Only fields the record was missing. Nothing already stored is overwritten. */
    | { kind: "existing"; id: number; fill: Partial<ContactFields> };
  job: {
    description: string;
    source: JobSource;
    referredBy: string | null;
    status: "new";
    isEmergency: boolean;
    followUpOn: LocalDate | null;
    receivedAt: Date;
  };
  activity: PlannedActivity;
  /** Business or person, for the confirmation. */
  displayName: string;
  summary: string;
};

export type NewRequestOptions = {
  /**
   * Denise's own quick add may fill in details missing from an existing
   * customer's record. The public form must not: anyone can type any phone
   * number, so what they entered is kept on the request's note instead, for
   * Denise to check.
   */
  updateExistingCustomer?: boolean;
};

export function planNewRequest(
  input: NewRequestInput,
  existing: CustomerMatch | null,
  now: Date,
  timezone: string = BUSINESS_TIMEZONE,
  { updateExistingCustomer = true }: NewRequestOptions = {},
): NewRequestPlan {
  const contact: ContactFields = {
    name: input.name,
    businessName: input.businessName,
    email: input.email,
    address: input.address,
  };

  const customer: NewRequestPlan["customer"] = existing
    ? { kind: "existing", id: existing.id, fill: updateExistingCustomer ? missingFrom(existing, contact) : {} }
    : { kind: "create", values: { ...contact, phone: input.phone, phoneDigits: input.phoneDigits } };

  const keptOnNote = existing && !updateExistingCustomer ? detailsGiven(contact) : null;
  const note = [input.note, keptOnNote].filter(Boolean).join("\n") || null;

  const today = localToday(now, timezone);
  const { callbackOn } = input;
  // A callback date is the one "later" Denise chose; a later one keeps the job off Today until then.
  const summary =
    callbackOn && callbackOn > today
      ? `Added · on your list ${describeDay(callbackOn, today)}`
      : "Added to today's list";

  return {
    customer,
    job: {
      description: input.description,
      source: input.source,
      referredBy: input.source === "referral" ? input.referredBy : null,
      status: "new",
      isEmergency: input.isEmergency,
      followUpOn: callbackOn,
      receivedAt: now,
    },
    // Receiving a request isn't contact from us, so nothing touches the contact clock.
    activity: {
      type: "request_received",
      note,
      meta: { source: input.source, ...(callbackOn ? { date: callbackOn } : {}) },
      createdAt: now,
    },
    displayName:
      (existing ? (existing.businessName ?? existing.name) : null) ??
      input.businessName ??
      input.name ??
      input.phone,
    summary,
  };
}

/** "Details given on the form: Name: Earl · Email: earl@example.com", or null when nothing was typed. */
function detailsGiven(typed: ContactFields): string | null {
  const parts = [
    typed.name && `Name: ${typed.name}`,
    typed.businessName && `Business: ${typed.businessName}`,
    typed.email && `Email: ${typed.email}`,
    typed.address && `Address: ${typed.address}`,
  ].filter(Boolean);
  return parts.length ? `Details given on the form: ${parts.join(" · ")}` : null;
}

function missingFrom(existing: CustomerMatch, typed: ContactFields): Partial<ContactFields> {
  const fill: Partial<ContactFields> = {};
  for (const key of ["name", "businessName", "email", "address"] as const) {
    if (existing[key] === null && typed[key] !== null) fill[key] = typed[key];
  }
  return fill;
}

/** What the new-request form shows once the phone number matches a customer. */
export type RepeatCustomerView = {
  customerId: number;
  /** "Repeat customer: Sunrise Diner — 3 past jobs" */
  title: string;
  /** "This customer already has an open job.", or null. */
  warning: string | null;
  /** "Ice machine making soft, cloudy ice (Needs a quote)" for each open job, with a link to it. */
  openJobs: { label: string; href: string }[];
  /** Their customer page, with all their jobs and history. */
  customerHref: string;
  /** Names to fill into the form if Denise hasn't typed any. */
  prefill: { businessName: string | null; name: string | null };
};

export function describeRepeatCustomer(match: CustomerMatch): RepeatCustomerView {
  const who = match.businessName ?? match.name ?? "this customer";
  const open = match.openJobs.length;
  return {
    customerId: match.id,
    title:
      match.pastJobs > 0
        ? `Repeat customer: ${who} — ${plural(match.pastJobs, "past job")}`
        : `Existing customer: ${who}`,
    warning:
      open === 0
        ? null
        : open === 1
          ? "This customer already has an open job."
          : `This customer already has ${open} open jobs.`,
    openJobs: match.openJobs.map((job) => ({
      label: `${job.description} (${STATUS_LABELS[job.status]})`,
      href: jobHref(job.id),
    })),
    customerHref: customerHref(match.id),
    prefill: { businessName: match.businessName, name: match.name },
  };
}
