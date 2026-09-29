"use client";

import { useActionState } from "react";
import { IDLE, type ActionState } from "@/lib/action-state";

type ServerAction = (state: ActionState, formData: FormData) => Promise<ActionState>;

/** Submit a form to a Server Action; on success, hand the confirmation up so the dialog can close. */
export function useActionForm(action: ServerAction, onDone: (message: string) => void) {
  return useActionState(async (previous: ActionState, formData: FormData) => {
    const result = await action(previous, formData);
    if (result.status === "success") onDone(result.message);
    return result;
  }, IDLE);
}
