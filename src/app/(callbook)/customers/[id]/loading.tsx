/** Shown while a customer loads: the shape of the Customer page, without content. */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pt-6 pb-16 sm:px-6 sm:pt-8">
      <p role="status" className="sr-only">
        Loading the customer…
      </p>
      <div aria-hidden="true" className="motion-safe:animate-pulse">
        <div className="h-4 w-32 rounded bg-stone-200" />
        <div className="mt-6 h-4 w-20 rounded bg-stone-200" />
        <div className="mt-2 h-9 w-60 rounded bg-stone-200" />
        <div className="mt-3 h-5 w-44 rounded bg-stone-200" />
        <div className="mt-5 h-11 w-24 rounded-lg bg-stone-200" />
        <div className="mt-8 h-40 rounded-xl border border-stone-200 bg-white" />
        <div className="mt-10 h-6 w-32 rounded bg-stone-200" />
        <div className="mt-3 space-y-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="h-24 rounded-xl border border-stone-200 bg-white" />
          ))}
        </div>
      </div>
    </main>
  );
}
