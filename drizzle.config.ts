import "./scripts/load-env";
import { defineConfig } from "drizzle-kit";
import { getDatabaseConfig } from "./src/db/config";

export default defineConfig({
  dialect: "turso",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: getDatabaseConfig(),
  strict: true,
  verbose: true,
});
