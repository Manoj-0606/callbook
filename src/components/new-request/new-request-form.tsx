"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createRequestAction, lookupCustomerAction } from "@/app/request-actions";
import type { CallbackChoice } from "@/lib/callback-choices";
import { SOURCE_LABELS, type JobSource, type LocalDate } from "@/lib/domain";
import type { RepeatCustomerView } from "@/lib/new-request";
import { phoneDigits } from "@/lib/phone";
import { CallbackPicker } from "../callback-picker";
import {
  Choices,
  fieldError,
  FormFooter,
  FormMessage,
  NoteField,
  TextArea,
  TextField,
  type Choice,
} from "../form-fields";
import { useActionForm } from "../use-action-form";

const SOURCE_ORDER: JobSource[] = ["phone", "text", "email", "website", "referral", "repeat", "other"];
const SOURCES: Choice[] = SOURCE_ORDER.map((source) => ({ value: source, label: SOURCE_LABELS[source] }));
const LOOKUP_DELAY_MS = 300;
const MIN_LOOKUP_DIGITS = 7;
const OPTIONAL_FIELDS = ["email", "address", "note", "callbackOn"];

export function NewRequestForm({
  today,
  callbackChoices,
  onDone,
  onLeave,
}: {
  today: LocalDate;
  callbackChoices: CallbackChoice[];
  onDone: (message: string) => void;
  /** Close the dialog when a link takes her to another page. */
  onLeave: () => void;
}) {
  const [state, formAction, pending] = useActionForm(createRequestAction, onDone);

  const [phone, setPhone] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [name, setName] = useState("");
  // `chosen` once Denise picks a source herself; until then a match can suggest "Repeat customer".
  const [source, setSource] = useState({ value: "phone", chosen: false });
  const [match, setMatch] = useState<RepeatCustomerView | null>(null);
  const [checking, setChecking] = useState(false);
  const [showMore, setShowMore] = useState(false);

  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latestLookup = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);

  // Runs after a delay, so it only uses updater functions: they see what Denise
  // has typed since, and never overwrite it.
  function showMatch(found: RepeatCustomerView | null) {
    setMatch(found);
    if (found) {
      setBusinessName((typed) => typed || (found.prefill.businessName ?? ""));
      setName((typed) => typed || (found.prefill.name ?? ""));
    }
    setSource((current) => (current.chosen ? current : { value: found ? "repeat" : "phone", chosen: false }));
  }

  function changePhone(value: string) {
    setPhone(value);
    clearTimeout(timer.current);
    const lookup = ++latestLookup.current;

    if ((phoneDigits(value)?.length ?? 0) < MIN_LOOKUP_DIGITS) {
      setChecking(false);
      showMatch(null);
      return;
    }
    setChecking(true);
    timer.current = setTimeout(async () => {
      const found = await lookupCustomerAction(value).catch(() => null);
      // Ignore answers for a number she has since changed.
      if (lookup !== latestLookup.current) return;
      setChecking(false);
      showMatch(found);
    }, LOOKUP_DELAY_MS);
  }

  const moreOpen = showMore || OPTIONAL_FIELDS.some((field) => fieldError(state, field));

  return (
    <form action={formAction} noValidate className="space-y-4">
      <FormMessage state={state} />

      <div>
        <TextField
          name="phone"
          label="Phone"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          autoFocus
          placeholder="(512) 555-0123"
          value={phone}
          onChange={(event) => changePhone(event.target.value)}
          error={fieldError(state, "phone")}
        />
        {checking && <p className="mt-1.5 text-sm text-stone-500">Checking for an existing customer…</p>}
        {match && !checking && <RepeatCustomer match={match} onLeave={onLeave} />}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          name="businessName"
          label="Business"
          autoComplete="off"
          placeholder="Rosa's Taqueria"
          value={businessName}
          onChange={(event) => setBusinessName(event.target.value)}
          error={fieldError(state, "businessName")}
        />
        <TextField
          name="name"
          label="Contact person"
          autoComplete="off"
          placeholder="Rosa Martinez"
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={fieldError(state, "name")}
        />
      </div>

      <TextArea
        name="description"
        label="What's wrong?"
        rows={2}
        maxLength={500}
        placeholder="Walk-in cooler at 48°F"
        error={fieldError(state, "description")}
      />

      <Choices
        name="source"
        legend="Where did it come from?"
        choices={SOURCES}
        value={source.value}
        onChange={(value) => setSource({ value, chosen: true })}
        error={fieldError(state, "source")}
        columns="tight"
      />
      {source.value === "referral" && (
        <TextField
          name="referredBy"
          label="Who referred them? (optional)"
          placeholder="Earl at Sunrise Diner"
          error={fieldError(state, "referredBy")}
        />
      )}

      <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-stone-300 bg-white px-3 py-3 hover:border-stone-400 has-checked:border-red-400 has-checked:bg-red-50 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-stone-900">
        <input type="checkbox" name="isEmergency" value="yes" className="mt-0.5 size-5 shrink-0 accent-red-600" />
        <span>
          <span className="block font-semibold text-stone-900">Emergency</span>
          <span className="block text-sm text-stone-600">Equipment down or product at risk. Goes to the top of the list.</span>
        </span>
      </label>

      <div>
        <button
          type="button"
          aria-expanded={moreOpen}
          onClick={() => setShowMore(!moreOpen)}
          className="text-sm font-semibold text-emerald-800 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
        >
          {moreOpen ? "− Hide extra details" : "+ Email, address, notes or a callback date"}
        </button>
        {/* Kept mounted when hidden so anything typed is still saved. */}
        <div className={moreOpen ? "mt-4 space-y-4" : "hidden"}>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField name="email" label="Email" type="email" autoComplete="off" error={fieldError(state, "email")} />
            <TextField name="address" label="Address" autoComplete="off" error={fieldError(state, "address")} />
          </div>
          <NoteField label="Notes" error={fieldError(state, "note")} placeholder="Anything else they said" />
          <CallbackPicker
            legend="Call back on"
            optional
            choices={callbackChoices}
            today={today}
            error={fieldError(state, "callbackOn")}
            hint="Without a date it goes on today's list. A later date keeps it off your list until then."
          />
        </div>
      </div>

      <FormFooter pending={pending} submitLabel="Add request" />
    </form>
  );
}

/** Links close the dialog: it lives in the header, which stays put when the page changes. */
function RepeatCustomer({ match, onLeave }: { match: RepeatCustomerView; onLeave: () => void }) {
  return (
    <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm" role="status">
      <p className="font-semibold text-emerald-900">{match.title}</p>
      <p className="text-emerald-900">
        The new request goes on their existing record.
        {" "}
        <Link href={match.customerHref} onClick={onLeave} className="font-semibold underline underline-offset-2">
          See their history
        </Link>
      </p>
      {match.warning && (
        <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-950">
          <p className="font-semibold">{match.warning}</p>
          <ul className="mt-1 list-disc pl-5">
            {match.openJobs.map((job) => (
              <li key={job.href}>
                <Link href={job.href} onClick={onLeave} className="underline underline-offset-2">
                  {job.label}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-1">If it&apos;s the same problem, log a call on that job instead.</p>
        </div>
      )}
    </div>
  );
}
