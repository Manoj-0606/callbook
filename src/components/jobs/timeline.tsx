import Link from "next/link";
import type { TimelineEntry, TimelineKind } from "@/lib/timeline";

/** A dot color per kind of entry, so calls, quotes and visits stand apart when scanning. */
const DOTS: Record<TimelineKind, string> = {
  request: "bg-sky-500",
  contact: "bg-emerald-600",
  attempt: "bg-stone-400",
  quote: "bg-violet-500",
  visit: "bg-indigo-500",
  callback: "bg-amber-500",
  note: "bg-stone-500",
  status: "bg-stone-800",
};

type Entry = TimelineEntry & { job?: { label: string; href: string } };

/**
 * A history of timeline entries, in the order given. On a customer's page each
 * entry also names the job it belongs to, linking to that job.
 */
export function Timeline({ entries }: { entries: Entry[] }) {
  if (entries.length === 0) return <p className="text-stone-600">Nothing recorded yet.</p>;
  return (
    <ol className="relative space-y-5 border-l-2 border-stone-200 pl-6">
      {entries.map((entry) => (
        <li key={entry.id} className="relative">
          <span
            aria-hidden="true"
            className={`absolute top-1.5 -left-[31px] size-3 rounded-full ring-4 ring-stone-50 ${DOTS[entry.kind]}`}
          />
          <p className="text-sm text-stone-500">
            <time>{entry.when}</time>
          </p>
          <p className="font-semibold text-stone-950">{entry.title}</p>
          {entry.job && (
            <p className="text-sm">
              <Link href={entry.job.href} className="text-emerald-800 underline underline-offset-2 hover:text-emerald-950">
                {entry.job.label}
              </Link>
            </p>
          )}
          {entry.details.map((detail) => (
            <p key={detail} className="text-sm text-stone-700">
              {detail}
            </p>
          ))}
          {entry.note && (
            <p className="mt-1.5 rounded-lg bg-white px-3 py-2 text-stone-800 shadow-sm ring-1 ring-stone-200">
              {entry.note}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}
