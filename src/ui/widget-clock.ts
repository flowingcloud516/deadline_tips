/** Formats a Date as a local calendar date without UTC conversion. */
export function localDateString(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** Delay to the next local top-of-hour boundary, including DST transitions. */
export function millisecondsUntilNextHour(now: Date): number {
  const next = new Date(now);
  next.setMinutes(0, 0, 0);
  next.setHours(next.getHours() + 1);
  return Math.max(1, next.getTime() - now.getTime());
}
