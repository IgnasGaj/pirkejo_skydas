import type { Purchase } from "@/features/purchases/domain/types";

export const correctionFields = ["productName", "sellerName", "purchaseDate", "price", "referenceNumber"] as const;
export type CorrectionField = typeof correctionFields[number];
export type CorrectionValues = Record<CorrectionField, string>;

export function selectedCorrectionInput(purchase: Purchase, selected: CorrectionField[], proposed: CorrectionValues) {
  const pick = (field: CorrectionField, current: string) => selected.includes(field) ? proposed[field] : current;
  return {
    productName: pick("productName", purchase.product_name),
    sellerName: pick("sellerName", purchase.seller_name),
    purchaseDate: pick("purchaseDate", purchase.purchase_date),
    price: pick("price", purchase.price_cents == null ? "" : (purchase.price_cents / 100).toFixed(2)),
    referenceNumber: pick("referenceNumber", purchase.reference_number ?? ""),
    receivedDate: purchase.received_date ?? "", purchaseChannel: purchase.purchase_channel,
    notes: purchase.notes ?? ""
  };
}
