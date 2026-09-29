import Link from "next/link";
import type { CardView } from "@/lib/today-view";
import { Icon } from "../icons";
import { buttonBase } from "../button-styles";
import { JobActions } from "../actions/job-actions";

export function JobCard({ card }: { card: CardView }) {
  const { contact } = card;

  return (
    <article
      className={`relative rounded-xl border bg-white p-4 shadow-sm sm:p-5 ${
        card.isEmergency ? "border-red-300 ring-1 ring-red-200" : "border-stone-200"
      }`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        {/* Right padding on phones leaves room for the "More" button in the corner. */}
        <div className="min-w-0 flex-1 pr-10 sm:pr-0">
          {card.isEmergency && (
            <p className="mb-2 inline-block rounded bg-red-600 px-2 py-0.5 text-xs font-bold tracking-wide text-white uppercase">
              Emergency
            </p>
          )}
          <h3 className="text-lg leading-snug font-semibold text-stone-950 sm:text-xl">
            <Link href={card.href} className="underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900">
              {card.name}
            </Link>
          </h3>
          {(card.contactName || contact) && (
            <p className="mt-0.5 text-stone-600">
              {card.contactName}
              {card.contactName && contact && <span aria-hidden="true"> · </span>}
              {contact && (
                <a href={contact.href} className="underline-offset-2 hover:text-stone-950 hover:underline">
                  {contact.label}
                </a>
              )}
            </p>
          )}

          <p className="mt-3 text-stone-800">{card.problem}</p>
          <p className="mt-2 font-medium text-stone-950">{card.reason}</p>
          {card.facts && <p className="mt-0.5 text-sm text-stone-600">{card.facts}</p>}
          {card.hint && (
            <p className="mt-2 text-sm">
              <Link href={card.customerHref} className="text-stone-500 underline underline-offset-2 hover:text-stone-900">
                {card.hint}
              </Link>
            </p>
          )}
        </div>

        {/* Phone: Call fills the row and the action keeps its natural width, so neither wraps. */}
        <div className="flex gap-2 sm:w-44 sm:flex-col">
          {contact && (
            <a
              href={contact.href}
              aria-label={`${contact.kind === "phone" ? "Call" : "Email"} ${card.name}`}
              className={`${buttonBase} flex-1 gap-2 bg-emerald-700 whitespace-nowrap text-white hover:bg-emerald-800 sm:flex-none`}
            >
              <Icon name={contact.kind === "phone" ? "phone" : "mail"} />
              {contact.kind === "phone" ? "Call" : "Email"}
            </a>
          )}
          <JobActions card={card} />
        </div>
      </div>
    </article>
  );
}
