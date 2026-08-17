import { describe, expect, it } from "vitest";
import { isDailyShowTime, localDayKey, millisecondsUntilDailyReminderCheck, scheduledTime, shouldShowDailyReminder } from "./daily-reminder";

describe("daily widget reminder", () => {
  it("accepts only complete 24-hour times", () => {
    expect(isDailyShowTime("10:00")).toBe(true);
    expect(isDailyShowTime("23:59")).toBe(true);
    expect(isDailyShowTime("24:00")).toBe(false);
    expect(isDailyShowTime("9:00")).toBe(false);
  });

  it("uses local calendar dates and times", () => {
    const now = new Date(2026, 7, 17, 8, 30);
    expect(localDayKey(now)).toBe("2026-08-17");
    expect(scheduledTime(now, "10:15")).toEqual(new Date(2026, 7, 17, 10, 15));
  });

  it("does not show before the configured time", () => {
    expect(shouldShowDailyReminder(new Date(2026, 7, 17, 9, 59), "10:00", null)).toBe(false);
  });

  it("catches up once after a missed time", () => {
    const now = new Date(2026, 7, 17, 14, 0);
    expect(shouldShowDailyReminder(now, "10:00", null)).toBe(true);
    expect(shouldShowDailyReminder(now, "10:00", "2026-08-17")).toBe(false);
  });

  it("schedules tomorrow after today's reminder has shown", () => {
    const now = new Date(2026, 7, 17, 14, 0);
    expect(millisecondsUntilDailyReminderCheck(now, "10:00", "2026-08-17")).toBe(20 * 60 * 60 * 1000);
  });
});
