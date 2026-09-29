"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { submitServiceRequestAction } from "@/app/public-request-actions";
import { IDLE } from "@/lib/action-state";
import { BUSINESS_PHONE } from "@/lib/config";
import { HONEYPOT_FIELD, PUBLIC_THANK_YOU } from "@/lib/public-request";
import { buttonBase } from "../button-styles";
import { fieldError, FormMessage, TextArea, TextField } from "../form-fields";
import { Icon } from "../icons";

/** The public form, or the thank-you once it's sent. "Send another" starts a fresh form. */
export function PublicRequest() {
  const [attempt, setAttempt] = useState(0);
  return <RequestForm key={attempt} onSendAnother={() => setAttempt((n) => n + 1)} />;
}

function RequestForm({ onSendAnother }: { onSendAnother: () => void }) {
  const [state, formAction, pending] = useActionState(submitServiceRequestAction, IDLE);

  if (state.status === "success") return <ThankYou onSendAnother={onSendAnother} />;

  return (
    <form action={formAction} noValidate className="mt-8 space-y-5">
      <FormMessage state={state} />

      <TextField name="name" label="Name" autoComplete="name" maxLength={120} error={fieldError(state, "name")} />
      <TextField
        name="businessName"
        label="Business (optional)"
        autoComplete="organization"
        maxLength={120}
        error={fieldError(state, "businessName")}
      />
      <TextField
        name="phone"
        label="Phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        maxLength={40}
        error={fieldError(state, "phone")}
      />
      <TextField
        name="email"
        label="Email (optional)"
        type="email"
        autoComplete="email"
        maxLength={254}
        error={fieldError(state, "email")}
      />
      <TextField
        name="address"
        label="Address (optional)"
        autoComplete="street-address"
        maxLength={200}
        error={fieldError(state, "address")}
      />
      <TextArea
        name="description"
        label="What's wrong?"
        rows={4}
        maxLength={500}
        placeholder="For example: walk-in cooler reading 48°F since this morning"
        error={fieldError(state, "description")}
      />

      <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-stone-300 bg-white px-3 py-3 hover:border-stone-400 has-checked:border-red-400 has-checked:bg-red-50 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-stone-900">
        <input type="checkbox" name="isEmergency" value="yes" className="mt-0.5 size-5 shrink-0 accent-red-600" />
        <span>
          <span className="block font-semibold text-stone-900">Is this an emergency?</span>
          <span className="block text-sm text-stone-600">Tick this if equipment is down or food is at risk.</span>
        </span>
      </label>

      {/* Spam trap: invisible to people, skipped by the keyboard and screen readers. */}
      <div aria-hidden="true" className="sr-only">
        <label htmlFor="request-website">Leave this field empty</label>
        <input id="request-website" type="text" name={HONEYPOT_FIELD} tabIndex={-1} autoComplete="off" />
      </div>

      <button
        type="submit"
        disabled={pending}
        className={`${buttonBase} w-full bg-emerald-700 text-lg text-white hover:bg-emerald-800 sm:w-auto sm:px-8`}
      >
        {pending ? "Sending…" : "Send request"}
      </button>
    </form>
  );
}

function ThankYou({ onSendAnother }: { onSendAnother: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  // Move focus to the confirmation so screen-reader users hear it.
  useEffect(() => heading.current?.focus(), []);

  return (
    <section className="mt-8 rounded-2xl border border-stone-200 bg-white px-6 py-10 text-center shadow-sm">
      <Icon name="check" className="mx-auto size-12 text-emerald-600" />
      <h2 ref={heading} tabIndex={-1} className="mt-4 text-2xl font-semibold text-stone-950 focus:outline-none">
        {PUBLIC_THANK_YOU}
      </h2>
      <p className="mx-auto mt-2 max-w-sm text-stone-700">
        We&apos;ll call you back as soon as we can. If it&apos;s an emergency, call us at{" "}
        <a href={`tel:+1${BUSINESS_PHONE.replace(/\D/g, "")}`} className="font-semibold whitespace-nowrap text-emerald-800 underline underline-offset-2">
          {BUSINESS_PHONE}
        </a>
        .
      </p>
      <button
        type="button"
        onClick={onSendAnother}
        className={`${buttonBase} mt-6 border border-stone-300 bg-white text-stone-900 hover:bg-stone-50`}
      >
        Send another request
      </button>
    </section>
  );
}
