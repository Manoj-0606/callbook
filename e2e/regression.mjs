// Browser regression for the whole app: signed-out protection, the public form, sign-in, every Today action,
// New request, Jobs, Job Detail, Customer, anonymous Server Action replays, and phone widths (360px, 390px).
//
// It expects freshly reset demo data and changes it, so reset before and after:
//   npm run db:reset && npm run build && npm start      (in one terminal)
//   npm run e2e                                         (in another)
//   npm run db:reset
//
// Against another server: BASE_URL=https://… CALLBOOK_PASSWORD=… npm run e2e
// Uses an installed Microsoft Edge by default; BROWSER_CHANNEL=chrome for Chrome.
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";

const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const PASSWORD = process.env.CALLBOOK_PASSWORD ?? readLocalPassword();
if (!PASSWORD) throw new Error("Set CALLBOOK_PASSWORD (or run `npm run dev` once to create .env.local).");

function readLocalPassword() {
  try {
    return readFileSync(".env.local", "utf8").match(/^CALLBOOK_PASSWORD=(.+)$/m)?.[1].trim();
  } catch {
    return undefined;
  }
}
const results = [];
const consoleProblems = [];
let section = "";
const check = (label, ok, detail = "") => results.push(`${ok ? "PASS" : "FAIL"}  [${section}] ${label}${detail ? `  (${detail})` : ""}`);
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL ?? "msedge", headless: true });
const watch = (p) => {
  p.on("console", (m) => (m.type() === "error" || m.type() === "warning") && consoleProblems.push(`${m.type()}: ${m.text()}`));
  p.on("pageerror", (e) => consoleProblems.push(`pageerror: ${e.message}`));
};
const INTERNAL = ["Callbook", "Sunrise", "Earl Whitaker", "past job", "open job", "Repeat customer", "/jobs/", "/customers/"];

// ─── Signed out ─────────────────────────────────────────────────────────────
section = "signed out";
const anon = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const visitor = await anon.newPage();
watch(visitor);

for (const url of ["/", "/jobs", "/jobs/20", "/customers/6"]) {
  await visitor.goto(`${BASE}${url}`);
  const landed = new URL(visitor.url());
  check(`${url} → sign-in page`, landed.pathname === "/login" && landed.searchParams.get("next") === url, visitor.url());
}
check("no customer data on the sign-in page", !(await visitor.locator("body").innerText()).includes("Sunrise"));

// Public request: a new customer, then a repeat customer's number.
const thanks = (p) => p.getByRole("heading", { name: "Thanks — we've received your request." });
async function sendRequest(p, v) {
  await p.goto(`${BASE}/request`);
  const f = (label) => p.getByRole("textbox", { name: label, exact: true });
  await f("Name").fill(v.name);
  await f("Business (optional)").fill(v.business ?? "");
  await f("Phone").fill(v.phone);
  await f("What's wrong?").fill(v.problem);
  if (v.emergency) await p.getByRole("checkbox", { name: /Is this an emergency/ }).check();
  await p.getByRole("button", { name: "Send request" }).click();
  await thanks(p).waitFor();
}
await visitor.goto(`${BASE}/request`);
check("/request opens without signing in", (await visitor.getByRole("heading", { level: 1 }).textContent()) === "Request service");
await sendRequest(visitor, { name: "Nina Park", business: "Harborview Seafood", phone: "512 555 0187", problem: "Fish case not cold", emergency: true });
check("new public request → thank-you", true);
await sendRequest(visitor, { name: "Earl", phone: "512.555.0112", problem: "Walk-in door won't latch" });
const publicText = `${await visitor.locator("body").innerText()} ${await visitor.content()}`;
check("repeat customer's number → same thank-you, nothing leaks", INTERNAL.every((w) => !publicText.includes(w)), INTERNAL.filter((w) => publicText.includes(w)).join(", "));

