import { describe, expect, it } from "vitest";
import { MemoryStorage } from "../storage/storage";
import { TaskNotFoundError, TaskService } from "./task-service";

function makeService() {
  let id = 0;
  let moment = 0;
  const storage = new MemoryStorage();
  const service = new TaskService(storage, {
    createId: () => `task-${++id}`,
    now: () => `2026-08-12T00:00:0${moment++}.000Z`,
  });
  return { storage, service };
}

describe("TaskService", () => {
  it("creates a validated task with injected ID and timestamps", async () => {
    const { storage, service } = makeService();
    const task = await service.create({
      title: "Prepare report",
      type: "one-time",
      nextDeadline: "2026-08-20",
      recurrence: null,
    });

    expect(task).toMatchObject({
      id: "task-1",
      title: "Prepare report",
      details: "",
      important: false,
      status: "pending",
      createdAt: "2026-08-12T00:00:00.000Z",
      updatedAt: "2026-08-12T00:00:00.000Z",
    });
    expect((await storage.load()).tasks).toEqual([task]);
  });

  it("rejects a task that violates the task schema without saving it", async () => {
    const { storage, service } = makeService();
    await expect(service.create({
      title: "",
      type: "recurring",
      nextDeadline: "2026-08-20",
      recurrence: null,
    })).rejects.toThrow();
    expect((await storage.load()).tasks).toEqual([]);
  });

  it("updates editable fields but preserves identity and creation time", async () => {
    const { service } = makeService();
    const created = await service.create({
      title: "Draft",
      type: "one-time",
      nextDeadline: "2026-08-20",
      recurrence: null,
    });
    const updated = await service.update(created.id, {
      title: "Final draft",
      details: "Ready for review",
      important: true,
      status: "skipped",
    });

    expect(updated).toMatchObject({
      id: created.id,
      createdAt: created.createdAt,
      updatedAt: "2026-08-12T00:00:01.000Z",
      title: "Final draft",
      details: "Ready for review",
      important: true,
      status: "skipped",
    });
  });

  it("validates a changed recurrence together with its task type", async () => {
    const { service } = makeService();
    const task = await service.create({
      title: "Meeting",
      type: "one-time",
      nextDeadline: "2026-08-20",
      recurrence: null,
    });

    await expect(service.update(task.id, { type: "recurring" })).rejects.toThrow();
    const recurring = await service.update(task.id, {
      type: "recurring",
      recurrence: { kind: "weekly", weekday: 1 },
    });
    expect(recurring.recurrence).toEqual({ kind: "weekly", weekday: 1 });
  });

  it("changes a task status and deletes a task", async () => {
    const { service } = makeService();
    const task = await service.create({
      title: "Pay bill",
      type: "one-time",
      nextDeadline: "2026-08-20",
      recurrence: null,
    });

    await expect(service.changeStatus(task.id, "completed")).resolves.toMatchObject({ status: "completed" });
    await service.delete(task.id);
    await expect(service.list()).resolves.toEqual([]);
  });

  it("completes a one-time task", async () => {
    const { service } = makeService();
    const task = await service.create({
      title: "Submit application",
      type: "one-time",
      nextDeadline: "2026-08-20",
      recurrence: null,
    });
    const completed = await service.completeCurrentCycle(task.id);
    expect(completed).toMatchObject({ status: "completed", nextDeadline: "2026-08-20" });
  });

  it("completes a recurring task by advancing it and returning it to pending", async () => {
    const { service } = makeService();
    const task = await service.create({
      title: "Month end review",
      type: "recurring",
      nextDeadline: "2028-02-28",
      recurrence: { kind: "monthly-before-end", daysBeforeEnd: 1 },
    });
    const completed = await service.completeCurrentCycle(task.id);
    expect(completed).toMatchObject({ status: "pending", nextDeadline: "2028-02-28" });
  });

  it("reports a missing task for every mutation", async () => {
    const { service } = makeService();
    await expect(service.update("missing", { title: "Nope" })).rejects.toBeInstanceOf(TaskNotFoundError);
    await expect(service.delete("missing")).rejects.toBeInstanceOf(TaskNotFoundError);
    await expect(service.completeCurrentCycle("missing")).rejects.toBeInstanceOf(TaskNotFoundError);
  });
});
