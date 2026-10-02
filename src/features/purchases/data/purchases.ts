import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Purchase, PurchaseDocument } from "../domain/types";
import type { PurchaseInput } from "../domain/validation";
import type { Database, Insert } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;

export async function listPurchases(client: Client, userId: string, limit?: number): Promise<Purchase[]> {
  let query = client.from("purchases").select("*").eq("user_id", userId)
    .order("created_at", { ascending: false }).order("id", { ascending: false });
  if (limit !== undefined) query = query.limit(limit);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getPurchaseById(client: Client, userId: string, id: string): Promise<Purchase | null> {
  const { data, error } = await client.from("purchases").select("*").eq("user_id", userId).eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

function fields(input: PurchaseInput) {
  return {
    product_name: input.productName, seller_name: input.sellerName, purchase_date: input.purchaseDate,
    received_date: input.purchaseChannel === "DISTANCE" ? input.receivedDate : null,
    purchase_channel: input.purchaseChannel, price_cents: input.price, currency: "EUR" as const,
    reference_number: input.referenceNumber, notes: input.notes
  };
}

export async function createPurchase(client: Client, userId: string, input: PurchaseInput, id?: string): Promise<Purchase> {
  const { data, error } = await client.from("purchases").insert({ ...fields(input), user_id: userId, ...(id ? { id } : {}) }).select("*").single();
  if (error) throw error;
  return data;
}

export async function updatePurchaseIfCurrent(client: Client, userId: string, id: string, updatedAt: string, input: PurchaseInput): Promise<Purchase | null> {
  const { data, error } = await client.from("purchases").update(fields(input)).eq("user_id", userId)
    .eq("id", id).eq("updated_at", updatedAt).select("*").maybeSingle();
  if (error) throw error;
  return data;
}

export async function deletePurchaseRow(client: Client, userId: string, id: string) {
  const { data, error } = await client.from("purchases").delete().eq("user_id", userId).eq("id", id).select("id").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Purchase deletion affected no row");
}

export async function listPurchaseDocuments(client: Client, userId: string, purchaseId: string, includePending = false): Promise<PurchaseDocument[]> {
  let query = client.from("purchase_documents").select("*").eq("user_id", userId).eq("purchase_id", purchaseId);
  if (!includePending) query = query.eq("upload_state", "READY");
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getPurchaseDocument(client: Client, userId: string, purchaseId: string, documentId: string): Promise<PurchaseDocument | null> {
  const { data, error } = await client.from("purchase_documents").select("*").eq("user_id", userId).eq("purchase_id", purchaseId).eq("id", documentId).eq("upload_state", "READY").maybeSingle();
  if (error) throw error;
  return data;
}

export async function createPurchaseDocument(client: Client, document: Insert<"purchase_documents">) {
  const { error } = await client.from("purchase_documents").insert(document);
  if (error) throw error;
}

export async function deletePurchaseDocumentRow(client: Client, userId: string, id: string) {
  const { data, error } = await client.from("purchase_documents").delete().eq("user_id", userId).eq("id", id).select("id").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Document deletion affected no row");
}

export async function purchaseIdsWithEvidence(client: Client, userId: string, purchaseIds: string[]): Promise<Set<string>> {
  if (!purchaseIds.length) return new Set();
  const { data, error } = await client.from("purchase_documents").select("purchase_id")
    .eq("user_id", userId).eq("upload_state", "READY").in("purchase_id", purchaseIds);
  if (error) throw error;
  return new Set((data ?? []).map((document) => document.purchase_id));
}

export async function createPurchaseDocumentAccessUrl(client: Client, path: string, download = false) {
  const { data, error } = await client.storage.from("purchase-evidence").createSignedUrl(path, 60, download ? { download: true } : undefined);
  if (error) throw error;
  return data.signedUrl;
}