// ─── Signing in ─────────────────────────────────────────────────────────────
section = "sign in";
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
watch(page);
await page.goto(`${BASE}/jobs`);
await page.getByLabel("Password").fill("definitely-wrong");
await page.getByRole("button", { name: "Sign in" }).click();
await page.getByText("That password isn't right.").waitFor();
check("wrong password refused", new URL(page.url()).pathname === "/login");
await page.getByLabel("Password").fill(PASSWORD);
await page.getByRole("button", { name: "Sign in" }).click();
await page.waitForURL(`${BASE}/jobs`);
check("right password → back to where you were going (/jobs)", true);
await page.reload();
await page.getByRole("heading", { name: "Jobs", level: 1 }).waitFor();
check("still signed in after a reload", new URL(page.url()).pathname === "/jobs");

// ─── Today and every action ─────────────────────────────────────────────────
section = "Today";
const dialog = () => page.getByRole("dialog");
const card = (name) => page.locator("article", { has: page.getByRole("heading", { name, exact: true }) });
const sectionOf = (title) => page.locator("section", { has: page.getByRole("heading", { name: new RegExp(`^${title}`) }) });
async function today() {
  await page.goto(`${BASE}/`);
  await page.getByRole("heading", { level: 1 }).waitFor();
}
await today();
const newSection = sectionOf("New — nobody's called back yet");
check("public requests are under New", (await newSection.locator("article", { hasText: "Harborview Seafood" }).count()) === 1);
check("…from the website, flagged emergency", (await newSection.locator("article", { hasText: "Harborview Seafood" }).getByText("Came in just now · Website form").isVisible()) && (await newSection.locator("article", { hasText: "Harborview Seafood" }).getByText("Emergency", { exact: true }).isVisible()));

// Capture a real internal Server Action request (Add note) to replay later without a session.
let captured = null;
page.on("request", (r) => {
  if (!captured && r.method() === "POST" && r.headers()["next-action"]) captured = { url: r.url(), headers: r.headers(), body: r.postDataBuffer() };
});
await card("Rosa's Taqueria").getByRole("button", { name: /More actions/ }).click();
await dialog().getByRole("button", { name: "Add note" }).click();
await dialog().getByLabel("Note", { exact: true }).fill("Regression note: back door code 2210");
await dialog().getByRole("button", { name: "Save note" }).click();
await dialog().waitFor({ state: "detached" });
check("Add note", (await card("Rosa's Taqueria").count()) === 1);

await card("Smoke & Timber BBQ").getByRole("button", { name: "Log call" }).click();
await page.waitForTimeout(150);
const outcomeHeights = await dialog().getByRole("radio").evaluateAll((els) => els.slice(0, 3).map((e) => Math.round(e.closest("label").getBoundingClientRect().height)));
check("desktop: call outcomes each fit on one line", outcomeHeights.every((h) => h <= 48), outcomeHeights.join("/"));
await dialog().getByRole("radio", { name: "Said yes — needs scheduling" }).check();
await dialog().getByRole("button", { name: "Save call" }).click();
await sectionOf("Said yes").locator("article", { hasText: "Smoke & Timber BBQ" }).waitFor();
check("Log call → Said yes", true);

await card("Harbor Lane Grocery").getByRole("button", { name: "Mark quote sent" }).click();
await dialog().getByLabel("Quote amount").fill("1,240");
await dialog().getByRole("button", { name: "Save quote" }).click();
await card("Harbor Lane Grocery").waitFor({ state: "detached" });
check("Mark quote sent → leaves Today", true);

await card("Tall Pines Brewing").getByRole("button", { name: "Schedule", exact: true }).click();
await dialog().getByRole("radio", { name: "Carlos Rivera" }).check();
await dialog().getByRole("button", { name: "Save visit" }).click();
await card("Tall Pines Brewing").waitFor({ state: "detached" });
check("Schedule → leaves Today", true);

await card("Casa Verde Cantina").getByRole("button", { name: /More actions/ }).click();
await dialog().getByRole("button", { name: "Set callback" }).click();
await dialog().getByRole("button", { name: "Set callback" }).click();
await card("Casa Verde Cantina").waitFor({ state: "detached" });
check("Set callback → hidden until then", true);

await card("Scoops & Co. Ice Cream").getByRole("button", { name: "Mark done" }).click();
await dialog().getByRole("button", { name: "Mark done" }).click();
await card("Scoops & Co. Ice Cream").waitFor({ state: "detached" });
check("Mark done → leaves Today", true);

