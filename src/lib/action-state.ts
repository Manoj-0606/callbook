import type { FieldErrors } from "./action-inputs";

/** What an action form gets back from the server. */
export type ActionState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | { status: "error"; message: string | null; fieldErrors: FieldErrors };

export const IDLE: ActionState = { status: "idle" };
