/** Shown while today's list loads: the shape of the page, without content. */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pt-6 pb-16 sm:px-6 sm:pt-10">
      <p role="status" className="sr-only">
        Loading today&apos;s list…
      </p>
      <div aria-hidden="true" className="motion-safe:animate-pulse">
        <div className="h-4 w-44 rounded bg-stone-200" />
        <div className="mt-3 h-9 w-64 rounded bg-stone-200" />
        <div className="mt-3 h-5 w-28 rounded bg-stone-200" />

        {[3, 2].map((cards, section) => (
          <div key={section} className="mt-10">
            <div className="mb-3 h-5 w-56 rounded bg-stone-200" />
            <div className="space-y-3">
              {Array.from({ length: cards }, (_, i) => (
                <div key={i} className="h-36 rounded-xl border border-stone-200 bg-white" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
