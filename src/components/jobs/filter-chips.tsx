import Link from "next/link";
import type { FilterChip } from "@/lib/jobs-view";

/** One row of status filters with counts. Scrolls sideways on phones. */
export function FilterChips({ chips }: { chips: FilterChip[] }) {
  return (
    <nav aria-label="Filter jobs by status" className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
      <ul className="flex gap-2 sm:flex-wrap">
        {chips.map((chip) => (
          <li key={chip.filter} className="shrink-0">
            <Link
              href={chip.href}
              aria-current={chip.current ? "page" : undefined}
              className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-semibold whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900 ${
                chip.current
                  ? "border-stone-900 bg-stone-900 text-white"
                  : "border-stone-300 bg-white text-stone-800 hover:border-stone-400"
              }`}
            >
              {chip.label}
              <span
                className={`rounded-full px-1.5 text-xs tabular-nums ${chip.current ? "bg-white/20" : "bg-stone-100 text-stone-700"}`}
              >
                {chip.count}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
