import path from "node:path";
import { migrate } from "drizzle-orm/libsql/migrator";
import type { Database } from "./client";

export const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

/** Apply any pending migrations from `drizzle/`. Safe to run repeatedly. */
export async function runMigrations(db: Database): Promise<void> {
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}
