import Link from "next/link";

export default function CustomerNotFound() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pt-6 pb-16 sm:px-6 sm:pt-10">
      <section className="rounded-2xl border border-stone-200 bg-white px-6 py-12 text-center shadow-sm">
        <h1 className="text-2xl font-semibold text-stone-950">We couldn&apos;t find that customer.</h1>
        <p className="mx-auto mt-2 max-w-sm text-stone-600">The link may be wrong. Search for them on the Jobs page.</p>
        <Link href="/jobs" className="mt-6 inline-block font-semibold text-emerald-800 underline underline-offset-2">
          Go to Jobs
        </Link>
      </section>
    </main>
  );
}
