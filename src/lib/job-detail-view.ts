import type { Activity, Customer, Job } from "../db/schema";
import { callbackChoices, type CallbackChoice } from "./callback-choices";
import { BUSINESS_TIMEZONE } from "./config";
import { localToday, toLocalDate } from "./dates";
import { isOpenStatus, LOST_REASON_LABELS, SOURCE_LABELS, STATUS_LABELS, type JobStatus, type LocalDate } from "./domain";
import { FOLLOW_UP_TITLES, getFollowUp } from "./followups";
import type { JobListItem } from "./jobs-view";
import { customerHref, jobHref } from "./links";
import { buildTimeline, type TimelineEntry } from "./timeline";
import {
  describeCustomerHint,
  describeFollowUp,
  formDefaults,
  jobActions,
  type ActionTarget,
  type ContactLink,
} from "./today-view";
import { describeDay, firstName, formatDate, formatMoney, formatTimestamp, phoneHref } from "./wording";

/**
 * One job's page, as a pure function: who it's for, where it stands, its
 * whole history, and the same actions as on Today.
 */

export type JobDetailInput = JobListItem &
  Pick<Job, "equipment" | "technicianId"> & {
    customer: Pick<Customer, "name" | "businessName" | "phone" | "email" | "address" | "notes">;
    activities: Pick<Activity, "id" | "type" | "note" | "meta" | "createdAt">[];
    /** The customer's other jobs. */
    otherJobs: Pick<Job, "id" | "description" | "status" | "receivedAt" | "closedAt">[];
  };

export type JobDetailView = {
  jobId: number;
  name: string;
  /** The customer's page, with all their jobs and history. */
  customerHref: string;
  contactName: string | null;
  phone: ContactLink | null;
  email: ContactLink | null;
  address: string | null;
  customerNotes: string | null;
  problem: string;
  status: JobStatus;
  statusLabel: string;
  isEmergency: boolean;
  /** Exactly what the Today page says about this job, when it's on Today. */
  onToday: { section: string; reason: string; facts: string | null } | null;
  /** Otherwise, why it isn't: "Callback Monday", "Visit Thursday with Carlos", "Closed". */
  offTodayReason: string | null;
  facts: { label: string; value: string }[];
  timeline: TimelineEntry[];
  customerHistory: {
    summary: string | null;
    jobs: { jobId: number; href: string; problem: string; status: JobStatus; statusLabel: string; when: string }[];
  };
  /** The shared action buttons and forms. */
  actionTarget: ActionTarget;
  today: LocalDate;
  callbackChoices: CallbackChoice[];
  technicians: { id: number; name: string }[];
};

export function buildJobDetailView(
  job: JobDetailInput,
  technicians: { id: number; name: string }[],
  now: Date,
  timezone: string = BUSINESS_TIMEZONE,
): JobDetailView {
  const today = localToday(now, timezone);
  const { customer } = job;
  const name = customer.businessName ?? customer.name ?? "Unknown caller";
  const tel = phoneHref(customer.phone);
  const otherOpen = job.otherJobs.filter((other) => isOpenStatus(other.status)).length;
  const past = job.otherJobs.length - otherOpen;

  // The same inputs the Today page uses, so both screens say the same thing.
  const followUp = getFollowUp(job, now, timezone);
  const onToday = followUp
    ? {
        section: FOLLOW_UP_TITLES[followUp.category],
        ...describeFollowUp(
          {
            ...job,
            statusSince: statusSince(job),
            otherOpenJobs: otherOpen,
            pastJobs: past,
          },
          followUp,
          now,
          timezone,
        ),
      }
    : null;

  return {
    jobId: job.id,
    name,
    customerHref: customerHref(job.customerId),
    contactName: customer.businessName && customer.name ? customer.name : null,
    phone: customer.phone && tel ? { kind: "phone", label: customer.phone, href: tel } : null,
    email: customer.email ? { kind: "email", label: customer.email, href: `mailto:${customer.email}` } : null,
    address: customer.address,
    customerNotes: customer.notes,
    problem: job.description,
    status: job.status,
    statusLabel: STATUS_LABELS[job.status],
    isEmergency: job.isEmergency && isOpenStatus(job.status),
    onToday,
    offTodayReason: onToday ? null : offTodayReason(job, today),
    facts: jobFacts(job, today, timezone),
    timeline: buildTimeline(job.activities, today, timezone),
    customerHistory: {
      summary: describeCustomerHint(otherOpen, past),
      jobs: [...job.otherJobs]
        .sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime())
        .map((other) => ({
          jobId: other.id,
          href: jobHref(other.id),
          problem: other.description,
          status: other.status,
          statusLabel: STATUS_LABELS[other.status],
          when: formatDate(toLocalDate(other.closedAt ?? other.receivedAt, timezone), today),
        })),
    },
    actionTarget: {
      jobId: job.id,
      name,
      problem: job.description,
      actions: jobActions(job.status, followUp?.category ?? null),
      form: formDefaults(job, today),
    },
    today,
    callbackChoices: callbackChoices(today),
    technicians,
  };
}

