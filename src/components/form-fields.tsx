"use client";

import { useId } from "react";
import { MAX_NOTE_LENGTH } from "@/lib/action-inputs";
import type { ActionState } from "@/lib/action-state";
import { buttonBase } from "./button-styles";
import { DialogClose } from "./ui/responsive-dialog";

/** Field-level message from the server, if any. */
export function fieldError(state: ActionState, field: string): string | undefined {
  return state.status === "error" ? state.fieldErrors[field] : undefined;
}

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1.5 text-sm font-medium text-red-700">
      {message}
    </p>
  );
}

/** A problem with the form as a whole (not one field). */
export function FormMessage({ state }: { state: ActionState }) {
  if (state.status !== "error" || !state.message) return null;
  return (
    <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-800">
      {state.message}
    </p>
  );
}

export type Choice = { value: string; label: string; hint?: string };

/** Radio buttons as large tappable rows. Controlled. */
export function Choices({
  name,
  legend,
  choices,
  value,
  onChange,
  error,
  columns = 1,
}: {
  name: string;
  legend: string;
  choices: Choice[];
  value: string | null;
  onChange: (value: string) => void;
  error?: string;
  /** "tight": two across on phones, three on larger screens, for short labels. */
  columns?: 1 | 2 | 3 | "tight";
}) {
  const errorId = useId();
  const grid = { 1: "", 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", tight: "grid-cols-2 sm:grid-cols-3" }[columns];
  return (
    <fieldset aria-describedby={error ? errorId : undefined} aria-invalid={error ? true : undefined}>
      <legend className="mb-2 text-sm font-semibold text-stone-800">{legend}</legend>
      <div className={`grid gap-2 ${grid}`}>
        {choices.map((choice) => (
          <label
            key={choice.value}
            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-stone-300 bg-white px-3 py-2.5 hover:border-stone-400 has-checked:border-emerald-700 has-checked:bg-emerald-50 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-stone-900"
          >
            <input
              type="radio"
              name={name}
              value={choice.value}
              checked={value === choice.value}
              onChange={() => onChange(choice.value)}
              className="size-4 shrink-0 accent-emerald-700 focus:outline-none"
            />
            <span className="font-medium text-stone-900">{choice.label}</span>
            {choice.hint && <span className="ml-auto text-sm whitespace-nowrap text-stone-500">{choice.hint}</span>}
          </label>
        ))}
      </div>
      <FieldError id={errorId} message={error} />
    </fieldset>
  );
}

export function TextField({
  name,
  label,
  error,
  prefix,
  ...input
}: {
  name: string;
  label: string;
  error?: string;
  prefix?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-semibold text-stone-800">
        {label}
      </label>
      <div className="relative">
        {prefix && (
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-stone-500">{prefix}</span>
        )}
        <input
          id={id}
          name={name}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={`block min-h-11 w-full rounded-lg border bg-white px-3 py-2.5 text-base text-stone-950 focus:border-stone-900 focus:outline-2 focus:outline-offset-0 focus:outline-stone-900 ${
            prefix ? "pl-7" : ""
          } ${error ? "border-red-400" : "border-stone-300"}`}
          {...input}
        />
      </div>
      <FieldError id={errorId} message={error} />
    </div>
  );
}

export function TextArea({
  name,
  label,
  error,
  rows = 3,
  ...textarea
}: {
  name: string;
  label: string;
  error?: string;
  rows?: number;
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-semibold text-stone-800">
        {label}
      </label>
      <textarea
        id={id}
        name={name}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={`block w-full rounded-lg border bg-white px-3 py-2.5 text-base text-stone-950 focus:border-stone-900 focus:outline-2 focus:outline-offset-0 focus:outline-stone-900 ${
          error ? "border-red-400" : "border-stone-300"
        }`}
        {...textarea}
      />
      <FieldError id={errorId} message={error} />
    </div>
  );
}

export function NoteField({
  label = "Note (optional)",
  error,
  required = false,
  placeholder,
}: {
  label?: string;
  error?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <TextArea
      name="note"
      label={label}
      error={error}
      maxLength={MAX_NOTE_LENGTH}
      aria-required={required || undefined}
      placeholder={placeholder}
    />
  );
}


export function FormFooter({
  pending,
  submitLabel,
  destructive = false,
}: {
  pending: boolean;
  submitLabel: string;
  destructive?: boolean;
}) {
  return (
    <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
      <DialogClose className={`${buttonBase} border border-stone-300 bg-white text-stone-800 hover:bg-stone-50`}>
        Cancel
      </DialogClose>
      <button
        type="submit"
        disabled={pending}
        className={`${buttonBase} text-white ${
          destructive ? "bg-red-700 hover:bg-red-800" : "bg-emerald-700 hover:bg-emerald-800"
        }`}
      >
        {pending ? "Saving…" : submitLabel}
      </button>
    </div>
  );
}

