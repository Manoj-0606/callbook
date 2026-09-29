"use client";

import { useActionState } from "react";
import { signInAction } from "@/app/auth-actions";
import { IDLE } from "@/lib/action-state";
import { buttonBase } from "./button-styles";
import { fieldError, FormMessage, TextField } from "./form-fields";

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(signInAction, IDLE);
  return (
    <form action={formAction} noValidate className="mt-8 space-y-4">
      <FormMessage state={state} />
      <input type="hidden" name="next" value={next} />
      <TextField
        name="password"
        label="Password"
        type="password"
        autoComplete="current-password"
        autoFocus
        error={fieldError(state, "password")}
      />
      <button type="submit" disabled={pending} className={`${buttonBase} w-full bg-stone-900 text-white hover:bg-stone-800`}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
