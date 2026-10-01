export const purchaseChannels = ["PHYSICAL_STORE", "DISTANCE", "UNKNOWN"] as const;
export type PurchaseChannel = typeof purchaseChannels[number];
export const documentTypes = ["RECEIPT", "INVOICE", "ORDER_CONFIRMATION", "WARRANTY_DOCUMENT", "OTHER"] as const;
export type DocumentType = typeof documentTypes[number];

export type Purchase = {
  id: string; user_id: string; product_name: string; seller_name: string;
  purchase_date: string; received_date: string | null; purchase_channel: PurchaseChannel;
  price_cents: number | null; currency: "EUR"; reference_number: string | null;
  notes: string | null; created_at: string; updated_at: string;
};

export type PurchaseDocument = {
  id: string; user_id: string; purchase_id: string; document_type: DocumentType;
  original_filename: string; storage_path: string; mime_type: string;
  size_bytes: number; created_at: string;
};

export const channelLabels: Record<PurchaseChannel, string> = {
  PHYSICAL_STORE: "Fizinėje parduotuvėje", DISTANCE: "Internetu", UNKNOWN: "Nežinau"
};
export const documentLabels: Record<DocumentType, string> = {
  RECEIPT: "Čekis", INVOICE: "Sąskaita faktūra", ORDER_CONFIRMATION: "Užsakymo patvirtinimas",
  WARRANTY_DOCUMENT: "Garantijos dokumentas", OTHER: "Kitas pirkimo įrodymas"
};
