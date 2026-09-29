import type { Activity, Customer } from "../db/schema";
import { BUSINESS_TIMEZONE } from "./config";
import { localToday } from "./dates";
import { isOpenStatus } from "./domain";
import { buildJobRow, compareJobs, type JobListItem, type JobRowView } from "./jobs-view";
import { jobHref } from "./links";
import { describeActivity, type TimelineEntry } from "./timeline";
import type { ContactLink } from "./today-view";
import { phoneHref, plural } from "./wording";

/**
 * A customer's page, as a pure function: their details, their jobs split into
 * current and previous, and one history across every job. Read-only.
 */

export type CustomerDetailInput = {
  customer: Pick<Customer, "id" | "name" | "businessName" | "phone" | "email" | "address" | "notes">;
  jobs: JobListItem[];
  activities: Pick<Activity, "id" | "jobId" | "type" | "note" | "meta" | "createdAt">[];
};

/** A timeline line (the same wording as a job's page) plus the job it belongs to. */
export type CustomerTimelineEntry = TimelineEntry & { job: { jobId: number; label: string; href: string } };

export type CustomerView = {
  customerId: number;
  name: string;
  contactName: string | null;
  phone: ContactLink | null;
  email: ContactLink | null;
  address: string | null;
  notes: string | null;
  /** "1 open job · 3 previous jobs" */
  summary: string;
  openJobs: JobRowView[];
  previousJobs: JobRowView[];
  /** Every job's activities together, newest first. */
  timeline: CustomerTimelineEntry[];
};

export function buildCustomerView(
  input: CustomerDetailInput,
  now: Date,
  timezone: string = BUSINESS_TIMEZONE,
): CustomerView {
  const { customer } = input;
  const tel = phoneHref(customer.phone);
  const rows = [...input.jobs].sort(compareJobs).map((job) => buildJobRow(job, now, timezone));
  const openJobs = rows.filter((row) => isOpenStatus(row.status));
  const previousJobs = rows.filter((row) => !isOpenStatus(row.status));

  return {
    customerId: customer.id,
    name: customer.businessName ?? customer.name ?? "Unknown caller",
    contactName: customer.businessName && customer.name ? customer.name : null,
    phone: customer.phone && tel ? { kind: "phone", label: customer.phone, href: tel } : null,
    email: customer.email ? { kind: "email", label: customer.email, href: `mailto:${customer.email}` } : null,
    address: customer.address,
    notes: customer.notes,
    summary: `${plural(openJobs.length, "open job")} · ${plural(previousJobs.length, "previous job")}`,
    openJobs,
    previousJobs,
    timeline: buildCustomerTimeline(input, localToday(now, timezone), timezone),
  };
}

/**
 * Every activity from every job, newest first so the latest is on top.
 * Things recorded at the same moment keep the order they were saved in.
 */
export function buildCustomerTimeline(
  input: Pick<CustomerDetailInput, "jobs" | "activities">,
  today: string,
  timezone: string,
): CustomerTimelineEntry[] {
  const jobs = new Map(input.jobs.map((job) => [job.id, job]));
  return input.activities
    .filter((activity) => jobs.has(activity.jobId))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id)
    .map((activity) => ({
      ...describeActivity(activity, today, timezone),
      job: {
        jobId: activity.jobId,
        label: jobs.get(activity.jobId)!.description,
        href: jobHref(activity.jobId),
      },
    }));
}
