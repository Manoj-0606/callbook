import { describe, expect, it } from "vitest";
import { DEFAULT_DATABASE_URL, getDatabaseConfig } from "./config";

describe("getDatabaseConfig", () => {
  it("uses the local SQLite file when nothing is set (development)", () => {
    expect(getDatabaseConfig({})).toEqual({ url: DEFAULT_DATABASE_URL, authToken: undefined });
  });

  it("uses Turso when it's configured", () => {
    expect(getDatabaseConfig({ DATABASE_URL: "libsql://callbook-demo.turso.io", DATABASE_AUTH_TOKEN: "token", VERCEL: "1" })).toEqual({
      url: "libsql://callbook-demo.turso.io",
      authToken: "token",
    });
  });

  it.each([[{ VERCEL: "1" }], [{ VERCEL: "1", DATABASE_URL: "file:data/callbook.db" }]])(
    "refuses a local file on Vercel: %j",
    (env) => {
      expect(() => getDatabaseConfig(env)).toThrow(/Turso/);
    },
  );
});
