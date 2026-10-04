import { z } from "zod";
import { todayInVilnius } from "@/lib/date";
import type { Family } from "@/features/complaints/domain";

export const CASE_RULE_VERSION = "LT-VTA-21-CK-1.118-1.121-2026-10-04.1";
export const CASE_SOURCE_VERSION = "2026-10-04";
export const CASE_SOURCE_URL = "https://www.e-tar.lt/rs/actualedition/TAR.D790096B17EE/gjHLCcpfdw/format/ISO_PDF/";
export const CASE_VERIFIED_THROUGH = "2026-10-31";

export const civilDate = z.iso.date().refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Neteisinga data.");

export function assertPastCivilDate(value: string, today = todayInVilnius()) {
  if (!civilDate.safeParse(value).success || value > today) throw new Error("Patikrinkite datą: ji negali būti ateityje.");
  return value;
}

function dateAtUtc(value: string) { return new Date(`${value}T00:00:00.000Z`); }
function format(date: Date) { return date.toISOString().slice(0, 10); }
export function addCivilDays(value: string, days: number) {
  const date = dateAtUtc(value);
  date.setUTCDate(date.getUTCDate() + days);
  return format(date);
}
export function civilDaysBetween(first: string, second: string) {
  return Math.round((dateAtUtc(second).getTime() - dateAtUtc(first).getTime()) / 86400000);
}

// Gregorian computus. Lithuania observes Easter Sunday and Monday as public holidays.
function easterSunday(year: number) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k + 7) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
export function isLithuanianNonWorkingDay(value: string) {
  const date = dateAtUtc(value), day = date.getUTCDay();
  if (day === 0 || day === 6) return true;
  const fixed = new Set(["01-01", "02-16", "03-11", "05-01", "06-24", "07-06", "08-15", "11-01", "11-02", "12-24", "12-25", "12-26"]);
  if (fixed.has(value.slice(5))) return true;
  const easter = easterSunday(date.getUTCFullYear());
  return value === easter || value === addCivilDays(easter, 1);
}

export type Deadline =
  | { state: "UNAVAILABLE"; reason: string }
  | { state: "PENDING" | "DUE_TODAY" | "EXPIRED" | "RESPONSE_RECORDED"; date: string; daysRemaining: number; basis: string; ruleVersion: string; sourceVersion: string };

export function responseDeadline(input: { family: Family; submittedOn: string | null; receivedOn: string | null; substantiveResponse: boolean; today?: string; sourceValidThrough?: string }): Deadline {
  if (!input.submittedOn) return { state: "UNAVAILABLE", reason: "Dokumentas dar nepateiktas pardavėjui." };
  if (!input.receivedOn) return { state: "UNAVAILABLE", reason: "Pardavėjo gavimo data nežinoma." };
  if (input.family !== "DEFECTIVE_PRODUCT") return { state: "UNAVAILABLE", reason: "Šiam dokumentui pardavėjo atsakymo terminas neskaičiuojamas." };
  if (!civilDate.safeParse(input.receivedOn).success || input.receivedOn < input.submittedOn) return { state: "UNAVAILABLE", reason: "Patikrinkite pardavėjo gavimo datą." };
  let finalDay = addCivilDays(input.receivedOn, 14);
  while (isLithuanianNonWorkingDay(finalDay)) finalDay = addCivilDays(finalDay, 1);
  if (input.sourceValidThrough && (finalDay > input.sourceValidThrough || (input.today ?? todayInVilnius()) > input.sourceValidThrough))
    return { state: "UNAVAILABLE", reason: "Termino šaltinių redakcijas reikia patikrinti iš naujo." };
  const daysRemaining = civilDaysBetween(input.today ?? todayInVilnius(), finalDay);
  return { state: input.substantiveResponse ? "RESPONSE_RECORDED" : daysRemaining < 0 ? "EXPIRED" : daysRemaining === 0 ? "DUE_TODAY" : "PENDING", date: finalDay, daysRemaining, basis: input.receivedOn, ruleVersion: CASE_RULE_VERSION, sourceVersion: CASE_SOURCE_VERSION };
}
