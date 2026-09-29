import { cookies } from "next/headers";
import type { ActionState } from "./action-state";
import { authConfig, createSessionToken, SESSION_COOKIE, verifySessionToken } from "./auth";

/**
 * Reading and writing the Callbook session cookie on the server.
 *
 * Every internal Server Action calls `isSignedIn()` itself. The proxy can't
 * be relied on for them: a Server Action is picked by a request header, not
 * by the URL, so one could be posted to a public page's address.
 */

export async function isSignedIn(): Promise<boolean> {
  const config = authConfig();
  if (!config) return false;
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value, config.secret);
}

/** What an internal action returns when nobody is signed in. Nothing is read or changed. */
export const SIGNED_OUT: ActionState = {
  status: "error",
  message: "You've been signed out. Reload the page and sign in again.",
  fieldErrors: {},
};

export async function startSession(): Promise<void> {
  const config = authConfig();
  if (!config) throw new Error("Callbook sign-in isn't configured.");
  const { value, expires } = await createSessionToken(config.secret);
  const store = await cookies();
  store.set(SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
