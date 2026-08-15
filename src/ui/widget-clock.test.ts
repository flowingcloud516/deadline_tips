import { describe, expect, it } from "vitest";
import { localDateString, millisecondsUntilNextHour } from "./widget-clock";

describe("widget clock", () => {
  it("formats the local calendar date", () => {
    expect(localDateString(new Date(2026, 7, 15, 8, 30))).toBe("2026-08-15");
  });

  it("aligns refreshes to the next exact hour", () => {
    expect(millisecondsUntilNextHour(new Date(2026, 7, 15, 23, 45, 30, 250))).toBe(14 * 60_000 + 29_750);
  });

  it("crosses midnight at 00:00 instead of one hour after launch", () => {
    const beforeMidnight = new Date(2026, 7, 15, 23, 59, 59, 900);
    expect(millisecondsUntilNextHour(beforeMidnight)).toBe(100);
    expect(localDateString(new Date(beforeMidnight.getTime() + millisecondsUntilNextHour(beforeMidnight)))).toBe("2026-08-16");
  });
});
