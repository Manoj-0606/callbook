import { count } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { activities, customers, db, jobs } from "@/db";
import { runMigrations } from "@/db/migrate";
import { resetDatabase } from "@/db/seed";
import { IDLE, type ActionState } from "@/lib/action-state";
import { SESSION_COOKIE } from "@/lib/auth";
import { zonedDateTime } from "@/lib/dates";
import { PUBLIC_THANK_YOU } from "@/lib/public-request";
import { SIGNED_OUT } from "@/lib/session";
import { testSession } from "@/test/session";
import { signInAction, signOutAction } from "./auth-actions";
import {
  addNoteAction,
  logCallAction,
  markDoneAction,
  markLostAction,
  markQuoteSentAction,
  scheduleAction,
  setCallbackAction,
} from "./job-actions";
import { submitServiceRequestAction } from "./public-request-actions";
import { createRequestAction, lookupCustomerAction } from "./request-actions";

vi.mock("@/db", async () => {
  const { createDatabase } = await import("@/db/client");
  const schema = await import("@/db/schema");
  return { ...schema, db: createDatabase({ url: ":memory:" }) };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", async () => (await import("@/test/session")).mockedHeaders());
// Like Next's redirect(), stop the action; record where it was going.
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
}));

const NOW = zonedDateTime("2026-09-29", "09:00", "America/Chicago");

beforeAll(async () => {
  await runMigrations(db);
  await resetDatabase(db, NOW);
});

beforeEach(() => {
  testSession.signedIn = false; // a visitor with no session cookie
  testSession.written = [];
  vi.mocked(revalidatePath).mockClear();
  vi.mocked(redirect).mockClear();
});

afterEach(() => {
  testSession.signedIn = true;
});

function form(fields: Record<string, string | number>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, String(value));
  return data;
}

const everything = async () => ({
  customers: await db.select().from(customers),
  jobs: await db.select().from(jobs),
  activities: (await db.select({ n: count() }).from(activities))[0].n,
});

// Valid input for each internal action, so the only thing stopping it is the missing session.
const INTERNAL_ACTIONS: [string, (state: ActionState, data: FormData) => Promise<ActionState>, Record<string, string | number>][] = [
  ["log call", logCallAction, { jobId: 1, outcome: "talked", nextStep: "needs_quote" }],
  ["mark quote sent", markQuoteSentAction, { jobId: 1, amount: "1200" }],
  ["schedule", scheduleAction, { jobId: 1, technicianId: 1, visitOn: "2026-10-01" }],
  ["set callback", setCallbackAction, { jobId: 1, callbackOn: "2026-10-05" }],
  ["mark done", markDoneAction, { jobId: 1 }],
  ["didn't go ahead", markLostAction, { jobId: 1, reason: "too_expensive", confirmed: "yes" }],
  ["add note", addNoteAction, { jobId: 1, note: "Sneaky note" }],
  ["new request", createRequestAction, { phone: "512 555 0199", businessName: "Intruder Inc", description: "Nope", source: "phone" }],
];

describe("internal Server Actions refuse anyone who isn't signed in", () => {
  it.each(INTERNAL_ACTIONS)("%s: refused, nothing changed", async (_label, action, fields) => {
    const before = await everything();

    const state = await action(IDLE, form(fields));

    expect(state).toEqual(SIGNED_OUT);
    expect(await everything()).toEqual(before);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("the same actions work once signed in (so the refusal above really is the session)", async () => {
    testSession.signedIn = true;
    expect(await addNoteAction(IDLE, form({ jobId: 1, note: "Signed in note" }))).toEqual({
      status: "success",
      message: "Note added",
    });
  });

  it("the customer lookup reveals nothing without a session", async () => {
    expect(await lookupCustomerAction("(512) 555-0112")).toBeNull();
    testSession.signedIn = true;
    expect((await lookupCustomerAction("(512) 555-0112"))?.title).toBe("Repeat customer: Sunrise Diner — 3 past jobs");
  });
});

describe("the public request form needs no session", () => {
  it("a signed-out visitor can still send a request", async () => {
    const before = (await everything()).jobs.length;
    const state = await submitServiceRequestAction(
      IDLE,
      form({ name: "Nina Park", phone: "512 555 0187", description: "Fish case not cold" }),
    );
    expect(state).toEqual({ status: "success", message: PUBLIC_THANK_YOU });
    expect((await everything()).jobs.length).toBe(before + 1);
  });
});

describe("signing in and out", () => {
  it("the wrong password is refused and no session is created", async () => {
    const state = await signInAction(IDLE, form({ password: "guess", next: "/jobs" }));
    expect(state).toEqual({ status: "error", message: null, fieldErrors: { password: "That password isn't right." } });
    expect(testSession.written).toEqual([]);
  });

  it("an empty password asks for one", async () => {
    expect(await signInAction(IDLE, form({ password: "" }))).toMatchObject({ fieldErrors: { password: "Enter the password." } });
  });

  it("the right password sets a session cookie and returns to where Denise was going", async () => {
    await expect(signInAction(IDLE, form({ password: "test-password", next: "/jobs?q=sunrise" }))).rejects.toThrow(
      "NEXT_REDIRECT:/jobs?q=sunrise",
    );
    expect(testSession.written).toEqual([{ name: SESSION_COOKIE, value: expect.stringMatching(/^v1\.\d+\./) }]);
  });

  it("never redirects off-site after signing in", async () => {
    await expect(signInAction(IDLE, form({ password: "test-password", next: "https://evil.example" }))).rejects.toThrow(
      "NEXT_REDIRECT:/",
    );
  });

  it("signing out removes the session cookie", async () => {
    await expect(signOutAction()).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(testSession.written).toEqual([{ name: SESSION_COOKIE, value: "" }]);
  });

  it("sign-in isn't possible at all when it isn't configured", async () => {
    vi.stubEnv("CALLBOOK_PASSWORD", "");
    try {
      const state = await signInAction(IDLE, form({ password: "test-password" }));
      expect(state).toMatchObject({ status: "error", message: expect.stringContaining("isn't set up yet") });
      expect(testSession.written).toEqual([]);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
