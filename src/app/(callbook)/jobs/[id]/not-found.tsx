import Link from "next/link";

export default function JobNotFound() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pt-6 pb-16 sm:px-6 sm:pt-10">
      <section className="rounded-2xl border border-stone-200 bg-white px-6 py-12 text-center shadow-sm">
        <h1 className="text-2xl font-semibold text-stone-950">We couldn&apos;t find that job.</h1>
        <p className="mx-auto mt-2 max-w-sm text-stone-600">It may have been removed, or the link is wrong.</p>
        <Link href="/jobs" className="mt-6 inline-block font-semibold text-emerald-800 underline underline-offset-2">
          Back to all jobs
        </Link>
      </section>
    </main>
  );
}
