"use server";

import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { authConfig, passwordMatches, safeNextPath } from "@/lib/auth";
import { endSession, startSession } from "@/lib/session";

/** A wrong password costs a moment, which slows down guessing. */
const WRONG_PASSWORD_DELAY_MS = 600;

export async function signInAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const config = authConfig();
  if (!config) {
    return {
      status: "error",
      message: "Sign-in isn't set up yet. Set CALLBOOK_PASSWORD and AUTH_SECRET, then restart.",
      fieldErrors: {},
    };
  }

  const password = formData.get("password");
  if (typeof password !== "string" || password.length === 0) {
    return { status: "error", message: null, fieldErrors: { password: "Enter the password." } };
  }

  if (!(await passwordMatches(password, config.password, config.secret))) {
    await new Promise((resolve) => setTimeout(resolve, WRONG_PASSWORD_DELAY_MS));
    return { status: "error", message: null, fieldErrors: { password: "That password isn't right." } };
  }

  await startSession();
  const next = formData.get("next");
  redirect(safeNextPath(typeof next === "string" ? next : null));
}

export async function signOutAction(): Promise<void> {
  await endSession();
  redirect("/login");
}
