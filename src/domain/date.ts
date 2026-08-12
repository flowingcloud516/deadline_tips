import type { Recurrence, Task } from "./task";

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseLocalDate(value: string): Date {
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) throw new Error(`无效日期：${value}`);
  const [, year, month, day] = match;
  const result = new Date(Number(year), Number(month) - 1, Number(day));
  if (
    result.getFullYear() !== Number(year) ||
    result.getMonth() !== Number(month) - 1 ||
    result.getDate() !== Number(day)
  ) {
    throw new Error(`无效日期：${value}`);
  }
  return result;
}

export function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function deadlineForMonth(year: number, monthIndex: number, recurrence: Recurrence): Date {
  const lastDay = daysInMonth(year, monthIndex);
  if (recurrence.kind === "monthly-day") {
    return new Date(year, monthIndex, Math.min(recurrence.day, lastDay));
  }
  if (recurrence.kind === "monthly-before-end") {
    return new Date(year, monthIndex, Math.max(1, lastDay - recurrence.daysBeforeEnd));
  }
  throw new Error("每月日期计算收到非每月规则");
}

export function nextDeadline(currentDeadline: string, recurrence: Recurrence): string {
  const current = parseLocalDate(currentDeadline);

  if (recurrence.kind === "weekly") {
    const next = new Date(current);
    next.setDate(next.getDate() + 7);
    return formatLocalDate(next);
  }

  const nextMonth = new Date(current.getFullYear(), current.getMonth() + 1, 1);
  return formatLocalDate(deadlineForMonth(nextMonth.getFullYear(), nextMonth.getMonth(), recurrence));
}

export function differenceInCalendarDays(date: string, today: string): number {
  const target = parseLocalDate(date);
  const base = parseLocalDate(today);
  const targetUtc = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate());
  const baseUtc = Date.UTC(base.getFullYear(), base.getMonth(), base.getDate());
  return Math.round((targetUtc - baseUtc) / 86_400_000);
}

export function isOverdue(task: Task, today: string): boolean {
  return task.status === "pending" && differenceInCalendarDays(task.nextDeadline, today) < 0;
}

