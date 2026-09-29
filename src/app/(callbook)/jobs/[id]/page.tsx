import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { JobActions } from "@/components/actions/job-actions";
import { ActionFormsProvider } from "@/components/action-forms-provider";
import { Icon } from "@/components/icons";
import { Timeline } from "@/components/jobs/timeline";
import { EmergencyBadge, StatusBadge } from "@/components/status-badge";
import { db } from "@/db";
import { loadJobDetail, loadJobTitle } from "@/db/queries/jobs";

function parseJobId(raw: string): number | null {
  return /^\d+$/.test(raw) && Number(raw) > 0 ? Number(raw) : null;
}

export async function generateMetadata({ params }: PageProps<"/jobs/[id]">): Promise<Metadata> {
  const id = parseJobId((await params).id);
  const name = id ? await loadJobTitle(db, id) : null;
  return { title: name ?? "Job not found" };
}

export default async function JobDetailPage({ params }: PageProps<"/jobs/[id]">) {
  await connection();
  const id = parseJobId((await params).id);
  const job = id ? await loadJobDetail(db, id, new Date()) : null;
  if (!job) notFound();

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pt-6 pb-16 sm:px-6 sm:pt-8">
      <nav aria-label="Back" className="mb-5 flex gap-4 text-sm font-medium">
        <Link href="/jobs" className="text-stone-600 underline-offset-2 hover:text-stone-950 hover:underline">
          ← All jobs
        </Link>
        <Link href="/" className="text-stone-600 underline-offset-2 hover:text-stone-950 hover:underline">
          Today
        </Link>
      </nav>

      <header>
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <StatusBadge status={job.status} label={job.statusLabel} />
          {job.isEmergency && <EmergencyBadge />}
        </div>
        <h1 className="text-3xl leading-tight font-bold tracking-tight text-stone-950">
          <Link
            href={job.customerHref}
            className="underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
          >
            {job.name}
          </Link>
        </h1>
        {job.contactName && <p className="mt-1 text-lg text-stone-600">{job.contactName}</p>}
        <p className="mt-3 text-lg text-stone-800">{job.problem}</p>
      </header>

      <ActionFormsProvider today={job.today} technicians={job.technicians} callbackChoices={job.callbackChoices}>
        <div className="mt-5 flex flex-wrap gap-2">
          {job.phone && (
            <a
              href={job.phone.href}
              aria-label={`Call ${job.name}`}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 font-semibold text-white hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
            >
              <Icon name="phone" />
              Call
            </a>
          )}
          <JobActions card={job.actionTarget} layout="inline" />
        </div>
      </ActionFormsProvider>

      {job.onToday ? (
        <section className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3" aria-label="On today's list">
          <p className="text-sm font-semibold text-amber-900">On today&apos;s list · {job.onToday.section}</p>
          <p className="font-medium text-stone-950">{job.onToday.reason}</p>
          {job.onToday.facts && <p className="text-sm text-stone-700">{job.onToday.facts}</p>}
        </section>
      ) : (
        <p className="mt-6 rounded-xl border border-stone-200 bg-white px-4 py-3 text-stone-700">
          <span className="font-semibold text-stone-900">Not on today&apos;s list.</span> {job.offTodayReason}
        </p>
      )}

      <div className="mt-8 grid gap-8 sm:grid-cols-2">
        <section aria-labelledby="job-facts">
          <h2 id="job-facts" className="mb-3 text-base font-semibold text-stone-800">
            The job
          </h2>
          <dl className="divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white">
            {job.facts.map((fact) => (
              <div key={fact.label} className="grid grid-cols-[7.5rem_1fr] gap-3 px-4 py-2.5">
                <dt className="text-sm text-stone-500">{fact.label}</dt>
                <dd className="text-sm font-medium text-stone-900">{fact.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="customer-details">
          <h2 id="customer-details" className="mb-3 text-base font-semibold text-stone-800">
            Customer
          </h2>
          <dl className="divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white">
            {job.contactName && <Detail label="Contact">{job.contactName}</Detail>}
            {job.phone && (
              <Detail label="Phone">
                <a href={job.phone.href} className="text-emerald-800 underline underline-offset-2">
                  {job.phone.label}
                </a>
              </Detail>
            )}
            {job.email && (
              <Detail label="Email">
                <a href={job.email.href} className="break-all text-emerald-800 underline underline-offset-2">
                  {job.email.label}
                </a>
              </Detail>
            )}
            {job.address && <Detail label="Address">{job.address}</Detail>}
            {job.customerNotes && <Detail label="Notes">{job.customerNotes}</Detail>}
          </dl>
        </section>
      </div>

      <section aria-labelledby="history" className="mt-10">
        <h2 id="history" className="mb-4 text-xl font-semibold text-stone-950">
          History
        </h2>
        <Timeline entries={job.timeline} />
      </section>

      <section aria-labelledby="other-jobs" className="mt-10">
        <h2 id="other-jobs" className="text-xl font-semibold text-stone-950">
          Other jobs for {job.name}
        </h2>
        <p className="mt-1 text-stone-600">
          {job.customerHistory.summary && <>{job.customerHistory.summary} · </>}
          <Link href={job.customerHref} className="font-semibold text-emerald-800 underline underline-offset-2">
            See their full history
          </Link>
        </p>
        {job.customerHistory.jobs.length === 0 ? (
          <p className="mt-2 text-stone-600">This is their first job with us.</p>
        ) : (
          <ul className="mt-3 divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white">
            {job.customerHistory.jobs.map((other) => (
              <li key={other.jobId}>
                <Link
                  href={other.href}
                  className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-stone-900"
                >
                  <span className="min-w-0">
                    <span className="block font-medium text-stone-900">{other.problem}</span>
                    <span className="text-sm text-stone-500">{other.when}</span>
                  </span>
                  <StatusBadge status={other.status} label={other.statusLabel} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-3 px-4 py-2.5">
      <dt className="text-sm text-stone-500">{label}</dt>
      <dd className="text-sm font-medium text-stone-900">{children}</dd>
    </div>
  );
}
