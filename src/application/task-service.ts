import { taskSchema, type Recurrence, type Task, type TaskStatus } from "../domain/task";
import { parseAppData, type AppData, type StoragePort } from "../storage/storage";

/** Fields supplied when a task is first created. Audit fields are service-owned. */
export interface CreateTaskInput {
  title: string;
  details?: string;
  type: Task["type"];
  nextDeadline: string;
  important?: boolean;
  /** Defaults to pending. Kept available for data-import and recovery workflows. */
  status?: TaskStatus;
  recurrence: Recurrence | null;
}

/** User-editable task fields. IDs and creation time cannot be changed through this API. */
export interface UpdateTaskInput {
  title?: string;
  details?: string;
  type?: Task["type"];
  nextDeadline?: string;
  important?: boolean;
  status?: TaskStatus;
  recurrence?: Recurrence | null;
}

export interface TaskServiceDependencies {
  /** Injected so production uses random IDs while tests can be deterministic. */
  createId?: () => string;
  /** Injected so timestamps can be tested without relying on the system clock. */
  now?: () => string;
}

export class TaskNotFoundError extends Error {
  constructor(taskId: string) {
    super(`Task not found: ${taskId}`);
    this.name = "TaskNotFoundError";
  }
}

/**
 * Application service for task mutations.
 *
 * It owns generated IDs and audit timestamps, validates every task before
 * persistence, and serializes mutations so quick consecutive edits cannot
 * overwrite one another in a single application process.
 */
export class TaskService {
  private mutationQueue: Promise<void> = Promise.resolve();
  private readonly createId: () => string;
  private readonly now: () => string;

  constructor(
    private readonly storage: StoragePort,
    dependencies: TaskServiceDependencies = {},
  ) {
    this.createId = dependencies.createId ?? (() => crypto.randomUUID());
    this.now = dependencies.now ?? (() => new Date().toISOString());
  }

  async load(): Promise<AppData> {
    return parseAppData(await this.storage.load());
  }

  async list(): Promise<Task[]> {
    return (await this.load()).tasks;
  }

  async create(input: CreateTaskInput): Promise<Task> {
    return this.mutate((data) => {
      const timestamp = this.now();
      const task = taskSchema.parse({
        id: this.createId(),
        title: input.title,
        details: input.details ?? "",
        type: input.type,
        nextDeadline: input.nextDeadline,
        important: input.important ?? false,
        status: input.status ?? "pending",
        recurrence: input.recurrence,
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      return { data: { ...data, tasks: [...data.tasks, task] }, result: task };
    });
  }

  async update(taskId: string, input: UpdateTaskInput): Promise<Task> {
    return this.mutate((data) => {
      const index = this.findTaskIndex(data, taskId);
      const existing = data.tasks[index];
      const updated = taskSchema.parse({
        ...existing,
        ...input,
        id: existing.id,
        createdAt: existing.createdAt,
        updatedAt: this.now(),
      });
      return { data: this.replaceTask(data, index, updated), result: updated };
    });
  }

  async delete(taskId: string): Promise<void> {
    await this.mutate((data) => {
      const index = this.findTaskIndex(data, taskId);
      return {
        data: { ...data, tasks: data.tasks.filter((_, currentIndex) => currentIndex !== index) },
        result: undefined,
      };
    });
  }

  async changeStatus(taskId: string, status: TaskStatus): Promise<Task> {
    return this.update(taskId, { status });
  }

  /**
   * Records completion of the current occurrence. A recurring task's deadline is
   * its fixed end date, so completing an occurrence must not move that boundary.
   */
  async completeCurrentCycle(taskId: string): Promise<Task> {
    return this.mutate((data) => {
      const index = this.findTaskIndex(data, taskId);
      const existing = data.tasks[index];
      const completed = taskSchema.parse(
        existing.type === "recurring"
          ? {
              ...existing,
              status: "pending",
              updatedAt: this.now(),
            }
          : { ...existing, status: "completed", updatedAt: this.now() },
      );
      return { data: this.replaceTask(data, index, completed), result: completed };
    });
  }

  private async mutate<T>(operation: (data: AppData) => { data: AppData; result: T }): Promise<T> {
    const currentOperation = this.mutationQueue.then(async () => {
      const current = parseAppData(await this.storage.load());
      const { data, result } = operation(current);
      const validated = parseAppData(data);
      await this.storage.save(validated);
      return structuredClone(result);
    });

    // Keep later calls operational even if this mutation fails validation or I/O.
    this.mutationQueue = currentOperation.then(
      () => undefined,
      () => undefined,
    );
    return currentOperation;
  }

  private findTaskIndex(data: AppData, taskId: string): number {
    const index = data.tasks.findIndex((task) => task.id === taskId);
    if (index < 0) throw new TaskNotFoundError(taskId);
    return index;
  }

  private replaceTask(data: AppData, index: number, task: Task): AppData {
    const tasks = [...data.tasks];
    tasks[index] = task;
    return { ...data, tasks };
  }
}
