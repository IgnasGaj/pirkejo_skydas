import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createPurchaseDocument, deletePurchaseDocumentRow, deletePurchaseRow, listPurchaseDocuments } from "./purchases";
import type { PurchaseDocument } from "../domain/types";
import { uploadDocumentWithCleanup } from "../domain/upload";

export async function saveDocument(client: SupabaseClient, document: Omit<PurchaseDocument, "id" | "created_at">, file: File) {
  const storage = client.storage.from("purchase-evidence");
  await uploadDocumentWithCleanup(storage, () => createPurchaseDocument(client, document), document.storage_path, file);
}

export async function removeDocument(client: SupabaseClient, userId: string, document: PurchaseDocument) {
  const { error } = await client.storage.from("purchase-evidence").remove([document.storage_path]);
  if (error) throw error;
  await deletePurchaseDocumentRow(client, userId, document.id);
}

export async function removePurchaseAndEvidence(client: SupabaseClient, userId: string, purchaseId: string) {
  const documents = await listPurchaseDocuments(client, userId, purchaseId);
  if (documents.length) {
    const { error } = await client.storage.from("purchase-evidence").remove(documents.map((document) => document.storage_path));
    if (error) throw error;
  }
  await deletePurchaseRow(client, userId, purchaseId);
}
