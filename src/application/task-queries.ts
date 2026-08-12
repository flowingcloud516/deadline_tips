import { differenceInCalendarDays, isOverdue } from "../domain/date";
import type { Task } from "../domain/task";

/**
 * Presentation-ready task information shared by the desktop widget and future
 * views. It deliberately contains no UI framework types.
 */
export interface TaskDeadlineSummary {
  task: Task;
  /** Calendar days until the deadline; negative values mean overdue. */
  daysRemaining: number;
  /** Remaining weeks rounded to one decimal place. Only used for long-term important tasks. */
  weeksRemaining: number;
  overdue: boolean;
}

export interface WidgetTaskSections {
  /** Non-important pending tasks that are overdue or due in the configured upcoming period. */
  upcoming: TaskDeadlineSummary[];
  /** All important pending tasks, regardless of their deadline distance. */
  important: TaskDeadlineSummary[];
}

function roundToOneDecimal(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

function compareByDeadline(left: TaskDeadlineSummary, right: TaskDeadlineSummary): number {
  if (left.daysRemaining !== right.daysRemaining) {
    return left.daysRemaining - right.daysRemaining;
  }
  return left.task.id.localeCompare(right.task.id);
}

function summarize(task: Task, today: string): TaskDeadlineSummary {
  const daysRemaining = differenceInCalendarDays(task.nextDeadline, today);
  return {
    task,
    daysRemaining,
    weeksRemaining: roundToOneDecimal(daysRemaining / 7),
    overdue: isOverdue(task, today),
  };
}

/**
 * Splits widget tasks into mutually exclusive sections.
 *
 * Importance has section priority: every important pending task stays in the
 * important section, even when it is near or overdue. Only non-important tasks
 * can enter upcoming. The two sections are therefore always mutually exclusive.
 */
export function queryWidgetTaskSections(
  tasks: readonly Task[],
  today: string,
  upcomingDays: number,
): WidgetTaskSections {
  if (!Number.isInteger(upcomingDays) || upcomingDays < 0) {
    throw new Error("upcomingDays must be a non-negative integer");
  }

  const upcoming: TaskDeadlineSummary[] = [];
  const important: TaskDeadlineSummary[] = [];

  for (const task of tasks) {
    if (task.status !== "pending") continue;

    const summary = summarize(task, today);
    if (task.important) {
      important.push(summary);
    } else if (summary.daysRemaining <= upcomingDays) {
      upcoming.push(summary);
    }
  }

  upcoming.sort(compareByDeadline);
  important.sort(compareByDeadline);
  return { upcoming, important };
}

/** Returns the exact day count plus a one-decimal approximate week count. */
export function remainingTime(daysRemaining: number): { daysRemaining: number; weeksRemaining: number } {
  return { daysRemaining, weeksRemaining: roundToOneDecimal(daysRemaining / 7) };
}
