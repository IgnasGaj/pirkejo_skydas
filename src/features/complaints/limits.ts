export const MAX_PRICE_CENTS = 100_000_000;

export function assertDocumentBudget(label: string, value: unknown, maxBytes: number) {
  // PostgreSQL jsonb::text adds spaces around separators. Leave room for that
  // representation and for future small metadata additions.
  const bytes = new TextEncoder().encode(JSON.stringify(value)).length;
  if (bytes > maxBytes * 0.8) {
    throw new Error(`${label} per ilgi. Sutrumpinkite tekstą ir bandykite dar kartą; įvesti duomenys išliks.`);
  }
}
