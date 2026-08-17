export const DEFAULT_DAILY_SHOW_TIME = "10:00";

export function isDailyShowTime(value: string): boolean {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function localDayKey(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function scheduledTime(now: Date, time: string): Date {
  const normalized = isDailyShowTime(time) ? time : DEFAULT_DAILY_SHOW_TIME;
  const [hours, minutes] = normalized.split(":").map(Number);
  const result = new Date(now);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

export function shouldShowDailyReminder(now: Date, time: string, lastShownDay: string | null): boolean {
  return lastShownDay !== localDayKey(now) && now.getTime() >= scheduledTime(now, time).getTime();
}

export function millisecondsUntilDailyReminderCheck(now: Date, time: string, lastShownDay: string | null): number {
  if (shouldShowDailyReminder(now, time, lastShownDay)) return 1;
  const next = scheduledTime(now, time);
  if (next.getTime() <= now.getTime() || lastShownDay === localDayKey(now)) next.setDate(next.getDate() + 1);
  return Math.max(1, next.getTime() - now.getTime());
}
