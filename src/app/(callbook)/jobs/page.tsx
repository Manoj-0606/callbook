import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { FilterChips } from "@/components/jobs/filter-chips";
import { JobRow } from "@/components/jobs/job-row";
import { JobSearch } from "@/components/jobs/job-search";
import { db } from "@/db";
import { loadJobsView } from "@/db/queries/jobs";
import { jobsHref, parseJobsQuery } from "@/lib/jobs-view";

export const metadata: Metadata = { title: "Jobs" };

export default async function JobsPage({ searchParams }: PageProps<"/jobs">) {
  await connection();
  const query = parseJobsQuery(await searchParams);
  const view = await loadJobsView(db, query, new Date());

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pt-6 pb-16 sm:px-6 sm:pt-10">
      <header className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-stone-950 sm:text-4xl">Jobs</h1>
        <p className="mt-1 text-lg text-stone-600">{view.openJobsLabel}</p>
      </header>

      <div className="space-y-4">
        <JobSearch filter={query.filter} query={query.q} />
        <FilterChips chips={view.chips} />
      </div>

      <p className="mt-6 mb-3 text-sm font-medium text-stone-600" aria-live="polite">
        {view.resultLabel}
      </p>

      {view.empty ? (
        <section className="rounded-2xl border border-stone-200 bg-white px-6 py-10 text-center shadow-sm">
          <h2 className="text-lg font-semibold text-stone-950">{view.empty.title}</h2>
          {view.empty.hint && <p className="mx-auto mt-1 max-w-sm text-stone-600">{view.empty.hint}</p>}
          {query.q && (
            <Link
              href={jobsHref({ filter: query.filter })}
              className="mt-4 inline-block font-semibold text-emerald-800 underline underline-offset-2"
            >
              Clear search
            </Link>
          )}
        </section>
      ) : (
        <ul className="space-y-3">
          {view.rows.map((row) => (
            <li key={row.jobId}>
              <JobRow row={row} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
