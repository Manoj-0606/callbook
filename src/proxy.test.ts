import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSessionToken, SESSION_COOKIE } from "./lib/auth";
import { config, proxy } from "./proxy";

const BASE = "https://callbook.example";

async function request(path: string, options: { method?: string; action?: boolean; cookie?: string } = {}) {
  const headers = new Headers();
  if (options.action) headers.set("next-action", "7f3a9c");
  if (options.cookie) headers.set("cookie", `${SESSION_COOKIE}=${options.cookie}`);
  return proxy(new NextRequest(`${BASE}${path}`, { method: options.method ?? "GET", headers }));
}

const validSession = async () => (await createSessionToken(process.env.AUTH_SECRET!)).value;
/** NextResponse.next() lets the request through. */
const passedThrough = (response: Response) => response.headers.get("x-middleware-next") === "1";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("proxy: signed out", () => {
  it.each(["/", "/jobs", "/jobs?status=closed&q=sunrise", "/jobs/12", "/customers/6"])(
    "a visit to %s goes to sign-in, remembering where it was headed",
    async (path) => {
      const response = await request(path);
      expect(response.status).toBe(307);
      const location = new URL(response.headers.get("location")!);
      expect(location.pathname).toBe("/login");
      expect(location.searchParams.get("next")).toBe(path);
    },
  );

  it("drops Next's internal _rsc marker from the return address", async () => {
    const location = new URL((await request("/jobs?q=rosa&_rsc=abc123")).headers.get("location")!);
    expect(location.searchParams.get("next")).toBe("/jobs?q=rosa");
  });

  it.each(["/", "/jobs", "/jobs/12", "/customers/6"])("a Server Action call on %s is refused outright", async (path) => {
    const response = await request(path, { method: "POST", action: true });
    expect(response.status).toBe(401);
    expect(passedThrough(response)).toBe(false);
  });

  it("any other POST to an internal page is refused", async () => {
    expect((await request("/jobs", { method: "POST" })).status).toBe(401);
  });

  it.each([
    ["an expired session", async () => (await createSessionToken(process.env.AUTH_SECRET!, new Date("2020-01-01"))).value],
    ["a session signed with another secret", async () => (await createSessionToken("some-other-secret-that-is-long-enough-123")).value],
    ["a tampered session", async () => `${await validSession()}x`],
  ])("%s counts as signed out", async (_label, makeCookie) => {
    expect((await request("/jobs", { cookie: await makeCookie() })).status).toBe(307);
  });

  it("with sign-in not configured, nobody gets in (fails closed)", async () => {
    const cookie = await validSession();
    vi.stubEnv("AUTH_SECRET", "");
    expect((await request("/", { cookie })).status).toBe(307);
  });
});

describe("proxy: public pages stay public", () => {
  it.each(["/request", "/request/", "/login", "/login?next=%2Fjobs"])("%s is open to anyone", async (path) => {
    expect(passedThrough(await request(path))).toBe(true);
  });

  it("the public form's own action gets through (internal actions check the session themselves)", async () => {
    expect(passedThrough(await request("/request", { method: "POST", action: true }))).toBe(true);
  });
});

describe("proxy: signed in", () => {
  it.each(["/", "/jobs", "/jobs/12", "/customers/6"])("%s opens", async (path) => {
    expect(passedThrough(await request(path, { cookie: await validSession() }))).toBe(true);
  });

  it("Server Actions go through", async () => {
    expect(passedThrough(await request("/", { method: "POST", action: true, cookie: await validSession() }))).toBe(true);
  });
});

describe("proxy matcher", () => {
  it("covers every page but leaves Next's static files alone", () => {
    const pattern = new RegExp(`^${config.matcher[0]}$`);
    for (const path of ["/", "/jobs", "/jobs/12", "/customers/6", "/request", "/login"]) expect(pattern.test(path), path).toBe(true);
    for (const path of ["/_next/static/chunks/app.js", "/_next/image", "/favicon.ico"]) expect(pattern.test(path), path).toBe(false);
  });
});
