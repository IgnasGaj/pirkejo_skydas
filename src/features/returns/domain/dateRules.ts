import { lithuanianDeadline, parseLegalDate } from "@/lib/legalDeadline";

export type PeriodState = "WITHIN_14_DAYS" | "EXPIRED" | "INVALID_DATE";

/** Day 1 follows purchase or receipt; the adjusted final working day is included. */
export function evaluateFourteenDayPeriod(eventDate: string, asOfDate: string): PeriodState {
  const event = parseLegalDate(eventDate);
  const today = parseLegalDate(asOfDate);
  const deadline = lithuanianDeadline(eventDate, 14);
  if (!event || !today || !deadline || event > today) return "INVALID_DATE";
  return asOfDate <= deadline ? "WITHIN_14_DAYS" : "EXPIRED";
}