/** When the job entered its current status: the latest activity that moved it there. */
function statusSince(job: JobDetailInput): Date {
  const entered = job.activities
    .filter((activity) => activity.meta?.toStatus === job.status)
    .map((activity) => activity.createdAt.getTime());
  return entered.length ? new Date(Math.max(...entered)) : job.receivedAt;
}

function offTodayReason(job: JobDetailInput, today: LocalDate): string {
  if (!isOpenStatus(job.status)) return "This job is closed.";
  if (job.followUpOn && job.followUpOn > today) return `You set a callback for ${describeDay(job.followUpOn, today)}.`;
  if (job.status === "scheduled" && job.scheduledFor) {
    const tech = job.technician ? ` with ${firstName(job.technician.name)}` : "";
    return `Visit ${describeDay(job.scheduledFor, today)}${tech}.`;
  }
  return "Waiting to hear back from the customer.";
}

function jobFacts(job: JobDetailInput, today: LocalDate, timezone: string): JobDetailView["facts"] {
  const facts: JobDetailView["facts"] = [];
  const add = (label: string, value: string | null | undefined) => value && facts.push({ label, value });
  const at = (instant: Date) => formatTimestamp(instant, today, timezone);

  add("Status", STATUS_LABELS[job.status]);
  add("Equipment", job.equipment);
  add("Source", job.source === "referral" && job.referredBy ? `Referral · ${job.referredBy}` : SOURCE_LABELS[job.source]);
  add("Came in", at(job.receivedAt));
  if (job.quoteAmountCents !== null || job.quoteSentAt) {
    add(
      "Quote",
      [job.quoteAmountCents !== null ? formatMoney(job.quoteAmountCents) : null, job.quoteSentAt ? `sent ${at(job.quoteSentAt)}` : null]
        .filter(Boolean)
        .join(" · "),
    );
  }
  if (job.scheduledFor) {
    add("Visit", `${formatDate(job.scheduledFor, today)}${job.technician ? ` · ${job.technician.name}` : ""}`);
  }
  if (isOpenStatus(job.status)) add("Callback", job.followUpOn ? formatDate(job.followUpOn, today) : null);
  add("Last contact", job.lastContactAt ? at(job.lastContactAt) : "No contact yet");
  if (job.status === "done") add("Closed", job.closedAt ? `Done · ${at(job.closedAt)}` : "Done");
  if (job.status === "lost") {
    add(
      "Closed",
      ["Didn't go ahead", job.lostReason ? LOST_REASON_LABELS[job.lostReason] : null, job.closedAt ? at(job.closedAt) : null]
        .filter(Boolean)
        .join(" · "),
    );
  }
  return facts;
}