await card("Bluebonnet Florist").getByRole("button", { name: /More actions/ }).click();
await dialog().getByRole("button", { name: "Didn't go ahead" }).click();
await dialog().getByRole("radio", { name: "Went with someone else" }).check();
await dialog().getByRole("button", { name: "Continue" }).click();
await dialog().getByRole("button", { name: "Yes, close this job" }).click();
await card("Bluebonnet Florist").waitFor({ state: "detached" });
check("Didn't go ahead (with confirmation) → leaves Today", true);

section = "New request";
await page.getByRole("button", { name: "New request" }).click();
await dialog().getByRole("textbox", { name: "Phone" }).fill("(512) 555-0151");
await dialog().getByText(/^Repeat customer: |^Existing customer: /).waitFor();
check("repeat customer recognised in Denise's form", await dialog().getByText("Harbor Lane Grocery", { exact: false }).first().isVisible());
await dialog().getByLabel("What's wrong?").fill("Second produce case now too");
await dialog().getByRole("button", { name: "Add request" }).click();
await dialog().waitFor({ state: "detached" });
await sectionOf("New — nobody's called back yet").locator("article", { hasText: "Second produce case now too" }).waitFor();
check("new request lands under New", true);

// ─── Jobs, Job Detail, Customer ─────────────────────────────────────────────
section = "Jobs";
const search = page.getByRole("searchbox", { name: /Search jobs/ });
const rows = page.locator("main ul li article");
async function typeSearch(text) {
  await search.fill(text);
  await page.waitForURL((u) => (u.searchParams.get("q") ?? "") === text);
  await page.waitForLoadState("networkidle");
}
await page.goto(`${BASE}/jobs`);
await page.getByRole("heading", { name: "Jobs", level: 1 }).waitFor();
await typeSearch("sunrise");
check("search by name", (await rows.locator("h2").allTextContents()).every((n) => n === "Sunrise Diner") && (await rows.count()) >= 1);
await typeSearch("5550112");
check("search by phone", (await rows.count()) >= 1 && (await rows.locator("h2").allTextContents()).every((n) => n === "Sunrise Diner"));
await page.getByRole("link", { name: /^Closed/ }).click();
await page.waitForURL(/status=closed/);
await page.waitForLoadState("networkidle");
check("Closed filter keeps the search", (await rows.locator("h2").allTextContents()).every((n) => n === "Sunrise Diner") && (await rows.count()) === 3);

section = "Job Detail";
await page.goto(`${BASE}/jobs`);
await typeSearch("rosa");
await rows.first().getByRole("link").first().click();
await page.getByRole("heading", { name: "History" }).waitFor();
const titles = await page.locator("section[aria-labelledby=history] li p.font-semibold").allTextContents();
check("the note added on Today is in the job's history", titles.at(-1) === "Note · Regression note: back door code 2210", titles.at(-1));
await page.getByRole("button", { name: "Log call" }).click();
await dialog().getByRole("radio", { name: "Needs a quote" }).check();
await dialog().getByRole("button", { name: "Save call" }).click();
await dialog().waitFor({ state: "detached" });
await page.getByText('Moved to "Needs a quote"').last().waitFor();
check("action from Job Detail updates status and history", (await page.locator("main header span").first().textContent()) === "Needs a quote");

section = "Customer";
await page.getByRole("heading", { level: 1 }).getByRole("link").click();
await page.waitForURL(/\/customers\/\d+$/);
await page.getByRole("heading", { name: "History", level: 2 }).waitFor();
const customerHistory = await page.locator("section[aria-labelledby=customer-history] li p.font-semibold").allTextContents();
check("customer page shows the combined history, newest first", customerHistory[0] === "Called · Talked to customer", customerHistory.slice(0, 2).join(" | "));

section = "persistence";
await page.reload();
await page.getByRole("heading", { name: "History", level: 2 }).waitFor();
check("reload keeps everything", (await page.locator("section[aria-labelledby=customer-history] li p.font-semibold").first().textContent()) === "Called · Talked to customer");

