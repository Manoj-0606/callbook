import { revalidatePath } from "next/cache";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { runMigrations } from "@/db/migrate";
import { loadJobDetail, loadJobsView } from "@/db/queries/jobs";
import { loadTodayView } from "@/db/queries/today";
import { resetDatabase } from "@/db/seed";
import { IDLE } from "@/lib/action-state";
import { zonedDateTime } from "@/lib/dates";
import { addNoteAction, logCallAction, markDoneAction, markQuoteSentAction } from "./job-actions";

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

function form(fields: Record<string, string | number>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, String(value));
  return data;
}

const detail = async (jobId: number) => (await loadJobDetail(db, jobId, new Date(), TZ))!;
const jobs = (q = "", filter: "open" | "closed" | "all" | "quote_sent" | "needs_quote" = "open") =>
  loadJobsView(db, { filter, q }, new Date(), TZ);
const today = () => loadTodayView(db, new Date(), TZ);

/** Every card on Today and its Job Detail page must say the same thing. */
async function expectTodayAndDetailAgree() {
  for (const section of (await today()).sections) {
    for (const card of section.cards) {
      const page = await detail(card.jobId);
      expect(page.onToday, card.name).toEqual({ section: section.title, reason: card.reason, facts: card.facts });
      expect(page.actionTarget.actions, card.name).toEqual(card.actions);
    }
  }
}

describe("Jobs → Job Detail → action → everything refreshes", () => {
  it("record a quote from the job's page: status, facts, timeline, Jobs and Today all update", async () => {
    const [row] = (await jobs("sunrise")).rows;
    const before = await detail(row.jobId);
    expect(before.actionTarget.actions.primary).toMatchObject({ kind: "quote", label: "Mark quote sent" });

    // The detail page uses the same Server Action as a Today card.
    const state = await markQuoteSentAction(IDLE, form({ jobId: before.actionTarget.jobId, amount: "2,100" }));
    expect(state).toEqual({ status: "success", message: "Quote $2,100 recorded" });
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout"); // Today, Jobs and this page

    const after = await detail(row.jobId);
    expect(after.statusLabel).toBe("Quote sent");
    expect(after.facts.find((f) => f.label === "Quote")?.value).toBe("$2,100 · sent Tue, Sep 29 · 9:00 am");
    expect(after.timeline).toHaveLength(before.timeline.length + 1);
    expect(after.timeline.at(-1)).toMatchObject({ title: "Quote sent · $2,100", when: "Tue, Sep 29 · 9:00 am" });
    expect(after.onToday).toBeNull();
    expect(after.offTodayReason).toBe("Waiting to hear back from the customer.");

    const list = await jobs();
    expect(list.rows.find((r) => r.jobId === row.jobId)).toMatchObject({ statusLabel: "Quote sent", onToday: false });
    expect(list.chips.find((c) => c.filter === "needs_quote")?.count).toBe(3);
    expect(list.chips.find((c) => c.filter === "quote_sent")?.count).toBe(6);

    const quoteSection = (await today()).sections.find((s) => s.category === "needs_quote");
    expect(quoteSection?.cards.map((c) => c.name)).not.toContain("Sunrise Diner");
    await expectTodayAndDetailAgree();
  });

  it("mark done from the job's page: it becomes a closed job that only takes notes", async () => {
    const [row] = (await jobs("scoops")).rows;
    await markDoneAction(IDLE, form({ jobId: row.jobId, note: "Dave replaced the fan motor." }));

    const page = await detail(row.jobId);
    expect(page.statusLabel).toBe("Done");
    expect(page.actionTarget.actions).toEqual({ primary: { kind: "note", label: "Add note", title: "Add a note" }, more: [] });
    expect(page.timeline.at(-1)).toMatchObject({ title: "Status changed · Done", note: "Dave replaced the fan motor." });
    expect((await jobs()).openJobsLabel).toBe("14 open jobs");
    expect((await jobs("scoops", "closed")).rows).toHaveLength(1);
    await expectTodayAndDetailAgree();
  });

  it("a call that moves the job: its page follows it into the new Today section", async () => {
    const [row] = (await jobs("smoke")).rows;
    expect((await detail(row.jobId)).onToday?.section).toBe("Hasn't heard from us in 2+ days");

    await logCallAction(IDLE, form({ jobId: row.jobId, outcome: "talked", nextStep: "ready_to_schedule" }));

    const page = await detail(row.jobId);
    expect(page.onToday).toEqual({ section: "Said yes — needs scheduling", reason: "Said yes just now", facts: "Quote $3,850" });
    expect(page.timeline.at(-1)).toMatchObject({
      title: "Called · Talked to customer",
      details: ['Moved to "Said yes — needs scheduling"'],
    });
    await expectTodayAndDetailAgree();
  });
});

describe("notes are finally visible", () => {
  it("a note added from a Today card appears on the job's timeline", async () => {
    const card = (await today()).sections[0].cards[0]; // Rosa's Taqueria
    await addNoteAction(IDLE, form({ jobId: card.jobId, note: "Back door code 2210." }));

    const page = await detail(card.jobId);
    expect(page.timeline.at(-1)).toMatchObject({ title: "Note · Back door code 2210.", kind: "note", note: null });
    // A note isn't contact, so the job stays exactly where it was.
    expect(page.onToday?.section).toBe("New — nobody's called back yet");
  });

  it("notes typed with other actions show under that action", async () => {
    const [row] = (await jobs("eastside")).rows;
    await logCallAction(IDLE, form({ jobId: row.jobId, outcome: "voicemail", note: "Asked Tony to call back." }));
    expect((await detail(row.jobId)).timeline.at(-1)).toMatchObject({
      title: "Called · Left a voicemail",
      note: "Asked Tony to call back.",
    });
  });
});
