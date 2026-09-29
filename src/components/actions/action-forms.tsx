"use client";

import { useState } from "react";
import {
  addNoteAction,
  logCallAction,
  markDoneAction,
  markLostAction,
  markQuoteSentAction,
  scheduleAction,
  setCallbackAction,
} from "@/app/job-actions";
import { LOST_REASON_LABELS, LOST_REASONS } from "@/lib/domain";
import type { ActionKind } from "@/lib/job-actions";
import type { ActionTarget } from "@/lib/today-view";
import { buttonBase } from "../button-styles";
import {
  Choices,
  fieldError,
  FieldError,
  FormFooter,
  FormMessage,
  NoteField,
  TextField,
  type Choice,
} from "../form-fields";
import { CallbackPicker } from "../callback-picker";
import { useActionForm } from "../use-action-form";
import { useActionForms } from "../action-forms-provider";

type FormProps = { card: ActionTarget; onDone: (message: string) => void };

function JobIdField({ card }: { card: ActionTarget }) {
  return <input type="hidden" name="jobId" value={card.jobId} />;
}

export function ActionForm({ kind, ...props }: FormProps & { kind: ActionKind }) {
  switch (kind) {
    case "log_call":
      return <LogCallForm {...props} />;
    case "quote":
      return <QuoteForm {...props} />;
    case "schedule":
      return <ScheduleForm {...props} />;
    case "callback":
      return <CallbackForm {...props} />;
    case "note":
      return <NoteForm {...props} />;
    case "done":
      return <DoneForm {...props} />;
    case "lost":
      return <LostForm {...props} />;
  }
}

const OUTCOMES: Choice[] = [
  { value: "talked", label: "Talked to them" },
  { value: "voicemail", label: "Left voicemail" },
  { value: "no_answer", label: "No answer" },
];

function LogCallForm({ card, onDone }: FormProps) {
  const [state, formAction, pending] = useActionForm(logCallAction, onDone);
  const { callbackChoices, today } = useActionForms();
  const [outcome, setOutcome] = useState("talked");
  const { nextSteps, nextStepRequired, noAnswerHint } = card.form;
  const [nextStep, setNextStep] = useState<string | null>(nextStepRequired ? null : "");

  const stepChoices: Choice[] = [
    ...(nextStepRequired ? [] : [{ value: "", label: "No change" }]),
    ...nextSteps.map((step) => ({ value: step.value, label: step.label })),
  ];

  return (
    <form action={formAction} noValidate className="space-y-4">
      <JobIdField card={card} />
      <FormMessage state={state} />
      <div>
        <Choices
          name="outcome"
          legend="How did the call go?"
          choices={OUTCOMES}
          value={outcome}
          onChange={setOutcome}
          error={fieldError(state, "outcome")}
          columns={3}
        />
        {outcome === "no_answer" && <p className="mt-2 text-sm text-stone-600">{noAnswerHint}</p>}
      </div>

      {outcome === "talked" && nextSteps.length > 0 && (
        <Choices
          name="nextStep"
          legend="What happens next?"
          choices={stepChoices}
          value={nextStep}
          onChange={setNextStep}
          error={fieldError(state, "nextStep")}
        />
      )}

      <CallbackPicker
        legend="Call back on (optional)"
        optional
        choices={callbackChoices}
        today={today}
        error={fieldError(state, "callbackOn")}
      />
      <NoteField error={fieldError(state, "note")} placeholder="What did they say?" />
      <FormFooter pending={pending} submitLabel="Save call" />
    </form>
  );
}

function QuoteForm({ card, onDone }: FormProps) {
  const [state, formAction, pending] = useActionForm(markQuoteSentAction, onDone);
  return (
    <form action={formAction} noValidate className="space-y-4">
      <JobIdField card={card} />
      <FormMessage state={state} />
      <TextField
        name="amount"
        label="Quote amount"
        prefix="$"
        inputMode="decimal"
        autoComplete="off"
        placeholder="3,850"
        defaultValue={card.form.quoteAmount}
        error={fieldError(state, "amount")}
      />
      <NoteField error={fieldError(state, "note")} placeholder="What's included?" />
      <FormFooter pending={pending} submitLabel="Save quote" />
    </form>
  );
}

