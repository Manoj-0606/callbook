import type { JobStatus } from "@/lib/domain";

/** Each status gets its own color so it's recognisable at a glance; the label always says it in words. */
const TONES: Record<JobStatus, string> = {
  new: "bg-sky-100 text-sky-900",
  needs_quote: "bg-amber-100 text-amber-900",
  quote_sent: "bg-violet-100 text-violet-900",
  ready_to_schedule: "bg-emerald-100 text-emerald-900",
  scheduled: "bg-indigo-100 text-indigo-900",
  done: "bg-stone-200 text-stone-700",
  lost: "bg-stone-100 text-stone-600",
};

export function StatusBadge({ status, label }: { status: JobStatus; label: string }) {
  return <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold ${TONES[status]}`}>{label}</span>;
}

export function EmergencyBadge() {
  return (
    <span className="inline-block rounded-md bg-red-600 px-2 py-0.5 text-xs font-bold tracking-wide text-white uppercase">
      Emergency
    </span>
  );
}
