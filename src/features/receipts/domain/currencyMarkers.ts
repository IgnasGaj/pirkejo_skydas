// Curated ISO 4217 currency codes from SIX List One, checked 2026-10-02.
// BGN is retained from SIX List Three because older receipts can still use it.
// This is a receipt safety list, not a catalog for conversion or persistence.
// https://www.six-group.com/en/products-services/financial-information/market-reference-data/data-standards.html
const nonEuroCodes = new Set([
  "AED", "AFN", "AMD", "ARS", "AUD", "AZN", "BAM", "BDT", "BGN",
  "BHD", "BRL", "BYN", "CAD", "CHF", "CLP", "CNY", "COP", "CZK",
  "DKK", "EGP", "GBP", "HKD", "HUF", "IDR", "ILS", "INR",
  "ISK", "JPY", "KRW", "KWD", "KZT", "MAD", "MDL", "MXN", "MYR",
  "NOK", "NZD", "PHP", "PKR", "PLN", "RON", "RSD", "RUB", "SAR",
  "SEK", "SGD", "THB", "TRY", "TWD", "UAH", "USD", "VND", "ZAR"
]);

const symbols = /[$£¥￥₹₽₴₺₩₪₫₱₦]|(?<!\p{L})zł(?!\p{L})/iu;
const amount = /(?:\d{1,3}(?:[ \u00a0]\d{3})+|\d{1,9})[,.]\d{2}/g;
const word = /[A-Za-z]{3}/g;
const ordinarySuffixes = new Set(["EUR", "PVM", "VAT", "VNT", "PCS", "KGS", "KOD", "REF", "NRR"]);
const currencyLabel = /(?:^|[^\p{L}])(?:VALIUTA|CURRENCY|CURR\.?)\s*[:=]?\s*$/iu;
const markerGap = /^[\s\u00a0:().,\[\]\/\-]*$/;

function isolated(line: string, start: number, end: number) {
  return !/\p{L}/u.test(line[start - 1] ?? "") && !/\p{L}/u.test(line[end] ?? "");
}

function nearby(line: string, start: number, end: number, amounts: RegExpMatchArray[]) {
  return amounts.some((match) => {
    const amountStart = match.index ?? 0;
    const amountEnd = amountStart + match[0].length;
    const gap = end <= amountStart ? line.slice(end, amountStart) :
      amountEnd <= start ? line.slice(amountEnd, start) : null;
    return gap !== null && gap.length <= 6 && markerGap.test(gap);
  });
}

/** True means that OCR must not offer any extracted amount as EUR. */
export function hasNonEuroCurrencyMarker(text: string): boolean {
  const lines = text.slice(0, 20_000).split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 250);
  for (const [index, line] of lines.entries()) {
    const standaloneCode = line.match(/^[\[(:\s]*([A-Za-z]{3})[\]):.\s]*$/)?.[1]?.toUpperCase();
    if (standaloneCode && nonEuroCodes.has(standaloneCode) &&
      lines.slice(Math.max(0, index - 3), Math.min(lines.length, index + 4)).some((nearLine, offset) =>
        offset + Math.max(0, index - 3) !== index && [...nearLine.matchAll(amount)].length > 0)) return true;
    if (symbols.test(line)) return true;
    const amounts = [...line.matchAll(amount)];
    for (const match of line.matchAll(word)) {
      const start = match.index ?? 0;
      const end = start + match[0].length;
      if (!isolated(line, start, end)) continue;
      const code = match[0].toUpperCase();
      if (code === "EUR") continue;
      const labelled = currencyLabel.test(line.slice(0, start));
      if (nonEuroCodes.has(code) && (nearby(line, start, end, amounts) || labelled)) return true;
      // Unknown uppercase suffixes attached to amounts are unresolved currency
      // evidence. Exclude ordinary tax and unit abbreviations; never infer EUR.
      if (labelled || (match[0] === code && !ordinarySuffixes.has(code) &&
        amounts.some((value) => {
          const amountEnd = (value.index ?? 0) + value[0].length;
          const gap = line.slice(amountEnd, start);
          return amountEnd <= start && gap.length <= 6 && markerGap.test(gap) && markerGap.test(line.slice(end));
        }))) return true;
    }
  }
  return false;
}
