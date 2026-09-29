/**
 * For local development only (runs before `npm run dev`): make sure
 * .env.local has a sign-in password and a signing secret, generating any that
 * are missing. It never overwrites a value and never runs on Vercel. The file
 * is gitignored, so nothing secret ends up in the repository.
 */
import { randomBytes, randomInt } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const FILE = ".env.local";
const WORDS = ["frost", "chill", "cooler", "freezer", "ice", "glacier", "polar", "arctic", "breeze", "flurry"];

const current = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";
const isSet = (key: string) => Boolean(process.env[key]) || new RegExp(`^${key}=.+`, "m").test(current);

const additions: string[] = [];
let password: string | null = null;

if (!isSet("AUTH_SECRET")) additions.push(`AUTH_SECRET=${randomBytes(32).toString("hex")}`);
if (!isSet("CALLBOOK_PASSWORD")) {
  password = `${WORDS[randomInt(WORDS.length)]}-${WORDS[randomInt(WORDS.length)]}-${randomInt(1000, 10000)}`;
  additions.push(`CALLBOOK_PASSWORD=${password}`);
}

if (additions.length > 0) {
  const separator = current && !current.endsWith("\n") ? "\n" : "";
  writeFileSync(FILE, `${current}${separator}# Generated for local development. Not committed.\n${additions.join("\n")}\n`);
}

console.log(
  password
    ? `✓ Local Callbook password: ${password}  (saved in ${FILE}; change it there any time)`
    : `✓ Sign-in is configured (${FILE})`,
);
