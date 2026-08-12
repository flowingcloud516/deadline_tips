import { describe, expect, it } from "vitest";
import type { Task } from "../../domain/task";
import { createTaskFormDraft, displayStatus, filterAndSortTasks, titleLength, toTaskFormValue, validateTaskForm } from "./manager-model";

function task(overrides: Partial<Task> = {}): Task {
  return { id: "base", title: "任务", details: "", type: "one-time", nextDeadline: "2026-08-20", important: false, status: "pending", recurrence: null, createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z", ...overrides };
}

describe("task manager form model", () => {
  it("counts Unicode characters and enforces the 20-character task-name limit", () => {
    expect(titleLength("😀".repeat(20))).toBe(20);
    const draft = createTaskFormDraft("2026-08-12");
    draft.title = "😀".repeat(21);
    expect(validateTaskForm(draft).title).toContain("20");
  });

  it("requires a valid calendar deadline", () => {
    const draft = createTaskFormDraft("2026-02-30");
    draft.title = "测试";
    expect(validateTaskForm(draft).nextDeadline).toBeTruthy();
  });

  it("converts a weekly recurring draft to the public callback value", () => {
    const draft = createTaskFormDraft("2026-08-12");
    Object.assign(draft, { title: "周报", type: "recurring", recurrenceKind: "weekly", weekday: "5", important: true });
    expect(toTaskFormValue(draft)).toMatchObject({ title: "周报", type: "recurring", important: true, recurrence: { kind: "weekly", weekday: 5 } });
  });

  it("validates each supported monthly recurrence value", () => {
    const draft = createTaskFormDraft("2026-08-12");
    Object.assign(draft, { title: "月度任务", type: "recurring", recurrenceKind: "monthly-day", monthlyDay: "32" });
    expect(validateTaskForm(draft).monthlyDay).toBeTruthy();
    draft.recurrenceKind = "monthly-before-end";
    draft.daysBeforeEnd = "31";
    expect(validateTaskForm(draft).daysBeforeEnd).toBeTruthy();
  });
});

describe("task manager list model", () => {
  it("filters status, type and importance and orders equal results by deadline", () => {
    const tasks = [task({ id: "late", title: "晚", nextDeadline: "2026-09-01", important: true }), task({ id: "early", title: "早", nextDeadline: "2026-08-15", important: true }), task({ id: "done", status: "completed", important: true })];
    const result = filterAndSortTasks(tasks, { type: "all", status: "pending", important: "important" });
    expect(result.map((item) => item.id)).toEqual(["early", "late"]);
  });

  it("presents overdue as a derived status without changing the stored status", () => {
    const overdue = task({ nextDeadline: "2026-08-10" });
    expect(displayStatus(overdue, "2026-08-12")).toBe("overdue");
    expect(overdue.status).toBe("pending");
  });
});
