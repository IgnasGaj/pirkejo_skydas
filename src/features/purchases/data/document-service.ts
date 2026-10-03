import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createPurchaseDocument, deletePurchaseDocumentRow, deletePurchaseRow, listPurchaseDocuments } from "./purchases";
import type { PurchaseDocument } from "../domain/types";
import type { Database, Insert } from "@/lib/supabase/database.types";

export async function saveDocument(client: SupabaseClient<Database>, document: Insert<"purchase_documents">, file: File) {
  const storage = client.storage.from("purchase-evidence");
  const documentId = document.id ?? crypto.randomUUID();
  // Reserve metadata before Storage upload, so purchase deletion can see an
  // in-flight path and block new claims through the database guard.
  await createPurchaseDocument(client, { ...document, id: documentId, upload_state: "PENDING" });
  try {
    const uploaded = await storage.upload(document.storage_path, file, { contentType: file.type, upsert: false });
    if (uploaded.error) throw uploaded.error;
    const { data, error } = await client.from("purchase_documents").update({ upload_state: "READY" })
      .eq("id", documentId).eq("user_id", document.user_id).eq("upload_state", "PENDING").select("id").maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Upload claim changed");
  } catch (error) {
    const cleanup = await storage.remove([document.storage_path]);
    const removed = await client.from("purchase_documents").delete().eq("id", documentId).eq("user_id", document.user_id).eq("upload_state", "PENDING");
    if (cleanup.error || removed.error) throw new AggregateError([error, cleanup.error, removed.error].filter(Boolean), "Document upload cleanup failed");
    throw error;
  }
}

export async function removeDocument(client: SupabaseClient<Database>, userId: string, document: PurchaseDocument) {
  const { error: markError } = await client.from("purchase_documents").update({ upload_state: "DELETING" }).eq("id", document.id).eq("user_id", userId).in("upload_state", ["PENDING", "READY", "DELETING"]);
  if (markError) throw markError;
  const { error } = await client.storage.from("purchase-evidence").remove([document.storage_path]);
  if (error) throw error;
  await deletePurchaseDocumentRow(client, userId, document.id);
}

export async function removePurchaseAndEvidence(client: SupabaseClient<Database>, userId: string, purchaseId: string) {
  const { error: markError } = await client.from("purchases").update({ deletion_state: "DELETING" }).eq("id", purchaseId).eq("user_id", userId);
  if (markError) throw markError;
  const documents = await listPurchaseDocuments(client, userId, purchaseId, true);
  if (documents.length) {
    const { error } = await client.storage.from("purchase-evidence").remove(documents.map((document) => document.storage_path));
    if (error) throw error;
  }
  await deletePurchaseRow(client, userId, purchaseId);
}
