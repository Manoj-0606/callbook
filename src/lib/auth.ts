/**
 * A single shared password in front of Callbook, and a signed cookie that
 * remembers it. No accounts or roles: this is one small business's office tool.
 *
 * Kept free of Next.js imports so the proxy, the Server Actions and the tests
 * can all use it. Uses Web Crypto, which works in both.
 *
 * The password and signing secret only ever come from the environment:
 *   CALLBOOK_PASSWORD  what Denise types in
 *   AUTH_SECRET        a long random string used to sign the session cookie
 * If either is missing, nobody can sign in (fail closed).
 */

export const SESSION_COOKIE = "callbook_session";
export const SESSION_DAYS = 30;
const MIN_SECRET_LENGTH = 32;
const TOKEN_VERSION = "v1";

/** Pages anyone can open: the public request form and the sign-in page. */
const PUBLIC_PATHS = ["/request", "/login"];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname === `${path}/`);
}

export type AuthConfig = { password: string; secret: string };

/** The configured password and secret, or null if Callbook isn't set up for sign-in. */
export function authConfig(env: Record<string, string | undefined> = process.env): AuthConfig | null {
  const password = env.CALLBOOK_PASSWORD ?? "";
  const secret = env.AUTH_SECRET ?? "";
  if (!password || secret.length < MIN_SECRET_LENGTH) return null;
  return { password, secret };
}

/** A session token: "v1.<expiry ms>.<signature>". */
export async function createSessionToken(secret: string, now: Date = new Date()): Promise<{ value: string; expires: Date }> {
  const expires = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const payload = `${TOKEN_VERSION}.${expires.getTime()}`;
  return { value: `${payload}.${await sign(secret, payload)}`, expires };
}

/** True only for an unexpired token signed with this secret. */
export async function verifySessionToken(token: string | undefined, secret: string, now: Date = new Date()): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== TOKEN_VERSION) return false;

  const expiresAt = Number(parts[1]);
  if (!/^\d+$/.test(parts[1]) || !Number.isSafeInteger(expiresAt) || expiresAt <= now.getTime()) return false;

  return timingSafeEqual(parts[2], await sign(secret, `${parts[0]}.${parts[1]}`));
}

/** Compare passwords without leaking how much of a guess was right through timing. */
export async function passwordMatches(given: string, expected: string, secret: string): Promise<boolean> {
  const [a, b] = await Promise.all([sign(secret, `password:${given}`), sign(secret, `password:${expected}`)]);
  return timingSafeEqual(a, b);
}

/**
 * Where to go after signing in. Only paths inside Callbook are allowed, so a
 * crafted link can't bounce Denise to another site.
 */
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  if (raw === "/login" || raw.startsWith("/login?") || raw.startsWith("/login/")) return "/";
  return raw;
}

async function sign(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
  let binary = "";
  for (const byte of signature) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}
