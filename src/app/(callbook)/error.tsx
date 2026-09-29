"use client";

import { useEffect } from "react";

export default function TodayError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pt-6 pb-16 sm:px-6 sm:pt-10">
      <section role="alert" className="rounded-2xl border border-stone-200 bg-white px-6 py-12 text-center shadow-sm">
        <h1 className="text-2xl font-semibold text-stone-950">We couldn&apos;t load today&apos;s list.</h1>
        <p className="mx-auto mt-2 max-w-sm text-stone-600">
          Something went wrong on our side. Nothing was changed. Try again in a moment.
        </p>
        <button
          type="button"
          onClick={() => retry()}
          className="mt-6 inline-flex min-h-11 items-center justify-center rounded-lg bg-stone-900 px-5 py-2.5 font-semibold text-white hover:bg-stone-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
        >
          Try again
        </button>
      </section>
    </main>
  );
}