// ─── Server Actions without a session ───────────────────────────────────────
section = "anonymous Server Actions";
check("captured a real internal Server Action request", Boolean(captured), captured?.headers["next-action"]);
const notesBefore = await (async () => {
  await page.goto(`${BASE}/jobs?q=rosa`);
  await rows.first().getByRole("link").first().click();
  await page.getByRole("heading", { name: "History" }).waitFor();
  return (await page.locator("section[aria-labelledby=history]").getByText("Regression note: back door code 2210").count());
})();
const replayHeaders = Object.fromEntries(Object.entries(captured.headers).filter(([k]) => ["next-action", "content-type", "accept", "next-router-state-tree"].includes(k)));
const onInternal = await anon.request.post(`${BASE}/`, { headers: replayHeaders, data: captured.body, maxRedirects: 0 });
check("replayed on an internal page → refused by the proxy (401)", onInternal.status() === 401, `status ${onInternal.status()}`);
// Next forwards an action it doesn't find on /request to the page that owns it; the proxy refuses it there, so the
// caller gets an empty reply. (If a platform ran it anyway, the action's own session check returns "signed out".)
for (const publicPath of ["/request", "/login"]) {
  const onPublic = await anon.request.post(`${BASE}${publicPath}`, { headers: replayHeaders, data: captured.body, maxRedirects: 0 });
  const publicBody = await onPublic.text();
  const refused = publicBody.trim() === "{}" || publicBody.includes("You've been signed out");
  check(`replayed on the public ${publicPath} address → refused, no data back`, refused && INTERNAL.every((w) => !publicBody.includes(w)), `status ${onPublic.status()}, body ${publicBody.slice(0, 40)}`);
}
await page.reload();
await page.getByRole("heading", { name: "History" }).waitFor();
const notesAfter = await page.locator("section[aria-labelledby=history]").getByText("Regression note: back door code 2210").count();
check("…and nothing was written", notesAfter === notesBefore, `${notesBefore} → ${notesAfter}`);

// ─── Phones ─────────────────────────────────────────────────────────────────
section = "layouts";
const overflow = (p) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
for (const width of [360, 390]) {
  const phoneCtx = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true, storageState: await ctx.storageState() });
  const phone = await phoneCtx.newPage();
  watch(phone);
  for (const [url, ready] of [
    ["/", () => phone.getByRole("heading", { level: 1 }).waitFor()],
    ["/jobs", () => phone.getByRole("heading", { name: "Jobs", level: 1 }).waitFor()],
    ["/jobs/20", () => phone.getByRole("heading", { name: "History" }).waitFor()],
    ["/customers/6", () => phone.getByRole("heading", { name: "History", level: 2 }).waitFor()],
    ["/request", () => phone.getByRole("heading", { name: "Request service" }).waitFor()],
    ["/login", () => phone.getByRole("heading", { level: 1 }).waitFor()],
  ]) {
    await phone.goto(`${BASE}${url}`);
    await ready();
    const o = await overflow(phone);
    check(`${width}px ${url}: no sideways scrolling`, o <= 0, `${o}px`);
  }
  await phone.goto(`${BASE}/`);
  await phone.getByRole("heading", { level: 1 }).waitFor();
  check(`${width}px: Sign out is reachable`, await phone.getByRole("button", { name: "Sign out" }).isVisible());

  await phoneCtx.close();
}
for (const url of ["/", "/jobs", "/request"]) {
  await page.goto(`${BASE}${url}`);
  await page.waitForLoadState("networkidle");
  check(`desktop ${url}: no sideways scrolling`, (await overflow(page)) <= 0);
}

// ─── Signing out ────────────────────────────────────────────────────────────
section = "sign out";
await page.goto(`${BASE}/`);
await page.getByRole("button", { name: "Sign out" }).click();
await page.waitForURL(/\/login/);
await page.goto(`${BASE}/jobs/20`);
check("after signing out, internal pages need the password again", new URL(page.url()).pathname === "/login");

await browser.close();
console.log(`${BASE}\n${results.join("\n")}`);
console.log(`\n${results.filter((r) => r.startsWith("FAIL")).length} failed of ${results.length}`);
console.log(consoleProblems.length ? `Console problems:\n${consoleProblems.join("\n")}` : "No console errors or warnings.");
if (results.some((r) => r.startsWith("FAIL")) || consoleProblems.length) process.exitCode = 1;
