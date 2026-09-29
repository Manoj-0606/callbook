import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { getDatabaseConfig } from "./config";
import * as schema from "./schema";

export type Database = ReturnType<typeof createDatabase>;

export function createDatabase(config = getDatabaseConfig()) {
  ensureLocalDirectory(config.url);
  const client = createClient({ url: config.url, authToken: config.authToken });
  return drizzle(client, { schema });
}

/** SQLite won't create missing parent folders, so make sure `data/` exists. */
function ensureLocalDirectory(url: string) {
  if (!url.startsWith("file:") || url.includes(":memory:")) return;
  const filePath = url.startsWith("file://")
    ? fileURLToPath(url.split("?")[0])
    : url.slice("file:".length).split("?")[0];
  mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
}
