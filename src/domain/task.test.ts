import { describe, expect, it } from "vitest";
import { taskSchema } from "./task";

const baseTask = {
  id: "task-1",
  title: "Prepare report",
  details: "",
  type: "one-time" as const,
  nextDeadline: "2026-08-20",
  status: "pending" as const,
  recurrence: null,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

describe("task important attribute", () => {
  it("accepts an explicitly marked important task", () => {
    expect(taskSchema.parse({ ...baseTask, important: true }).important).toBe(true);
  });

  it("defaults missing important to false for existing JSON data", () => {
    expect(taskSchema.parse(baseTask).important).toBe(false);
  });

  it("rejects a non-boolean important value", () => {
    expect(() => taskSchema.parse({ ...baseTask, important: "yes" })).toThrow();
  });
});
