/** Shown while a job loads: the shape of the Job Detail page, without content. */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pt-6 pb-16 sm:px-6 sm:pt-8">
      <p role="status" className="sr-only">
        Loading the job…
      </p>
      <div aria-hidden="true" className="motion-safe:animate-pulse">
        <div className="h-4 w-32 rounded bg-stone-200" />
        <div className="mt-6 h-5 w-24 rounded bg-stone-200" />
        <div className="mt-3 h-9 w-64 rounded bg-stone-200" />
        <div className="mt-3 h-6 w-80 max-w-full rounded bg-stone-200" />
        <div className="mt-5 flex gap-2">
          <div className="h-11 w-24 rounded-lg bg-stone-200" />
          <div className="h-11 w-28 rounded-lg bg-stone-200" />
          <div className="h-11 w-24 rounded-lg bg-stone-200" />
        </div>
        <div className="mt-6 h-16 rounded-xl border border-stone-200 bg-white" />
        <div className="mt-8 grid gap-8 sm:grid-cols-2">
          <div className="h-56 rounded-xl border border-stone-200 bg-white" />
          <div className="h-40 rounded-xl border border-stone-200 bg-white" />
        </div>
        <div className="mt-10 h-6 w-28 rounded bg-stone-200" />
        <div className="mt-4 space-y-4">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="h-16 rounded-lg bg-stone-200/70" />
          ))}
        </div>
      </div>
    </main>
  );
}
