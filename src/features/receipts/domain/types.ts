export type Candidate<T> = { value: T; source: string };
export type ProductCandidate = { name: string; amountCents: number | null; source: string; warning?: string };
export type ReceiptSuggestions = {
  seller: Candidate<string> | null;
  purchaseDate: Candidate<string> | null;
  referenceNumber: Candidate<string> | null;
  products: ProductCandidate[];
  receiptTotal: Candidate<number> | null;
  warnings: string[];
  rawText: string;
};
