/**
 * Load .env.local then .env for CLI tools, which (unlike Next.js) don't do it
 * themselves. Earlier files win because loadEnvFile never overwrites a
 * variable that is already set. Import this before anything reads process.env.
 */
for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // Optional: local development works without any env file.
  }
}

export {};
