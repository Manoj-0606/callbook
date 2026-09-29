import { revalidatePath } from "next/cache";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db, jobs } from "@/db";
import { loadCustomerView } from "@/db/queries/customers";
import { loadJobDetail } from "@/db/queries/jobs";
import { loadTodayView } from "@/db/queries/today";
import { runMigrations } from "@/db/migrate";
import { resetDatabase } from "@/db/seed";
import { IDLE } from "@/lib/action-state";
import { zonedDateTime } from "@/lib/dates";
import { createRequestAction, lookupCustomerAction } from "./request-actions";

vi.mock("@/db", async () => {
  const { createDatabase } = await import("@/db/client");
  const schema = await import("@/db/schema");
  return { ...schema, db: createDatabase({ url: ":memory:" }) };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// Signed in to Callbook.
vi.mock("next/headers", async () => (await import("@/test/session")).mockedHeaders());

const TZ = "America/Chicago";
const NOW = zonedDateTime("2026-09-29", "09:00", TZ); // Tuesday morning

beforeAll(async () => {
  await runMigrations(db);
});

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  await resetDatabase(db, NOW);
  vi.mocked(revalidatePath).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Follow a /customers/:id link the way the page would. */
async function openCustomer(href: string) {
  const match = /^\/customers\/(\d+)$/.exec(href);
  expect(match, href).not.toBeNull();
  return (await loadCustomerView(db, Number(match![1]), new Date(), TZ))!;
}

const allJobIds = (view: Awaited<ReturnType<typeof openCustomer>>) =>
  [...view.openJobs, ...view.previousJobs].map((j) => j.jobId);

describe("links to the customer page", () => {
  it("Today → Customer: every card's customer link opens the page listing that job", async () => {
    for (const card of (await loadTodayView(db, NOW, TZ)).sections.flatMap((s) => s.cards)) {
      const customer = await openCustomer(card.customerHref);
      expect(customer.name, card.name).toBe(card.name);
      expect(customer.openJobs.map((j) => j.jobId), card.name).toContain(card.jobId);
    }
  });

  it("Today → Customer: the repeat-customer hint opens their whole history", async () => {
    const sunrise = (await loadTodayView(db, NOW, TZ)).sections.flatMap((s) => s.cards).find((c) => c.name === "Sunrise Diner")!;
    expect(sunrise.hint).toBe("Repeat customer · 3 past jobs");
    const customer = await openCustomer(sunrise.customerHref);
    expect(customer.previousJobs).toHaveLength(3);
    expect(customer.timeline).toHaveLength(11);
  });

  it("New Request → Customer: the repeat-customer banner links to their page", async () => {
    const banner = (await lookupCustomerAction("512.555.0112"))!;
    const customer = await openCustomer(banner.customerHref);
    expect(customer.name).toBe("Sunrise Diner");
    // Each open job in the banner still links to its own page.
    for (const open of banner.openJobs) {
      expect(customer.openJobs.map((j) => j.href)).toContain(open.href);
    }
  });

  it("New Request → Customer: a new request for them shows up on their page, at the top of the history", async () => {
    const banner = (await lookupCustomerAction("5125550112"))!;
    await createRequestAction(
      IDLE,
      toForm({ phone: "5125550112", businessName: "Sunrise Diner", description: "Walk-in door won't latch", source: "repeat" }),
    );
    const customer = await openCustomer(banner.customerHref);
    expect(customer.summary).toBe("2 open jobs · 3 previous jobs");
    expect(customer.timeline[0]).toMatchObject({
      title: "Request received · Repeat customer",
      job: { label: "Walk-in door won't latch" },
    });
  });

  it("Job Detail → Customer: every job's customer link opens the page that lists it", async () => {
    for (const { id } of await db.select({ id: jobs.id }).from(jobs)) {
      const detail = (await loadJobDetail(db, id, NOW, TZ))!;
      const customer = await openCustomer(detail.customerHref);
      expect(customer.name, `job ${id}`).toBe(detail.name);
      expect(allJobIds(customer), `job ${id}`).toContain(id);
    }
  });

  it("Customer → Job → back: every job on the page leads back to the same customer", async () => {
    const banner = (await lookupCustomerAction("(512) 555-0112"))!;
    const customer = await openCustomer(banner.customerHref);
    for (const row of [...customer.openJobs, ...customer.previousJobs]) {
      const detail = (await loadJobDetail(db, row.jobId, NOW, TZ))!;
      expect(row.href).toBe(`/jobs/${row.jobId}`);
      expect(detail.customerHref).toBe(banner.customerHref);
    }
  });
});

function toForm(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}
