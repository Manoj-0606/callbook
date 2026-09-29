"use client";

import { useState } from "react";
import type { CallbackChoice } from "@/lib/callback-choices";
import type { LocalDate } from "@/lib/domain";
import { Choices, TextField, type Choice } from "./form-fields";

/**
 * Quick callback dates (computed on the server, in Denise's timezone) plus
 * "Pick a date". Submits a single `callbackOn` date. When the callback is
 * optional it starts folded away, so the form stays short.
 */
export function CallbackPicker({
  legend,
  choices: callbackChoices,
  today,
  optional = false,
  error,
  hint,
}: {
  legend: string;
  choices: CallbackChoice[];
  today: LocalDate;
  optional?: boolean;
  error?: string;
  /** Shown under the choices, e.g. what a later date means. */
  hint?: string;
}) {
  const firstChoice = callbackChoices[0]?.date ?? "custom";
  const [choice, setChoice] = useState<string>(optional ? "" : firstChoice);
  const [customDate, setCustomDate] = useState<LocalDate>("");
  const expanded = !optional || choice !== "" || Boolean(error);

  const choices: Choice[] = [
    ...callbackChoices.map((c) => ({ value: c.date, label: c.label, hint: c.dateLabel })),
    { value: "custom", label: "Pick a date" },
  ];

  if (!expanded) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setChoice(firstChoice)}
          className="text-sm font-semibold text-emerald-800 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-900"
        >
          + Add a callback date
        </button>
        <input type="hidden" name="callbackOn" value="" />
      </div>
    );
  }

  return (
    <div>
      {optional && (
        <button
          type="button"
          onClick={() => setChoice("")}
          className="float-right text-sm font-medium text-stone-600 underline-offset-2 hover:text-stone-950 hover:underline"
        >
          Remove
        </button>
      )}
      <Choices
        name="callbackChoice"
        legend={legend}
        choices={choices}
        value={choice}
        onChange={setChoice}
        error={choice === "custom" ? undefined : error}
        columns={2}
      />
      {choice === "custom" && (
        <div className="mt-3">
          <TextField
            name="callbackCustom"
            label="Call back on"
            type="date"
            min={today}
            value={customDate}
            onChange={(event) => setCustomDate(event.target.value)}
            error={error}
          />
        </div>
      )}
      {hint && <p className="mt-2 text-sm text-stone-600">{hint}</p>}
      <input type="hidden" name="callbackOn" value={choice === "custom" ? customDate : choice} />
    </div>
  );
}
