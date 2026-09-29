import { describe, expect, it } from "vitest";
import {
  authConfig,
  createSessionToken,
  isPublicPath,
  passwordMatches,
  safeNextPath,
  SESSION_DAYS,
  verifySessionToken,
} from "./auth";

const SECRET = "a-long-random-secret-used-only-in-these-tests-0123";
const NOW = new Date("2026-09-29T14:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

describe("session tokens", () => {
  it("a fresh token is valid, and lasts the session length", async () => {
    const { value, expires } = await createSessionToken(SECRET, NOW);
    expect(await verifySessionToken(value, SECRET, NOW)).toBe(true);
    expect(expires.getTime() - NOW.getTime()).toBe(SESSION_DAYS * DAY);
    expect(await verifySessionToken(value, SECRET, new Date(NOW.getTime() + (SESSION_DAYS - 1) * DAY))).toBe(true);
  });

  it("expires", async () => {
    const { value } = await createSessionToken(SECRET, NOW);
    expect(await verifySessionToken(value, SECRET, new Date(NOW.getTime() + SESSION_DAYS * DAY + 1))).toBe(false);
  });

  it("is rejected if signed with a different secret (e.g. after rotating AUTH_SECRET)", async () => {
    const { value } = await createSessionToken(SECRET, NOW);
    expect(await verifySessionToken(value, `${SECRET}-rotated`, NOW)).toBe(false);
  });

  it("can't be edited to live longer", async () => {
    const { value } = await createSessionToken(SECRET, NOW);
    const [version, , signature] = value.split(".");
    const extended = `${version}.${NOW.getTime() + 3650 * DAY}.${signature}`;
    expect(await verifySessionToken(extended, SECRET, NOW)).toBe(false);
  });

  it.each([
    [undefined],
    [""],
    ["garbage"],
    ["v1.123"],
    ["v2.99999999999999.abc"],
    ["v1.notanumber.abc"],
    ["v1.-5.abc"],
    ["v1.1e20.abc"],
  ])("rejects %j", async (token) => {
    expect(await verifySessionToken(token, SECRET, NOW)).toBe(false);
  });
});

describe("passwordMatches", () => {
  it.each([
    ["correct horse", "correct horse", true],
    ["correct horse ", "correct horse", false],
    ["Correct horse", "correct horse", false],
    ["", "correct horse", false],
    ["correct horse battery staple", "correct horse", false],
  ])("%j vs %j → %s", async (given, expected, result) => {
    expect(await passwordMatches(given, expected, SECRET)).toBe(result);
  });
});

describe("authConfig: fails closed", () => {
  it.each([
    [{}, false],
    [{ CALLBOOK_PASSWORD: "pw" }, false],
    [{ AUTH_SECRET: SECRET }, false],
    [{ CALLBOOK_PASSWORD: "pw", AUTH_SECRET: "too-short" }, false],
    [{ CALLBOOK_PASSWORD: "", AUTH_SECRET: SECRET }, false],
    [{ CALLBOOK_PASSWORD: "pw", AUTH_SECRET: SECRET }, true],
  ])("%j → configured: %s", (env, configured) => {
    expect(authConfig(env) !== null).toBe(configured);
  });
});

describe("safeNextPath: only back into Callbook", () => {
  it.each([
    ["/", "/"],
    ["/jobs?status=closed&q=sunrise", "/jobs?status=closed&q=sunrise"],
    ["/customers/6", "/customers/6"],
    [null, "/"],
    [undefined, "/"],
    ["", "/"],
    ["https://evil.example", "/"],
    ["//evil.example/path", "/"],
    ["/\\evil.example", "/"],
    ["jobs", "/"],
    ["/login", "/"],
    ["/login?next=/jobs", "/"],
  ])("%j → %j", (raw, expected) => {
    expect(safeNextPath(raw)).toBe(expected);
  });
});

describe("isPublicPath", () => {
  it.each([
    ["/request", true],
    ["/request/", true],
    ["/login", true],
    ["/", false],
    ["/jobs", false],
    ["/jobs/12", false],
    ["/customers/6", false],
    ["/requests", false],
    ["/request-admin", false],
    ["/login-bypass", false],
  ])("%s → %s", (path, expected) => {
    expect(isPublicPath(path)).toBe(expected);
  });
});
