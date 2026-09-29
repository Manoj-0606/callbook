import { describe, expect, it } from "vitest";
import { callbackChoices } from "./callback-choices";

// Mon Sep 28 … Fri Oct 2, Sat 3, Sun 4 2026. Next week: Mon Oct 5, Tue 6, Wed 7.
describe("callbackChoices: quick callback dates in business days", () => {
  it.each([
    ["Monday", "2026-09-28", [["Tomorrow", "Tue, Sep 29"], ["In 3 days", "Thu, Oct 1"], ["Next Monday", "Mon, Oct 5"]]],
    ["Tuesday", "2026-09-29", [["Tomorrow", "Wed, Sep 30"], ["In 3 days", "Fri, Oct 2"], ["Next Monday", "Mon, Oct 5"]]],
    // "In 3 days" lands on Monday too, so it's shown once.
    ["Wednesday", "2026-09-30", [["Tomorrow", "Thu, Oct 1"], ["In 3 days", "Mon, Oct 5"]]],
    // Soonest first: Monday comes before "in 3 days" (Tuesday).
    ["Thursday", "2026-10-01", [["Tomorrow", "Fri, Oct 2"], ["Next Monday", "Mon, Oct 5"], ["In 3 days", "Tue, Oct 6"]]],
    // The next business day is Monday, so it's named, not called "tomorrow".
    ["Friday", "2026-10-02", [["Monday", "Mon, Oct 5"], ["In 3 days", "Wed, Oct 7"]]],
    ["Saturday", "2026-10-03", [["Monday", "Mon, Oct 5"], ["In 3 days", "Wed, Oct 7"]]],
    ["Sunday", "2026-10-04", [["Tomorrow", "Mon, Oct 5"], ["In 3 days", "Wed, Oct 7"]]],
  ])("on a %s", (_day, today, expected) => {
    expect(callbackChoices(today).map((c) => [c.label, c.dateLabel])).toEqual(expected);
  });

  it("never lands on a weekend, and never on today or earlier", () => {
    for (let day = 1; day <= 31; day++) {
      const today = `2026-10-${String(day).padStart(2, "0")}`;
      for (const choice of callbackChoices(today)) {
        expect(choice.date > today).toBe(true);
        expect(choice.dateLabel).not.toMatch(/^(Sat|Sun)/);
      }
    }
  });
});
