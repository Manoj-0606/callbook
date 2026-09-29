import { createDatabase, type Database } from "./client";

// Reuse one client across hot reloads in development.
const globalForDb = globalThis as unknown as { callbookDb?: Database };

export const db = globalForDb.callbookDb ?? createDatabase();

if (process.env.NODE_ENV !== "production") {
  globalForDb.callbookDb = db;
}

export * from "./schema";
