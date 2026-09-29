import type { Customer, Job, Technician } from "../db/schema";
import { callbackChoices, type CallbackChoice } from "./callback-choices";
import { customerHref, jobHref } from "./links";
import { BUSINESS_TIMEZONE } from "./config";
import { addBusinessDays, localToday, toLocalDate } from "./dates";
import {
  isOpenStatus,
  SOURCE_LABELS,
  STATUS_LABELS,
  type JobStatus,
  type LocalDate,
  type OpenJobStatus,
} from "./domain";
import type { FollowUp, FollowUpCategory, FollowUpJob, TodayList } from "./followups";
import {
  ALLOWED_ACTIONS,
  NEXT_STEPS,
  nextStepRequired,
  type ActionKind,
  type NextStep,
} from "./job-actions";
import {
  describeDay,
  describeMoment,
  firstName,
  formatLongDate,
  formatMoney,
  phoneHref,
  plural,
} from "./wording";

/**
 * Turns the follow-up engine's Today list into exactly what the screen shows.
 * Pure: the page renders these strings and makes no decisions of its own.
 */

/** An open job with everything its Today card needs. */
export type TodayJob = FollowUpJob &
  Pick<Job, "description" | "source" | "referredBy" | "quoteAmountCents" | "quoteSentAt" | "technicianId"> & {
    customer: Pick<Customer, "name" | "businessName" | "phone" | "email">;
    technician: Pick<Technician, "name"> | null;
    /** When the job entered its current status, taken from its timeline. */
    statusSince: Date;
    /** The customer's other open jobs, and their closed ones. */
    otherOpenJobs: number;
    pastJobs: number;
  };

export type ContactLink = { kind: "phone" | "email"; label: string; href: string };

/**
 * What the shared action buttons and forms need, whether they sit on a Today
 * card or the Job Detail page. There is one implementation of each action.
 */
export type ActionTarget = {
  jobId: number;
  name: string;
  problem: string;
  actions: { primary: ActionOption; more: ActionOption[] };
  form: CardFormDefaults;
};

export type CardView = ActionTarget & {
  /** The job's detail page. */
  href: string;
  /** The customer's page, with all their jobs and history. */
  customerHref: string;
  isEmergency: boolean;
  /** Business name, or the person's name when there's no business. */
  name: string;
  /** The person to ask for, when different from `name`. */
  contactName: string | null;
  contact: ContactLink | null;
  problem: string;
  /** Why they're on Today, with the timing that matters. */
  reason: string;
  /** Where the job stands, when there's more to say. */
  facts: string | null;
  /** Repeat customer / other open jobs. */
  hint: string | null;
};

/** A button label and the heading of the form it opens. */
export type ActionOption = { kind: ActionKind; label: string; title: string };

export type CardFormDefaults = {
  /** Where a call can move this job, for "What happens next?". */
  nextSteps: { value: NextStep; label: string }[];
  /** A new job needs a next step once you've talked to them. */
  nextStepRequired: boolean;
  /** What "no answer" will do, e.g. "It comes back tomorrow." */
  noAnswerHint: string;
  /** Current quote in dollars ("3850"), or "" when there isn't one. */
  quoteAmount: string;
  technicianId: number | null;
  /** The visit date the schedule form starts on. */
  visitOn: LocalDate;
};

export type SectionView = {
  category: FollowUpCategory;
  title: string;
  cards: CardView[];
};

export type TodayView = {
  today: LocalDate;
  dateLabel: string;
  peopleLabel: string;
  openJobsLabel: string;
  isEmpty: boolean;
  /** Shown under "You're all caught up." when nobody needs a call. */
  emptyMessage: string;
  sections: SectionView[];
  technicians: { id: number; name: string }[];
  callbackChoices: CallbackChoice[];
};

/** The action each Today section leads with. */
export const PRIMARY_ACTIONS: Record<FollowUpCategory, ActionKind> = {
  new: "log_call",
  ready_to_schedule: "schedule",
  callback_due: "log_call",
  needs_quote: "quote",
  gone_quiet: "log_call",
  check_visit: "done",
};

const ACTION_LABELS: Record<ActionKind, string> = {
  log_call: "Log call",
  quote: "Mark quote sent",
  schedule: "Schedule",
  callback: "Set callback",
  note: "Add note",
  done: "Mark done",
  lost: "Didn't go ahead",
};

const ACTION_TITLES: Record<ActionKind, string> = {
  log_call: "Log a call",
  quote: "Record the quote",
  schedule: "Schedule a visit",
  callback: "Set a callback",
  note: "Add a note",
  done: "Mark this job done",
  lost: "Didn't go ahead",
};

