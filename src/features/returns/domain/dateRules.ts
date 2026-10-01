export type PeriodState = "WITHIN_14_DAYS" | "EXPIRED" | "INVALID_DATE";

function utcDay(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return Math.floor(date.getTime() / 86_400_000);
}

/** Day 1 is the day after purchase or receipt; day 14 is included. */
export function evaluateFourteenDayPeriod(eventDate: string, asOfDate: string): PeriodState {
  const eventDay = utcDay(eventDate);
  const today = utcDay(asOfDate);
  if (eventDay === null || today === null || eventDay > today) return "INVALID_DATE";
  return today - eventDay <= 14 ? "WITHIN_14_DAYS" : "EXPIRED";
}
