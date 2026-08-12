import { differenceInCalendarDays } from "../../domain/date";
import type { Recurrence, Task, TaskStatus } from "../../domain/task";

export type TaskTypeFilter = "all" | Task["type"];
export type TaskStatusFilter = "all" | TaskStatus;
export type ImportantFilter = "all" | "important" | "ordinary";

export interface TaskManagerFilters {
  type: TaskTypeFilter;
  status: TaskStatusFilter;
  important: ImportantFilter;
}

export const defaultTaskManagerFilters: TaskManagerFilters = {
  type: "all",
  status: "all",
  important: "all",
};

export type RecurrenceKind = "weekly" | "monthly-day" | "monthly-before-end";

export interface TaskFormValue {
  title: string;
  details: string;
  type: Task["type"];
  nextDeadline: string;
  important: boolean;
  status: TaskStatus;
  recurrence: Recurrence | null;
}

export interface TaskFormDraft {
  title: string;
  details: string;
  type: Task["type"];
  nextDeadline: string;
  important: boolean;
  status: TaskStatus;
  recurrenceKind: RecurrenceKind;
  weekday: string;
  monthlyDay: string;
  daysBeforeEnd: string;
}

export type TaskFormErrors = Partial<Record<keyof TaskFormDraft, string>>;

export function createTaskFormDraft(initialDate: string): TaskFormDraft {
  return {
    title: "",
    details: "",
    type: "one-time",
    nextDeadline: initialDate,
    important: false,
    status: "pending",
    recurrenceKind: "weekly",
    weekday: "1",
    monthlyDay: "1",
    daysBeforeEnd: "0",
  };
}

export function draftFromTask(task: Task): TaskFormDraft {
  const draft = createTaskFormDraft(task.nextDeadline);
  draft.title = task.title;
  draft.details = task.details;
  draft.type = task.type;
  draft.important = task.important;
  draft.status = task.status;
  if (task.recurrence) {
    draft.recurrenceKind = task.recurrence.kind;
    if (task.recurrence.kind === "weekly") draft.weekday = String(task.recurrence.weekday);
    if (task.recurrence.kind === "monthly-day") draft.monthlyDay = String(task.recurrence.day);
    if (task.recurrence.kind === "monthly-before-end") draft.daysBeforeEnd = String(task.recurrence.daysBeforeEnd);
  }
  return draft;
}

/** Counts user-visible Unicode code points, rather than UTF-16 code units. */
export function titleLength(title: string): number {
  return Array.from(title.trim()).length;
}

export function isIsoCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const candidate = new Date(year, month - 1, day);
  return candidate.getFullYear() === year && candidate.getMonth() === month - 1 && candidate.getDate() === day;
}

export function validateTaskForm(draft: TaskFormDraft): TaskFormErrors {
  const errors: TaskFormErrors = {};
  const length = titleLength(draft.title);
  if (length === 0) errors.title = "请输入任务名称。";
  else if (length > 20) errors.title = "任务名称不能超过 20 个字符。";
  if (!isIsoCalendarDate(draft.nextDeadline)) errors.nextDeadline = "请选择有效的截止日期。";

  if (draft.type === "recurring") {
    if (draft.recurrenceKind === "weekly" && !isIntegerInRange(draft.weekday, 1, 7)) {
      errors.weekday = "请选择星期一至星期日。";
    }
    if (draft.recurrenceKind === "monthly-day" && !isIntegerInRange(draft.monthlyDay, 1, 31)) {
      errors.monthlyDay = "请输入 1 至 31 日。";
    }
    if (draft.recurrenceKind === "monthly-before-end" && !isIntegerInRange(draft.daysBeforeEnd, 0, 30)) {
      errors.daysBeforeEnd = "请输入月末前 0 至 30 天。";
    }
  }
  return errors;
}

export function toTaskFormValue(draft: TaskFormDraft): TaskFormValue | null {
  if (Object.keys(validateTaskForm(draft)).length > 0) return null;
  return {
    title: draft.title.trim(),
    details: draft.details,
    type: draft.type,
    nextDeadline: draft.nextDeadline,
    important: draft.important,
    status: draft.status,
    recurrence: draft.type === "recurring" ? recurrenceFromDraft(draft) : null,
  };
}

export function filterAndSortTasks(
  tasks: readonly Task[],
  filters: TaskManagerFilters,
): Task[] {
  return tasks
    .filter((task) => filters.type === "all" || task.type === filters.type)
    .filter((task) => filters.status === "all" || task.status === filters.status)
    .filter((task) => filters.important === "all" || (filters.important === "important" ? task.important : !task.important))
    .slice()
    .sort((left, right) => left.nextDeadline.localeCompare(right.nextDeadline) || left.title.localeCompare(right.title, "zh-CN"));
}

export function displayStatus(task: Task, today: string): "overdue" | TaskStatus {
  return task.status === "pending" && differenceInCalendarDays(task.nextDeadline, today) < 0
    ? "overdue"
    : task.status;
}

function recurrenceFromDraft(draft: TaskFormDraft): Recurrence {
  if (draft.recurrenceKind === "weekly") return { kind: "weekly", weekday: Number(draft.weekday) };
  if (draft.recurrenceKind === "monthly-day") return { kind: "monthly-day", day: Number(draft.monthlyDay) };
  return { kind: "monthly-before-end", daysBeforeEnd: Number(draft.daysBeforeEnd) };
}

function isIntegerInRange(value: string, minimum: number, maximum: number): boolean {
  const number = Number(value);
  return Number.isInteger(number) && number >= minimum && number <= maximum;
}
