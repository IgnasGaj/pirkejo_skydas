import type { Candidate, ProductCandidate, ReceiptSuggestions } from "./types";
import { hasNonEuroCurrencyMarker } from "./currencyMarkers";

const excludedSeller = /(?:^|[^\p{L}])(?:PVM|VAT|LT\d{9,}|ĮMONĖS\s+KOD\p{L}*|IMONES\s+KOD\p{L}*|KASININK\p{L}*|KASA|TERMINAL\p{L}*|BANK\p{L}*|VISA|MASTERCARD|ADRES\p{L}*|GATV\p{L}*|TEL\.?|KORTEL\p{L}*|MOKĖJIM\p{L}*|ČEKIO|KVITO|WWW|HTTP|ACQUIRER)(?:$|[^\p{L}])|(?:^|\s)(?:g\.|gatvė|pr\.|prospektas|al\.|alėja)\s*\d*|\b\d+\s*(?:g\.|gatvė|pr\.|prospektas|al\.|alėja)/iu;
const excludedProduct = /PVM|VAT|IŠ VISO|VISO MOKĖTI|SUMA|TOTAL|SUBTOTAL|TARPINĖ|NUOLAID|GRĄŽA|GRYN|KORTEL|MOKĖTA|APMOKĖTA|SUTAUP|KAINA\/VNT|VNT KAINA|ČEK|KVIT|REFUND|GRĄŽINIM|KASA|TERMINAL/i;
const datePattern = /\b(?:\d{4}[.-]\d{2}[.-]\d{2}|\d{2}[.-]\d{2}[.-]\d{4})\b/g;
const amountPattern = /(?<![\w.,-])-?(?:\d{1,3}(?:[ \u00a0]\d{3})+|\d{1,9})[,.]\d{2}(?![\d.,])/g;

export function parseEuroCents(value: string): number | null {
  const trimmed = value.replace(/\u00a0/g, " ").trim();
  if (!/^(?:\d{1,9}|\d{1,3}(?: \d{3})+)[,.]\d{2}$/.test(trimmed)) return null;
  const normalized = trimmed.replace(/ /g, "").replace(",", ".");
  const [whole, fraction] = normalized.split(".");
  const cents = Number(whole) * 100 + Number(fraction);
  return Number.isSafeInteger(cents) && cents <= 999_999_999_99 ? cents : null;
}

function receiptDate(value: string, asOfDate: string): string | null {
  const parts = value.split(/[.-]/).map(Number);
  const [year, month, day] = value.length === 10 && value[4] === "-" || value[4] === "."
    ? parts : [parts[2], parts[1], parts[0]];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  const iso = `${year.toString().padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return iso <= asOfDate ? iso : null;
}

function candidate<T>(value: T, source: string): Candidate<T> { return { value, source }; }

export function parseReceiptText(text: string, asOfDate: string): ReceiptSuggestions {
  const rawText = text.slice(0, 20_000);
  const warnings: string[] = [];
  if (text.length > rawText.length) warnings.push("Nuskaitytas tekstas sutrumpintas; patikrinkite originalų čekį.");
  const lines = rawText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 250);
  let seller: Candidate<string> | null = null;
  for (const line of lines.slice(0, 8)) {
    if (line.length >= 3 && line.length <= 90 && /\p{L}/u.test(line) && !excludedSeller.test(line) && !/\d[,.]\d{2}/.test(line) && !/^\d/.test(line)) {
      seller = candidate(line, line); break;
    }
  }
  const dates = new Map<string, string>();
  for (const line of lines) {
    if (/\b(?:GARANT|GALIOJA|SPAUSDIN|ATSPAUSDIN|APMOKĖTI IKI|DUE|VALID|EXPIR)/i.test(line)) continue;
    for (const match of line.matchAll(datePattern)) {
      const value = receiptDate(match[0], asOfDate);
      if (value) dates.set(value, line);
      else warnings.push(`Netinkama arba būsima data: ${match[0]}`);
    }
  }
  if (dates.size > 1) warnings.push("Rastos kelios skirtingos datos; pasirinkite pirkimo datą patys.");
  const purchaseDate = dates.size === 1 ? candidate([...dates.keys()][0], [...dates.values()][0]) : null;
  let referenceNumber: Candidate<string> | null = null;
  for (const line of lines) {
    const match = line.match(/(?:ČEK(?:IS|IO)?|CEK(?:IS|IO)?|KVIT(?:AS|O)?|RECEIPT)\s*(?:NR\.?|NO\.?|#)\s*[:.]?\s*([A-Z0-9/-]{2,30})/i);
    if (match && !/KORTEL|TERMINAL|BANK/i.test(line)) { referenceNumber = candidate(match[1], line); break; }
  }
  let receiptTotal: Candidate<number> | null = null;
  const products: ProductCandidate[] = [];
  const nonEuro = hasNonEuroCurrencyMarker(rawText);
  if (nonEuro) warnings.push("Čekyje aptikta kita valiuta; EUR sumos nesiūlomos.");
  const discount = lines.some((line) => /NUOLAID|SUTAUP|DISCOUNT/i.test(line));
  if (discount) warnings.push("Čekyje yra nuolaida; galutinę pasirinktos prekės kainą įveskite patys.");
  const refund = /\b(?:GRĄŽINIMAS|REFUND|RETURN)\b/i.test(rawText);
  if (refund) warnings.push("Gali būti grąžinimo čekis; patikrinkite sumas.");
  for (const line of lines) {
    const amounts = [...line.matchAll(amountPattern)];
    const totalLine = /\b(?:IŠ VISO|VISO MOKĖTI|BENDRA SUMA|TOTAL)\b/i.test(line);
    if (totalLine && !nonEuro && !refund && amounts.length === 1) {
      const cents = parseEuroCents(amounts[0][0]);
      if (cents !== null) receiptTotal = candidate(cents, line);
      continue;
    }
    if (excludedProduct.test(line) || line === seller?.source || amounts.length === 0 || !/\p{L}/u.test(line) || /^\d{4}[.-]\d{2}/.test(line)) continue;
    const name = line.replace(amountPattern, "").replace(/\s{2,}/g, " ").trim();
    if (name.length < 3 || name.length > 120 || products.length >= 20) continue;
    const ambiguous = /(?:\b\d+\s*(?:VNT|X|KG)\b|NUOLAID|[-−]\s*\d)/i.test(line) || amounts.length !== 1 || refund || nonEuro || discount;
    products.push({ name, amountCents: ambiguous ? null : parseEuroCents(amounts[0][0]), source: line,
      warning: ambiguous ? "Kiekis, nuolaida arba suma neaiški; kainą patikrinkite patys." : undefined });
  }
  if (!products.length) warnings.push("Prekės neatpažintos; įveskite vieną prekę patys.");
  if (products.some((product) => product.warning)) warnings.push("Kai kurių prekių kainos neaiškios.");
  return { seller, purchaseDate, referenceNumber, products, receiptTotal, warnings, rawText };
}
