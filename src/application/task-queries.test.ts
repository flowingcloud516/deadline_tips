import { describe, expect, it } from "vitest";
import type { Task } from "../domain/task";
import { queryWidgetTaskSections, remainingTime } from "./task-queries";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    title: "Task",
    details: "",
    type: "one-time",
    nextDeadline: "2026-08-20",
    important: false,
    status: "pending",
    recurrence: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("queryWidgetTaskSections", () => {
  const today = "2026-08-10";

  it("shows overdue and configured-range pending tasks in deadline order", () => {
    const result = queryWidgetTaskSections([
      makeTask({ id: "future", nextDeadline: "2026-08-14" }),
      makeTask({ id: "overdue", nextDeadline: "2026-08-08" }),
      makeTask({ id: "today", nextDeadline: "2026-08-10" }),
    ], today, 3);

    expect(result.upcoming.map(({ task }) => task.id)).toEqual(["overdue", "today"]);
    expect(result.upcoming[0]).toMatchObject({ daysRemaining: -2, overdue: true });
  });

  it("keeps every important task in the important section regardless of range", () => {
    const result = queryWidgetTaskSections([
      makeTask({ id: "near-important", nextDeadline: "2026-08-17", important: true }),
      makeTask({ id: "long-important", nextDeadline: "2026-09-10", important: true }),
    ], today, 7);

    expect(result.upcoming).toEqual([]);
    expect(result.important.map(({ task }) => task.id)).toEqual(["near-important", "long-important"]);
  });

  it("does not show non-important long-term tasks or non-pending tasks", () => {
    const result = queryWidgetTaskSections([
      makeTask({ id: "ordinary-long", nextDeadline: "2026-09-10" }),
      makeTask({ id: "done-important", nextDeadline: "2026-09-10", important: true, status: "completed" }),
      makeTask({ id: "skipped-important", nextDeadline: "2026-09-10", important: true, status: "skipped" }),
    ], today, 7);

    expect(result).toEqual({ upcoming: [], important: [] });
  });

  it("does not duplicate overdue important tasks across the sections", () => {
    const result = queryWidgetTaskSections([
      makeTask({ id: "late-important", nextDeadline: "2026-08-09", important: true }),
    ], today, 7);

    expect(result.upcoming).toHaveLength(0);
    expect(result.important).toHaveLength(1);
    expect(result.important[0]).toMatchObject({ daysRemaining: -1, overdue: true });
  });

  it("sorts long-term important tasks by deadline", () => {
    const result = queryWidgetTaskSections([
      makeTask({ id: "later", nextDeadline: "2026-10-01", important: true }),
      makeTask({ id: "sooner", nextDeadline: "2026-09-01", important: true }),
    ], today, 7);

    expect(result.important.map(({ task }) => task.id)).toEqual(["sooner", "later"]);
  });

  it("rejects an invalid upcoming range", () => {
    expect(() => queryWidgetTaskSections([], today, 1.5)).toThrow("upcomingDays");
  });
});

describe("remainingTime", () => {
  it("rounds approximate weeks to one decimal place", () => {
    expect(remainingTime(45)).toEqual({ daysRemaining: 45, weeksRemaining: 6.4 });
    expect(remainingTime(1)).toEqual({ daysRemaining: 1, weeksRemaining: 0.1 });
  });
});
