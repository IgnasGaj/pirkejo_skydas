import { lithuanianDeadline } from "@/lib/legalDeadline";

/** Dates are calendar dates in YYYY-MM-DD, parsed in UTC to avoid local timezone shifts. */
export function parseCalendarDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
}
export function addCalendarDays(value: string, days: number): string | null {
  const date = parseCalendarDate(value);
  if (!date) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function addCalendarMonths(value: string, months: number): string | null {
  const date = parseCalendarDate(value);
  if (!date || !Number.isInteger(months)) return null;
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const first = new Date(Date.UTC(year, month, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(date.getUTCDate(), last));
  return first.toISOString().slice(0, 10);
}
export function validSequence(earlier: string, later: string): boolean {
  return !!parseCalendarDate(earlier) && !!parseCalendarDate(later) && earlier <= later;
}
/** Receipt day is day 0; the following day is day 1. The adjusted deadline is included. */
export function sellerResponseDeadline(receivedAt: string): string | null { return lithuanianDeadline(receivedAt, 14); }
export function sellerResponseOverdue(receivedAt: string, asOfDate: string): boolean | null {
  const deadline = sellerResponseDeadline(receivedAt);
  if (!deadline || !validSequence(receivedAt, asOfDate)) return null;
  return asOfDate > deadline;
}
