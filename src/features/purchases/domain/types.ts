export const purchaseChannels = ["PHYSICAL_STORE", "DISTANCE", "UNKNOWN"] as const;
export type PurchaseChannel = typeof purchaseChannels[number];
export const documentTypes = ["RECEIPT", "INVOICE", "ORDER_CONFIRMATION", "WARRANTY_DOCUMENT", "OTHER"] as const;
export type DocumentType = typeof documentTypes[number];

export type Purchase = Row<"purchases">;
export type PurchaseDocument = Row<"purchase_documents">;

export const channelLabels: Record<PurchaseChannel, string> = {
  PHYSICAL_STORE: "Fizinėje parduotuvėje", DISTANCE: "Internetu", UNKNOWN: "Nežinau"
};
export const documentLabels: Record<DocumentType, string> = {
  RECEIPT: "Čekis", INVOICE: "Sąskaita faktūra", ORDER_CONFIRMATION: "Užsakymo patvirtinimas",
  WARRANTY_DOCUMENT: "Garantijos dokumentas", OTHER: "Kitas pirkimo įrodymas"
};
import type { Row } from "@/lib/supabase/database.types";
