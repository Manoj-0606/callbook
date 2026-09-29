import { createSessionToken, SESSION_COOKIE } from "../lib/auth";

/**
 * A stand-in for `next/headers` in Server Action tests. The cookie jar holds a
 * valid Callbook session while `testSession.signedIn` is true; tests flip it
 * to check what a signed-out visitor can (and can't) do.
 *
 *   vi.mock("next/headers", async () => (await import("@/test/session")).mockedHeaders());
 */
export const testSession = {
  signedIn: true,
  /** Cookies the code tried to set or delete, in order. */
  written: [] as { name: string; value: string }[],
};

export function mockedHeaders() {
  return {
    cookies: async () => {
      const token = testSession.signedIn ? (await createSessionToken(process.env.AUTH_SECRET!)).value : undefined;
      return {
        get: (name: string) => (name === SESSION_COOKIE && token ? { name, value: token } : undefined),
        set: (name: string, value: string) => void testSession.written.push({ name, value }),
        delete: (name: string) => void testSession.written.push({ name, value: "" }),
      };
    },
  };
}
