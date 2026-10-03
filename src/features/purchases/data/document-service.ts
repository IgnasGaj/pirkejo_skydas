import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createPurchaseDocument, deletePurchaseDocumentRow, deletePurchaseRow, listPurchaseDocuments } from "./purchases";
import type { PurchaseDocument } from "../domain/types";
import type { Database, Insert } from "@/lib/supabase/database.types";

function uploadClaimActive(document: Pick<PurchaseDocument, "upload_claim_expires_at">) {
  return Boolean(document.upload_claim_expires_at && Date.parse(document.upload_claim_expires_at) > Date.now());
}

export async function saveDocument(client: SupabaseClient<Database>, document: Insert<"purchase_documents">, file: File) {
  const storage = client.storage.from("purchase-evidence");
  const documentId = document.id ?? crypto.randomUUID();
  const claimToken = crypto.randomUUID();
  // Reserve metadata before Storage upload, so purchase deletion can see an
  // in-flight path and block new claims through the database guard.
  await createPurchaseDocument(client, { ...document, id: documentId, upload_state: "PENDING",
    upload_claim_token: claimToken, upload_claim_expires_at: new Date(Date.now() + 15 * 60_000).toISOString() });
  try {
    const uploaded = await storage.upload(document.storage_path, file, { contentType: file.type, upsert: false });
    if (uploaded.error) throw uploaded.error;
    const { data, error } = await client.from("purchase_documents").update({ upload_state: "READY",
      upload_claim_token: null, upload_claim_expires_at: null })
      .eq("id", documentId).eq("user_id", document.user_id).eq("upload_state", "PENDING")
      .eq("upload_claim_token", claimToken).select("id").maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Upload claim changed");
  } catch (error) {
    // A failed or ambiguous READY transition may already have committed. First
    // tombstone either state so it cannot be generated or reclaimed by a late upload.
    const marked = await client.from("purchase_documents").update({ upload_state: "DELETING",
      upload_claim_token: null, upload_claim_expires_at: null })
      .eq("id", documentId).eq("user_id", document.user_id).in("upload_state", ["PENDING", "READY", "DELETING"])
      .select("id").maybeSingle();
    if (marked.error) throw new AggregateError([error, marked.error], "Document upload cleanup failed");
    const cleanup = await storage.remove([document.storage_path]);
    if (cleanup.error) throw new AggregateError([error, cleanup.error], "Document upload cleanup failed");
    if (marked.data) {
      const removed = await client.from("purchase_documents").delete().eq("id", documentId)
        .eq("user_id", document.user_id).eq("upload_state", "DELETING");
      if (removed.error) throw new AggregateError([error, removed.error], "Document upload cleanup failed");
    }
    throw error;
  }
}

export async function removeDocument(client: SupabaseClient<Database>, userId: string, document: PurchaseDocument) {
  const { data: marked, error: markError } = await client.from("purchase_documents").update({ upload_state: "DELETING" })
    .eq("id", document.id).eq("user_id", userId).eq("storage_path", document.storage_path)
    .in("upload_state", ["PENDING", "READY", "DELETING"]).select("storage_path,upload_claim_expires_at").maybeSingle();
  if (markError) throw markError;
  if (!marked) throw new Error("Document deletion affected no owned row");
  const { error } = await client.storage.from("purchase-evidence").remove([marked.storage_path]);
  if (error) throw error;
  // The uploader can still finish after this removal. Its tombstone handler
  // removes late bytes and the row; a crashed uploader leaves a timed retry.
  if (uploadClaimActive(marked)) throw new Error("Document upload still in progress");
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
  if (documents.some(uploadClaimActive)) throw new Error("Document upload still in progress");
  await deletePurchaseRow(client, userId, purchaseId);
}
