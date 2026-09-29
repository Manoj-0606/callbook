/** Shown while the jobs list loads: the shape of the page, without content. */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pt-6 pb-16 sm:px-6 sm:pt-10">
      <p role="status" className="sr-only">
        Loading jobs…
      </p>
      <div aria-hidden="true" className="motion-safe:animate-pulse">
        <div className="h-9 w-28 rounded bg-stone-200" />
        <div className="mt-3 h-5 w-28 rounded bg-stone-200" />
        <div className="mt-6 h-12 rounded-xl border border-stone-200 bg-white" />
        <div className="mt-4 flex gap-2">
          {[24, 16, 28, 24].map((w, i) => (
            <div key={i} className="h-10 rounded-full bg-stone-200" style={{ width: `${w * 4}px` }} />
          ))}
        </div>
        <div className="mt-6 space-y-3">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-32 rounded-xl border border-stone-200 bg-white" />
          ))}
        </div>
      </div>
    </main>
  );
}
