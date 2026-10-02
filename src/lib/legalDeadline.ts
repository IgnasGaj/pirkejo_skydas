/** Lithuanian civil dates; UTC arithmetic avoids host timezone and DST shifts. */
export function parseLegalDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
}

function easterSunday(year: number): Date {
  // Gregorian computus for the western Easter named in Labour Code article 123.
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k + 7) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = (h + l - 7 * m + 114) % 31 + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

const fixedHolidays = new Set(["01-01", "02-16", "03-11", "05-01", "06-24", "07-06", "08-15", "11-01", "11-02", "12-24", "12-25", "12-26"]);

function isLithuanianHoliday(date: Date): boolean {
  const monthDay = date.toISOString().slice(5, 10);
  if (fixedHolidays.has(monthDay)) return true;
  const easter = easterSunday(date.getUTCFullYear()).getTime();
  return date.getTime() === easter || date.getTime() === easter + 86_400_000 ||
    (date.getUTCMonth() === 4 && date.getUTCDay() === 0 && date.getUTCDate() <= 7) ||
    (date.getUTCMonth() === 5 && date.getUTCDay() === 0 && date.getUTCDate() <= 7);
}

/** Event day is excluded; calendar days count, and a non-working final day rolls forward. */
export function lithuanianDeadline(eventDate: string, calendarDays: number): string | null {
  const date = parseLegalDate(eventDate);
  if (!date || !Number.isInteger(calendarDays) || calendarDays < 1) return null;
  date.setUTCDate(date.getUTCDate() + calendarDays);
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6 || isLithuanianHoliday(date)) {
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return date.toISOString().slice(0, 10);
}
