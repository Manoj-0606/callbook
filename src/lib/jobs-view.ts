import type { Customer, Job, Technician } from "../db/schema";
import { BUSINESS_TIMEZONE } from "./config";
import { localToday, toLocalDate } from "./dates";
import {
  CLOSED_STATUSES,
  isOpenStatus,
  JOB_STATUSES,
  LOST_REASON_LABELS,
  OPEN_STATUSES,
  SOURCE_LABELS,
  STATUS_LABELS,
  type JobStatus,
} from "./domain";
import { getFollowUp } from "./followups";
import { phoneDigits } from "./phone";
import { jobHref } from "./links";
import type { ContactLink } from "./today-view";
import { describeDay, describeMoment, firstName, formatMoney, phoneHref, plural } from "./wording";

/**
 * The Jobs page, as pure functions: what the URL asks for, how a search is
 * read, and what each row says.
 */

// ── What the page shows ──────────────────────────────────────────────────────

export const JOB_FILTERS = ["open", ...OPEN_STATUSES, "closed", "all"] as const;
export type JobFilter = (typeof JOB_FILTERS)[number];

export const FILTER_LABELS: Record<JobFilter, string> = {
  open: "All open",
  new: "New",
  needs_quote: "Needs a quote",
  quote_sent: "Quote sent",
  ready_to_schedule: "Said yes",
  scheduled: "Scheduled",
  closed: "Closed",
  all: "Everything",
};

export function statusesFor(filter: JobFilter): readonly JobStatus[] {
  if (filter === "open") return OPEN_STATUSES;
  if (filter === "closed") return CLOSED_STATUSES;
  if (filter === "all") return JOB_STATUSES;
  return [filter];
}

export type JobsQuery = { filter: JobFilter; q: string };

type SearchParams = Record<string, string | string[] | undefined>;

/** Read `?status=…&q=…`. Anything unrecognised falls back to open jobs. */
export function parseJobsQuery(params: SearchParams): JobsQuery {
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";
  const status = first(params.status);
  return {
    filter: (JOB_FILTERS as readonly string[]).includes(status) ? (status as JobFilter) : "open",
    q: first(params.q).trim().slice(0, 100),
  };
}

export function jobsHref({ filter = "open", q = "" }: Partial<JobsQuery>): string {
  const params = new URLSearchParams();
  if (filter !== "open") params.set("status", filter);
  if (q) params.set("q", q);
  const query = params.toString();
  return query ? `/jobs?${query}` : "/jobs";
}

// ── Search ───────────────────────────────────────────────────────────────────

export type JobSearch = { kind: "name"; text: string } | { kind: "phone"; digits: string } | null;

/**
 * Anything with letters searches business and contact names ("sunrise",
 * "Pier 9"). A number searches phone numbers, normalized the same way they're
 * stored, so "(512) 555-0112", "512.555.0112" and "0112" all work.
 */
export function parseJobSearch(q: string): JobSearch {
  const text = q.trim();
  if (!text) return null;
  if (/\p{L}/u.test(text)) return { kind: "name", text };
  const digits = phoneDigits(text);
  if (digits && digits.length >= 3) return { kind: "phone", digits };
  return { kind: "name", text };
}

// ── Filter chips ─────────────────────────────────────────────────────────────

export type FilterChip = { filter: JobFilter; label: string; count: number; href: string; current: boolean };

/** Counts are for the current search, so the chips say where the matches are. */
export function buildFilterChips(counts: Partial<Record<JobStatus, number>>, query: JobsQuery): FilterChip[] {
  const countOf = (filter: JobFilter) => statusesFor(filter).reduce((sum, status) => sum + (counts[status] ?? 0), 0);
  return JOB_FILTERS.map((filter) => ({
    filter,
    label: FILTER_LABELS[filter],
    count: countOf(filter),
    href: jobsHref({ filter, q: query.q }),
    current: filter === query.filter,
  }));
}

// ── Rows ─────────────────────────────────────────────────────────────────────

export type JobListItem = Pick<
  Job,
  | "id"
  | "customerId"
  | "status"
  | "isEmergency"
  | "description"
  | "source"
  | "referredBy"
  | "quoteAmountCents"
  | "quoteSentAt"
  | "scheduledFor"
  | "followUpOn"
  | "lastContactAt"
  | "receivedAt"
  | "closedAt"
  | "lostReason"
> & {
  customer: Pick<Customer, "name" | "businessName" | "phone" | "email">;
  technician: Pick<Technician, "name"> | null;
};

export type JobRowView = {
  jobId: number;
  href: string;
  name: string;
  contactName: string | null;
  contact: ContactLink | null;
  problem: string;
  status: JobStatus;
  statusLabel: string;
  isEmergency: boolean;
  /** Needs attention today, by the same rules as the Today page. */
  onToday: boolean;
  /** Quote, visit, callback and timing, e.g. "Quote $3,850 sent Friday · Last contact Friday". */
  details: string;
};

const STAGE_ORDER: Record<JobStatus, number> = {
  new: 0,
  needs_quote: 1,
  quote_sent: 2,
  ready_to_schedule: 3,
  scheduled: 4,
  done: 5,
  lost: 5,
};