export function actionOption(kind: ActionKind, status: JobStatus): ActionOption {
  if (kind === "schedule" && status === "scheduled") {
    return { kind, label: "Reschedule", title: "Reschedule the visit" };
  }
  if (kind === "quote" && status === "quote_sent") {
    return { kind, label: "Update quote", title: "Update the quote" };
  }
  return { kind, label: ACTION_LABELS[kind], title: ACTION_TITLES[kind] };
}

const NEXT_STEP_LABELS: Record<NextStep, string> = {
  needs_quote: "Needs a quote",
  ready_to_schedule: "Said yes — needs scheduling",
};

export type TodayContext = {
  openJobCount: number;
  technicians: { id: number; name: string }[];
};

export function buildTodayView(
  list: TodayList<TodayJob>,
  context: TodayContext,
  now: Date,
  timezone: string = BUSINESS_TIMEZONE,
): TodayView {
  const { openJobCount } = context;
  const openJobsLabel = plural(openJobCount, "open job");
  return {
    today: list.today,
    technicians: context.technicians,
    callbackChoices: callbackChoices(list.today),
    dateLabel: formatLongDate(list.today),
    peopleLabel: `${plural(list.peopleCount, "person", "people")} to call`,
    openJobsLabel,
    isEmpty: list.sections.length === 0,
    emptyMessage:
      openJobCount === 0
        ? "No open jobs right now. New requests will show up here."
        : `Nobody needs a call today. ${openJobsLabel}, all on track.`,
    sections: list.sections.map((section) => ({
      category: section.category,
      title: section.title,
      cards: section.items.map(({ job, followUp }) => toCard(job, followUp, now, timezone)),
    })),
  };
}

function toCard(job: TodayJob, followUp: FollowUp, now: Date, timezone: string): CardView {
  const { customer } = job;
  return {
    jobId: job.id,
    isEmergency: followUp.isEmergency,
    name: customer.businessName ?? customer.name ?? "Unknown caller",
    contactName: customer.businessName && customer.name ? customer.name : null,
    contact: contactLink(customer),
    problem: job.description,
    ...describeFollowUp(job, followUp, now, timezone),
    hint: describeCustomerHint(job.otherOpenJobs, job.pastJobs),
    actions: cardActions(job.status, PRIMARY_ACTIONS[followUp.category]),
    form: formDefaults(job, localToday(now, timezone)),
    href: jobHref(job.id),
    customerHref: customerHref(job.customerId),
  };
}

/**
 * The lead action for a job that isn't on Today (e.g. opened from Jobs). A job
 * on Today uses its section's action instead, so both screens agree.
 */
export const STATUS_PRIMARY_ACTIONS: Record<OpenJobStatus, ActionKind> = {
  new: "log_call",
  needs_quote: "quote",
  quote_sent: "log_call",
  ready_to_schedule: "schedule",
  scheduled: "done",
};

/** Actions for any job. A closed job can only take notes. */
export function jobActions(status: JobStatus, onTodayAs: FollowUpCategory | null): ActionTarget["actions"] {
  if (!isOpenStatus(status)) return { primary: actionOption("note", status), more: [] };
  return cardActions(status, onTodayAs ? PRIMARY_ACTIONS[onTodayAs] : STATUS_PRIMARY_ACTIONS[status]);
}

/** The section's lead action, plus every action allowed for this status. */
export function cardActions(status: JobStatus, primary: ActionKind): CardView["actions"] {
  const allowed = isOpenStatus(status) ? ALLOWED_ACTIONS[status] : [];
  return {
    primary: actionOption(primary, status),
    more: allowed.map((kind) => actionOption(kind, status)),
  };
}

/** Starting values for the action forms, for a Today card or a Job Detail page alike. */
export function formDefaults(
  job: Pick<Job, "status" | "isEmergency" | "quoteAmountCents" | "technicianId" | "scheduledFor">,
  today: LocalDate,
): CardFormDefaults {
  const nextBusinessDay = addBusinessDays(today, 1);
  const steps = isOpenStatus(job.status) ? NEXT_STEPS[job.status] : [];
  return {
    nextSteps: steps.map((value) => ({ value, label: NEXT_STEP_LABELS[value] })),
    nextStepRequired: nextStepRequired(job.status, "talked"),
    noAnswerHint: job.isEmergency
      ? "It's an emergency, so it stays on today's list."
      : `It comes back ${describeDay(nextBusinessDay, today)}.`,
    quoteAmount:
      job.quoteAmountCents === null
        ? ""
        : (job.quoteAmountCents / 100).toFixed(job.quoteAmountCents % 100 === 0 ? 0 : 2),
    technicianId: job.technicianId,
    visitOn: job.scheduledFor && job.scheduledFor >= today ? job.scheduledFor : nextBusinessDay,
  };
}

