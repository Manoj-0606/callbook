import Link from "next/link";
import type { JobRowView } from "@/lib/jobs-view";
import { Icon } from "../icons";
import { EmergencyBadge, StatusBadge } from "../status-badge";

/**
 * A job in a list. The whole card opens the job; the Call button still works on its own.
 *
 * variant "list":     the Jobs page, where each card is titled by the customer.
 * variant "customer": a customer's own page, where the name would repeat, so the
 *                     problem is the title and the page has one Call button instead.
 */
export function JobRow({ row, variant = "list" }: { row: JobRowView; variant?: "list" | "customer" }) {
  const forCustomer = variant === "customer";
  // On the Jobs page rows sit under the page title; on a customer page, under "Open jobs" / "Previous jobs".
  const Heading = forCustomer ? "h3" : "h2";
  return (
    <article className="relative rounded-xl border border-stone-200 bg-white p-4 shadow-sm hover:border-stone-300 has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-stone-900 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            <StatusBadge status={row.status} label={row.statusLabel} />
            {row.isEmergency && <EmergencyBadge />}
            {row.onToday && (
              <span className="inline-block rounded-md border border-stone-300 px-2 py-0.5 text-xs font-medium text-stone-700">
                On today&apos;s list
              </span>
            )}
          </div>
          <Heading className="text-lg leading-snug font-semibold text-stone-950">
            {/* Stretched over the whole card. */}
            <Link href={row.href} className="after:absolute after:inset-0 after:rounded-xl focus:outline-none">
              {forCustomer ? row.problem : row.name}
            </Link>
          </Heading>
          {!forCustomer && (row.contactName || row.contact) && (
            <p className="text-stone-600">{[row.contactName, row.contact?.label].filter(Boolean).join(" · ")}</p>
          )}
          {!forCustomer && <p className="mt-2 text-stone-800">{row.problem}</p>}
          <p className="mt-1 text-sm text-stone-600">{row.details}</p>
        </div>
        {!forCustomer && row.contact && (
          <a
            href={row.contact.href}
            aria-label={`${row.contact.kind === "phone" ? "Call" : "Email"} ${row.name}`}
            className="relative z-10 inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg bg-emerald-700 px-3.5 py-2.5 font-semibold text-white hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
          >
            <Icon name={row.contact.kind === "phone" ? "phone" : "mail"} />
            <span className="hidden sm:inline">{row.contact.kind === "phone" ? "Call" : "Email"}</span>
          </a>
        )}
      </div>
    </article>
  );
}
