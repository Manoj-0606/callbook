/**
 * Database CLI.
 *
 *   tsx scripts/db.ts migrate   Apply pending migrations
 *   tsx scripts/db.ts seed      Seed demo data (refuses if data already exists)
 *   tsx scripts/db.ts reset     Wipe all data and reseed the demo
 *   tsx scripts/db.ts setup     Migrate, then seed only if the database is empty
 */
import "./load-env";
import { createDatabase } from "../src/db/client";
import { getDatabaseConfig } from "../src/db/config";
import { runMigrations } from "../src/db/migrate";
import { isDatabaseEmpty, resetDatabase, seedDatabase, type SeedSummary } from "../src/db/seed";

const COMMANDS = ["migrate", "seed", "reset", "setup"] as const;
type Command = (typeof COMMANDS)[number];

async function main() {
  const command = process.argv[2] as Command | undefined;
  if (!command || !COMMANDS.includes(command)) {
    console.error(`Usage: tsx scripts/db.ts <${COMMANDS.join("|")}>`);
    process.exit(1);
  }

  const { url } = getDatabaseConfig();
  const db = createDatabase();
  console.log(`Database: ${redact(url)}`);

  await runMigrations(db);
  console.log("✓ Migrations applied");

  switch (command) {
    case "migrate":
      break;

    case "seed": {
      if (!(await isDatabaseEmpty(db))) {
        console.error("✗ Database already has data. Run `npm run db:reset` to wipe and reseed.");
        process.exit(1);
      }
      report("Seeded", await seedDatabase(db));
      break;
    }

    case "reset":
      report("Reset and reseeded", await resetDatabase(db));
      break;

    case "setup": {
      if (await isDatabaseEmpty(db)) {
        report("Empty database seeded", await seedDatabase(db));
      } else {
        console.log("✓ Existing data kept");
      }
      break;
    }
  }

  db.$client.close();
}

function report(action: string, summary: SeedSummary) {
  console.log(
    `✓ ${action}: ${summary.technicians} technicians, ${summary.customers} customers, ` +
      `${summary.jobs} jobs, ${summary.activities} activities`,
  );
}

/** Never print a Turso auth token or credentials embedded in a URL. */
function redact(url: string): string {
  return url.replace(/\/\/[^@/]+@/, "//***@").replace(/authToken=[^&]+/, "authToken=***");
}

main().catch((error) => {
  console.error("✗", error instanceof Error ? error.message : error);
  process.exit(1);
});
