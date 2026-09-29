/**
 * Where the database lives. Shared by the app, the CLI scripts and drizzle-kit.
 *
 * Locally this is a SQLite file. In production, point DATABASE_URL at a Turso
 * database (libsql://...) and set DATABASE_AUTH_TOKEN.
 */
export const DEFAULT_DATABASE_URL = "file:data/callbook.db";

export function getDatabaseConfig(env: Record<string, string | undefined> = process.env): {
  url: string;
  authToken?: string;
} {
  const url = env.DATABASE_URL || DEFAULT_DATABASE_URL;
  // Vercel has no lasting disk, so a SQLite file there would quietly lose every change.
  if (env.VERCEL && url.startsWith("file:")) {
    throw new Error("On Vercel, DATABASE_URL must point at the Turso database (libsql://…), not a local file.");
  }
  return { url, authToken: env.DATABASE_AUTH_TOKEN || undefined };
}
