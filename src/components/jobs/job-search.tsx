"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { jobsHref, type JobFilter } from "@/lib/jobs-view";

const SEARCH_DELAY_MS = 250;

/**
 * Search as you type. The URL holds the search, so results survive a reload
 * and the back button works. Also works as a plain GET form without JavaScript.
 */
export function JobSearch({ filter, query }: { filter: JobFilter; query: string }) {
  const router = useRouter();
  const [text, setText] = useState(query);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  // When the search changes from outside (a "Clear search" link, the back
  // button), show it, without losing what she's in the middle of typing.
  const [shownQuery, setShownQuery] = useState(query);
  if (query !== shownQuery) {
    setShownQuery(query);
    if (query !== text.trim()) setText(query);
  }

  function go(value: string) {
    startTransition(() => router.replace(jobsHref({ filter, q: value.trim() }), { scroll: false }));
  }

  return (
    <form
      role="search"
      action="/jobs"
      method="get"
      onSubmit={(event) => {
        event.preventDefault();
        clearTimeout(timer.current);
        go(text);
      }}
      className="relative"
    >
      {filter !== "open" && <input type="hidden" name="status" value={filter} />}
      <label htmlFor="job-search" className="sr-only">
        Search jobs by name or phone
      </label>
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-stone-400"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path d="m21 21-4.35-4.35M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z" strokeLinecap="round" />
      </svg>
      <input
        id="job-search"
        name="q"
        type="search"
        autoComplete="off"
        placeholder="Name or phone number"
        value={text}
        onChange={(event) => {
          const value = event.target.value;
          setText(value);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => go(value), SEARCH_DELAY_MS);
        }}
        className="block min-h-12 w-full rounded-xl border border-stone-300 bg-white py-3 pr-24 pl-10 text-base text-stone-950 shadow-sm focus:border-stone-900 focus:outline-2 focus:outline-offset-0 focus:outline-stone-900"
      />
      {pending && (
        <span className="absolute top-1/2 right-3 -translate-y-1/2 text-sm text-stone-500" aria-live="polite">
          Searching…
        </span>
      )}
    </form>
  );
}
