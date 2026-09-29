import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Icon } from "@/components/icons";
import { JobRow } from "@/components/jobs/job-row";
import { Timeline } from "@/components/jobs/timeline";
import { db } from "@/db";
import { loadCustomerTitle, loadCustomerView } from "@/db/queries/customers";
import type { JobRowView } from "@/lib/jobs-view";

function parseId(raw: string): number | null {
  return /^\d+$/.test(raw) && Number(raw) > 0 ? Number(raw) : null;
}

export async function generateMetadata({ params }: PageProps<"/customers/[id]">): Promise<Metadata> {
  const id = parseId((await params).id);
  const name = id ? await loadCustomerTitle(db, id) : null;
  return { title: name ?? "Customer not found" };
}

/** Everything about one customer, across all their jobs. Read-only. */
export default async function CustomerPage({ params }: PageProps<"/customers/[id]">) {
  await connection();
  const id = parseId((await params).id);
  const customer = id ? await loadCustomerView(db, id, new Date()) : null;
  if (!customer) notFound();

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
        <p className="text-sm font-medium text-stone-500">Customer</p>
        <h1 className="text-3xl leading-tight font-bold tracking-tight text-stone-950">{customer.name}</h1>
        {customer.contactName && <p className="mt-1 text-lg text-stone-600">{customer.contactName}</p>}
        <p className="mt-2 text-stone-700">{customer.summary}</p>
      </header>

      {customer.phone && (
        <a
          href={customer.phone.href}
          aria-label={`Call ${customer.name}`}
          className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 font-semibold text-white hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
        >
          <Icon name="phone" />
          Call
        </a>
      )}

      <section aria-labelledby="contact-details" className="mt-8">
        <h2 id="contact-details" className="mb-3 text-base font-semibold text-stone-800">
          Contact details
        </h2>
        <dl className="divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white">
          {customer.contactName && <Detail label="Contact">{customer.contactName}</Detail>}
          {customer.phone && (
            <Detail label="Phone">
              <a href={customer.phone.href} className="text-emerald-800 underline underline-offset-2">
                {customer.phone.label}
              </a>
            </Detail>
          )}
          {customer.email && (
            <Detail label="Email">
              <a href={customer.email.href} className="break-all text-emerald-800 underline underline-offset-2">
                {customer.email.label}
              </a>
            </Detail>
          )}
          {customer.address && <Detail label="Address">{customer.address}</Detail>}
          {customer.notes && <Detail label="Notes">{customer.notes}</Detail>}
        </dl>
      </section>

      <JobList id="open-jobs" title="Open jobs" rows={customer.openJobs} empty="No open jobs right now." />
      <JobList id="previous-jobs" title="Previous jobs" rows={customer.previousJobs} empty="No previous jobs yet." />

      <section aria-labelledby="customer-history" className="mt-10">
        <h2 id="customer-history" className="text-xl font-semibold text-stone-950">
          History
        </h2>
        <p className="mt-1 mb-4 text-sm text-stone-600">Every job, newest first.</p>
        <Timeline entries={customer.timeline} />
      </section>
    </main>
  );
}

function JobList({ id, title, rows, empty }: { id: string; title: string; rows: JobRowView[]; empty: string }) {
  return (
    <section aria-labelledby={id} className="mt-10">
      <h2 id={id} className="mb-3 flex items-center gap-2 text-xl font-semibold text-stone-950">
        {title}
        <span className="rounded-full bg-stone-200 px-2 py-0.5 text-sm font-semibold text-stone-700 tabular-nums">
          {rows.length}
        </span>
      </h2>
      {rows.length === 0 ? (
        <p className="text-stone-600">{empty}</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.jobId}>
              <JobRow row={row} variant="customer" />
            </li>
          ))}
        </ul>
      )}
    </section>
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
