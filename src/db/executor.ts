import type { ResultSet } from "@libsql/client";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import type * as schema from "./schema";

/** Either the database or an open transaction. Both expose the same query API. */
export type Executor = BaseSQLiteDatabase<"async", ResultSet, typeof schema>;
