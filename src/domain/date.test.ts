import { describe, expect, it } from "vitest";
import { differenceInCalendarDays, nextDeadline } from "./date";

describe("nextDeadline", () => {
  it("moves a weekly task forward seven days", () => {
    expect(nextDeadline("2026-08-10", { kind: "weekly", weekday: 1 })).toBe("2026-08-17");
  });

  it("clamps day 31 to the last day of a shorter month", () => {
    expect(nextDeadline("2026-03-31", { kind: "monthly-day", day: 31 })).toBe("2026-04-30");
  });

  it("handles February in a leap year", () => {
    expect(nextDeadline("2028-01-31", { kind: "monthly-day", day: 31 })).toBe("2028-02-29");
    expect(nextDeadline("2028-01-29", { kind: "monthly-before-end", daysBeforeEnd: 1 })).toBe("2028-02-28");
  });

  it("handles February in a non-leap year", () => {
    expect(nextDeadline("2027-01-31", { kind: "monthly-day", day: 31 })).toBe("2027-02-28");
  });
});

describe("differenceInCalendarDays", () => {
  it("calculates across a daylight-saving boundary without time drift", () => {
    expect(differenceInCalendarDays("2026-03-09", "2026-03-07")).toBe(2);
  });
});