function ScheduleForm({ card, onDone }: FormProps) {
  const [state, formAction, pending] = useActionForm(scheduleAction, onDone);
  const { technicians, today } = useActionForms();
  const [technicianId, setTechnicianId] = useState<string | null>(
    card.form.technicianId ? String(card.form.technicianId) : null,
  );

  return (
    <form action={formAction} noValidate className="space-y-4">
      <JobIdField card={card} />
      <FormMessage state={state} />
      <Choices
        name="technicianId"
        legend="Who's going?"
        choices={technicians.map((t) => ({ value: String(t.id), label: t.name }))}
        value={technicianId}
        onChange={setTechnicianId}
        error={fieldError(state, "technicianId")}
        columns={2}
      />
      <TextField
        name="visitOn"
        label="Visit date"
        type="date"
        min={today}
        defaultValue={card.form.visitOn}
        error={fieldError(state, "visitOn")}
      />
      <NoteField error={fieldError(state, "note")} placeholder="Anything the tech should know?" />
      <FormFooter pending={pending} submitLabel="Save visit" />
    </form>
  );
}

function CallbackForm({ card, onDone }: FormProps) {
  const [state, formAction, pending] = useActionForm(setCallbackAction, onDone);
  const { callbackChoices, today } = useActionForms();
  return (
    <form action={formAction} noValidate className="space-y-4">
      <JobIdField card={card} />
      <FormMessage state={state} />
      <CallbackPicker
        legend="When should you call back?"
        choices={callbackChoices}
        today={today}
        error={fieldError(state, "callbackOn")}
      />
      <NoteField error={fieldError(state, "note")} placeholder="Why then?" />
      <FormFooter pending={pending} submitLabel="Set callback" />
    </form>
  );
}

function NoteForm({ card, onDone }: FormProps) {
  const [state, formAction, pending] = useActionForm(addNoteAction, onDone);
  return (
    <form action={formAction} noValidate className="space-y-4">
      <JobIdField card={card} />
      <FormMessage state={state} />
      <NoteField label="Note" required error={fieldError(state, "note")} />
      <FormFooter pending={pending} submitLabel="Save note" />
    </form>
  );
}

function DoneForm({ card, onDone }: FormProps) {
  const [state, formAction, pending] = useActionForm(markDoneAction, onDone);
  return (
    <form action={formAction} noValidate className="space-y-4">
      <JobIdField card={card} />
      <FormMessage state={state} />
      <p className="text-stone-700">This closes the job and takes it off your list.</p>
      <NoteField label="What was done? (optional)" error={fieldError(state, "note")} />
      <FormFooter pending={pending} submitLabel="Mark done" />
    </form>
  );
}

const LOST_CHOICES: Choice[] = LOST_REASONS.map((reason) => ({ value: reason, label: LOST_REASON_LABELS[reason] }));

/** Two steps: pick a reason, then confirm. Closing a job is the one thing that asks twice. */
function LostForm({ card, onDone }: FormProps) {
  const [state, formAction, pending] = useActionForm(markLostAction, onDone);
  const [reason, setReason] = useState<string | null>(null);
  const [step, setStep] = useState<"reason" | "confirm">("reason");
  const [missingReason, setMissingReason] = useState(false);

  function continueToConfirm() {
    if (!reason) {
      setMissingReason(true);
      return;
    }
    setStep("confirm");
  }

  const reasonLabel = reason ? LOST_REASON_LABELS[reason as keyof typeof LOST_REASON_LABELS] : "";

  return (
    <form action={formAction} noValidate className="space-y-4">
      <JobIdField card={card} />
      <FormMessage state={state} />

      {/* Kept mounted on the confirm step so the answers are still submitted. */}
      <div className={step === "confirm" ? "hidden" : "space-y-5"}>
        <Choices
          name="reason"
          legend="Why didn't it go ahead?"
          choices={LOST_CHOICES}
          value={reason}
          onChange={(value) => {
            setReason(value);
            setMissingReason(false);
          }}
          error={missingReason ? "Pick a reason." : fieldError(state, "reason")}
        />
        <NoteField error={fieldError(state, "note")} />
        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={continueToConfirm}
            className={`${buttonBase} bg-stone-900 text-white hover:bg-stone-800`}
          >
            Continue
          </button>
        </div>
      </div>

      {step === "confirm" && (
        <div className="space-y-5">
          <input type="hidden" name="confirmed" value="yes" />
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-900">
            <p className="font-semibold">Close {card.name}?</p>
            <p className="mt-1 text-sm">
              It comes off your list and is marked &ldquo;Didn&apos;t go ahead: {reasonLabel}&rdquo;.
            </p>
          </div>
          <FieldError id="lost-reason-error" message={fieldError(state, "reason")} />
          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setStep("reason")}
              className={`${buttonBase} border border-stone-300 bg-white text-stone-800 hover:bg-stone-50`}
            >
              Go back
            </button>
            <button
              type="submit"
              disabled={pending}
              className={`${buttonBase} bg-red-700 text-white hover:bg-red-800 disabled:cursor-wait disabled:opacity-70`}
            >
              {pending ? "Closing…" : "Yes, close this job"}
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
