import { describe, expect, it } from "vitest";
import { buildWidgetSections, daysUntil, formatDeadline, type WidgetTask } from "./widget-model";

const tasks: WidgetTask[] = [
  { id: "near-important", title: "近期重要", deadline: "2026-08-14", status: "pending", important: true },
  { id: "near-normal", title: "近期普通", deadline: "2026-08-13", status: "pending", important: false },
  { id: "long-important", title: "长期重要", deadline: "2026-09-30", status: "pending", important: true },
  { id: "completed", title: "已完成", deadline: "2026-08-12", status: "completed", important: true },
];

describe("widget presentation model", () => {
  it("keeps overdue pending tasks visible in the upcoming region", () => {
    const result = buildWidgetSections([
      { id: "overdue", title: "已逾期", deadline: "2026-08-10", status: "pending", important: false },
    ], "2026-08-12", 7);
    expect(result.upcoming).toHaveLength(1);
    expect(result.upcoming[0]).toMatchObject({ id: "overdue", daysRemaining: -2 });
  });

  it("keeps near and long important tasks in the important region only", () => {
    const result = buildWidgetSections(tasks, "2026-08-12", 7);
    expect(result.upcoming.map((task) => task.id)).toEqual(["near-normal"]);
    expect(result.important.map((task) => task.id)).toEqual(["near-important", "long-important"]);
    expect(result.recurring).toEqual([]);
    expect(new Set([...result.upcoming, ...result.recurring, ...result.important].map((task) => task.id)).size).toBe(3);
  });

  it("keeps recurring tasks visible outside the upcoming range", () => {
    const result = buildWidgetSections([
      { id: "recurring", title: "长期周期任务", deadline: "2026-10-12", status: "pending", important: false, type: "recurring" },
    ], "2026-08-12", 7);
    expect(result.upcoming).toEqual([]);
    expect(result.recurring.map((task) => task.id)).toEqual(["recurring"]);
  });

  it("excludes completed tasks and calculates long-term weeks to one-decimal-ready precision", () => {
    const result = buildWidgetSections(tasks, "2026-08-12", 7);
    expect(result.pendingCount).toBe(3);
    expect(result.important[0]).toMatchObject({ id: "near-important", daysRemaining: 2 });
    const longTerm = result.important.find((task) => task.id === "long-important");
    expect(longTerm).toMatchObject({ daysRemaining: 49, weeksRemaining: 7 });
    expect(longTerm?.weeksRemaining.toFixed(1)).toBe("7.0");
  });

  it("uses calendar days and formats the deadline in Chinese", () => {
    expect(daysUntil("2028-02-29", "2028-02-28")).toBe(1);
    expect(formatDeadline("2026-08-12")).toBe("2026 年 8 月 12 日");
  });
});