/** Phone first; email only when there's no number to call. */
function contactLink(customer: TodayJob["customer"]): ContactLink | null {
  const tel = phoneHref(customer.phone);
  if (customer.phone && tel) return { kind: "phone", label: customer.phone, href: tel };
  if (customer.email) return { kind: "email", label: customer.email, href: `mailto:${customer.email}` };
  return null;
}

/**
 * The two lines that explain a card:
 *   reason: why this person is on Today ("Quote sent Friday · $3,850")
 *   facts:  where the job stands, if the reason didn't already say it
 */
export function describeFollowUp(
  job: TodayJob,
  followUp: FollowUp,
  now: Date,
  timezone: string = BUSINESS_TIMEZONE,
): { reason: string; facts: string | null } {
  const today = localToday(now, timezone);
  const when = (instant: Date) => describeMoment(instant, now, timezone);
  const day = (date: LocalDate) => describeDay(date, today);

  const lastContact = job.lastContactAt ? `Last contact ${when(job.lastContactAt)}` : null;
  /** Last contact, unless it was the same day as something already mentioned. */
  const lastContactBesides = (mentioned: Date) =>
    job.lastContactAt && toLocalDate(job.lastContactAt, timezone) !== toLocalDate(mentioned, timezone)
      ? lastContact
      : null;
  const quote = job.quoteAmountCents !== null ? formatMoney(job.quoteAmountCents) : null;

  switch (followUp.category) {
    case "new":
      return {
        reason: joined(`Came in ${when(job.receivedAt)}`, sourcePhrase(job)),
        facts: lastContact,
      };

    case "ready_to_schedule":
      return {
        reason: `Said yes ${when(job.statusSince)}`,
        facts: quote ? `Quote ${quote}` : null,
      };

    case "callback_due": {
      const overdue = followUp.daysOverdue ?? 0;
      return {
        reason:
          overdue === 0
            ? "You said you'd call today"
            : `You said you'd call ${day(followUp.dueOn ?? today)} · ${plural(overdue, "day")} overdue`,
        facts: joined(whereItStands(job, quote, when, day), lastContact),
      };
    }

    case "needs_quote":
      return {
        reason: `Asked for a quote ${when(job.statusSince)}`,
        facts: lastContactBesides(job.statusSince),
      };

    case "gone_quiet":
      if (job.status === "quote_sent" && job.quoteSentAt) {
        return {
          reason: joined(`Quote sent ${when(job.quoteSentAt)}`, quote),
          facts: lastContactBesides(job.quoteSentAt),
        };
      }
      return {
        reason: lastContact ?? `Came in ${when(job.receivedAt)}`,
        facts: null,
      };

    case "check_visit": {
      const visitDay = day(followUp.dueOn ?? today);
      return {
        reason: job.technician ? `${firstName(job.technician.name)} was out ${visitDay}` : `Visit was ${visitDay}`,
        facts: null,
      };
    }
  }
}

/** A short status summary, for callbacks, where the section doesn't say it. */
function whereItStands(
  job: TodayJob,
  quote: string | null,
  when: (instant: Date) => string,
  day: (date: LocalDate) => string,
): string {
  switch (job.status) {
    case "needs_quote":
      return "Needs a quote";
    case "quote_sent":
      if (!job.quoteSentAt) return "Quote sent";
      return `${quote ? `Quote ${quote}` : "Quote"} sent ${when(job.quoteSentAt)}`;
    case "scheduled": {
      if (!job.scheduledFor) return STATUS_LABELS.scheduled;
      const withTech = job.technician ? ` with ${firstName(job.technician.name)}` : "";
      return `Visit set for ${day(job.scheduledFor)}${withTech}`;
    }
    default:
      return STATUS_LABELS[job.status];
  }
}

function sourcePhrase(job: TodayJob): string | null {
  if (job.source === "referral") return job.referredBy ? `Referred by ${job.referredBy}` : "Referral";
  if (job.source === "other") return null;
  return SOURCE_LABELS[job.source];
}

/** "Repeat customer · 3 past jobs", "Also has 1 other open job", or both. */
export function describeCustomerHint(otherOpenJobs: number, pastJobs: number): string | null {
  const otherOpen = otherOpenJobs > 0 ? plural(otherOpenJobs, "other open job") : null;
  if (pastJobs > 0) return joined("Repeat customer", plural(pastJobs, "past job"), otherOpen);
  return otherOpen ? `Also has ${otherOpen}` : null;
}

/** Join the parts that exist with " · ". */
function joined(first: string, ...rest: (string | null)[]): string {
  return [first, ...rest.filter((part): part is string => Boolean(part))].join(" · ");
}
