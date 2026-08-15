export type WidgetTask = {
  id: string;
  title: string;
  deadline: string;
  status: "pending" | "completed" | "skipped";
  important: boolean;
  type?: "one-time" | "recurring";
};

export type WidgetTaskView = WidgetTask & {
  daysRemaining: number;
  weeksRemaining: number;
};

export type WidgetSections = {
  upcoming: WidgetTaskView[];
  recurring: WidgetTaskView[];
  important: WidgetTaskView[];
  pendingCount: number;
};

/** Calendar-day difference, independent of local time and daylight-saving changes. */
export function daysUntil(deadline: string, today: string): number {
  return toUtcDay(deadline) - toUtcDay(today);
}

/**
 * Produces three non-overlapping widget regions. Important tasks have priority,
 * followed by recurring tasks; upcoming contains only ordinary one-time tasks.
 */
export function buildWidgetSections(
  tasks: WidgetTask[],
  today: string,
  upcomingDays: number,
): WidgetSections {
  const pending = tasks
    .filter((task) => task.status === "pending")
    .map((task) => toWidgetTaskView(task, today));
  const byDeadline = (left: WidgetTaskView, right: WidgetTaskView) =>
    left.daysRemaining - right.daysRemaining || left.title.localeCompare(right.title, "zh-CN");
  const important = pending
    .filter((task) => task.important)
    .sort(byDeadline);
  const recurring = pending
    .filter((task) => !task.important && task.type === "recurring")
    .sort(byDeadline);
  const upcoming = pending
    .filter((task) => !task.important && task.type !== "recurring" && task.daysRemaining <= upcomingDays)
    .sort(byDeadline);

  return { upcoming, recurring, important, pendingCount: pending.length };
}

export function formatDeadline(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return `${year} 年 ${month} 月 ${day} 日`;
}

function toWidgetTaskView(task: WidgetTask, today: string): WidgetTaskView {
  const daysRemaining = daysUntil(task.deadline, today);
  return { ...task, daysRemaining, weeksRemaining: daysRemaining / 7 };
}

function toUtcDay(value: string): number {
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!matched) throw new Error(`日期格式应为 YYYY-MM-DD：${value}`);
  const [, year, month, day] = matched.map(Number);
  const utcTime = Date.UTC(year, month - 1, day);
  const normalized = new Date(utcTime);
  if (
    normalized.getUTCFullYear() !== year
    || normalized.getUTCMonth() !== month - 1
    || normalized.getUTCDate() !== day
  ) {
    throw new Error(`无效日期：${value}`);
  }
  return Math.floor(utcTime / 86_400_000);
}