/** Open jobs by stage then oldest first; closed jobs after, most recently closed first. */
export function compareJobs(a: JobListItem, b: JobListItem): number {
  const stage = STAGE_ORDER[a.status] - STAGE_ORDER[b.status];
  if (stage !== 0) return stage;
  if (!isOpenStatus(a.status)) {
    return (b.closedAt?.getTime() ?? 0) - (a.closedAt?.getTime() ?? 0) || b.id - a.id;
  }
  return a.receivedAt.getTime() - b.receivedAt.getTime() || a.id - b.id;
}

export function buildJobRow(job: JobListItem, now: Date, timezone: string = BUSINESS_TIMEZONE): JobRowView {
  const { customer } = job;
  const tel = phoneHref(customer.phone);
  return {
    jobId: job.id,
    href: jobHref(job.id),
    name: customer.businessName ?? customer.name ?? "Unknown caller",
    contactName: customer.businessName && customer.name ? customer.name : null,
    contact:
      customer.phone && tel
        ? { kind: "phone", label: customer.phone, href: tel }
        : customer.email
          ? { kind: "email", label: customer.email, href: `mailto:${customer.email}` }
          : null,
    problem: job.description,
    status: job.status,
    statusLabel: STATUS_LABELS[job.status],
    isEmergency: job.isEmergency && isOpenStatus(job.status),
    onToday: getFollowUp(job, now, timezone) !== null,
    details: describeStanding(job, now, timezone),
  };
}

/** Where a job stands, in a line: quote, visit, callback and last contact. */
export function describeStanding(job: JobListItem, now: Date, timezone: string = BUSINESS_TIMEZONE): string {
  const today = localToday(now, timezone);
  const when = (instant: Date) => describeMoment(instant, now, timezone);
  const day = (date: string) => describeDay(date, today);
  const parts: string[] = [];

  if (job.status === "done") {
    return job.closedAt ? `Done ${when(job.closedAt)}` : "Done";
  }
  if (job.status === "lost") {
    const reason = job.lostReason ? ` · ${LOST_REASON_LABELS[job.lostReason]}` : "";
    return `${job.closedAt ? `Didn't go ahead ${when(job.closedAt)}` : "Didn't go ahead"}${reason}`;
  }

  const quote = job.quoteAmountCents !== null ? formatMoney(job.quoteAmountCents) : null;
  if (job.status === "new") {
    parts.push(job.source === "referral" && job.referredBy ? `Referred by ${job.referredBy}` : SOURCE_LABELS[job.source]);
  }
  if (job.status === "quote_sent") {
    const sent = job.quoteSentAt ? ` sent ${when(job.quoteSentAt)}` : " sent";
    parts.push(`Quote${quote ? ` ${quote}` : ""}${sent}`);
  }
  if (job.status === "ready_to_schedule" && quote) parts.push(`Quote ${quote}`);
  if (job.status === "scheduled" && job.scheduledFor) {
    const tech = job.technician ? ` with ${firstName(job.technician.name)}` : "";
    parts.push(
      job.scheduledFor >= today ? `Visit ${day(job.scheduledFor)}${tech}` : `Visit was ${day(job.scheduledFor)}${tech}`,
    );
  }
  if (job.followUpOn) parts.push(`Callback ${day(job.followUpOn)}`);

  const quoteDay = job.quoteSentAt ? toLocalDate(job.quoteSentAt, timezone) : null;
  if (job.lastContactAt) {
    // Skip it when it only repeats the quote line.
    if (toLocalDate(job.lastContactAt, timezone) !== quoteDay) parts.push(`Last contact ${when(job.lastContactAt)}`);
  } else {
    parts.push(`Came in ${when(job.receivedAt)}`);
  }
  return parts.join(" · ");
}

// ── The page ────────────────────────────────────────────────────────────────

export type JobsView = {
  query: JobsQuery;
  openJobsLabel: string;
  chips: FilterChip[];
  rows: JobRowView[];
  /** "4 jobs match "sunrise"", "3 jobs", or what to say when there are none. */
  resultLabel: string;
  empty: { title: string; hint: string | null } | null;
};

export function buildJobsView(
  input: {
    query: JobsQuery;
    items: JobListItem[];
    counts: Partial<Record<JobStatus, number>>;
    openJobCount: number;
  },
  now: Date,
  timezone: string = BUSINESS_TIMEZONE,
): JobsView {
  const { query, items } = input;
  const rows = [...items].sort(compareJobs).map((job) => buildJobRow(job, now, timezone));
  const where = query.filter === "open" ? "" : ` · ${FILTER_LABELS[query.filter]}`;

  return {
    query,
    openJobsLabel: plural(input.openJobCount, "open job"),
    chips: buildFilterChips(input.counts, query),
    rows,
    resultLabel: query.q
      ? `${plural(rows.length, "job")} matching “${query.q}”${where}`
      : `${plural(rows.length, "job")}${where}`,
    empty:
      rows.length > 0
        ? null
        : query.q
          ? {
              title: `No jobs match “${query.q}”${where}.`,
              hint: "Try part of the name, or the last four digits of the phone number.",
            }
          : { title: "Nothing here right now.", hint: null },
  };
}
