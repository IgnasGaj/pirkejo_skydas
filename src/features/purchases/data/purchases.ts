import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Purchase, PurchaseDocument } from "../domain/types";
import type { PurchaseInput } from "../domain/validation";

type Client = SupabaseClient;
const columns = "id,user_id,product_name,seller_name,purchase_date,received_date,purchase_channel,price_cents,currency,reference_number,notes,created_at,updated_at";

export async function listPurchases(client: Client, userId: string): Promise<Purchase[]> {
  const { data, error } = await client.from("purchases").select(columns).eq("user_id", userId).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Purchase[];
}

export async function getPurchaseById(client: Client, userId: string, id: string): Promise<Purchase | null> {
  const { data, error } = await client.from("purchases").select(columns).eq("user_id", userId).eq("id", id).maybeSingle();
  if (error) throw error;
  return data as Purchase | null;
}

function fields(input: PurchaseInput) {
  return {
    product_name: input.productName, seller_name: input.sellerName, purchase_date: input.purchaseDate,
    received_date: input.purchaseChannel === "DISTANCE" ? input.receivedDate : null,
    purchase_channel: input.purchaseChannel, price_cents: input.price, currency: "EUR",
    reference_number: input.referenceNumber, notes: input.notes
  };
}

export async function createPurchase(client: Client, userId: string, input: PurchaseInput): Promise<Purchase> {
  const { data, error } = await client.from("purchases").insert({ ...fields(input), user_id: userId }).select(columns).single();
  if (error) throw error;
  return data as Purchase;
}

export async function updatePurchase(client: Client, userId: string, id: string, input: PurchaseInput): Promise<Purchase | null> {
  const { data, error } = await client.from("purchases").update(fields(input)).eq("user_id", userId).eq("id", id).select(columns).maybeSingle();
  if (error) throw error;
  return data as Purchase | null;
}

export async function deletePurchaseRow(client: Client, userId: string, id: string) {
  const { error } = await client.from("purchases").delete().eq("user_id", userId).eq("id", id);
  if (error) throw error;
}

export async function listPurchaseDocuments(client: Client, userId: string, purchaseId: string): Promise<PurchaseDocument[]> {
  const { data, error } = await client.from("purchase_documents").select("*").eq("user_id", userId).eq("purchase_id", purchaseId).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PurchaseDocument[];
}

export async function getPurchaseDocument(client: Client, userId: string, purchaseId: string, documentId: string): Promise<PurchaseDocument | null> {
  const { data, error } = await client.from("purchase_documents").select("*").eq("user_id", userId).eq("purchase_id", purchaseId).eq("id", documentId).maybeSingle();
  if (error) throw error;
  return data as PurchaseDocument | null;
}

export async function createPurchaseDocument(client: Client, document: Omit<PurchaseDocument, "id" | "created_at">) {
  const { error } = await client.from("purchase_documents").insert(document);
  if (error) throw error;
}

export async function deletePurchaseDocumentRow(client: Client, userId: string, id: string) {
  const { error } = await client.from("purchase_documents").delete().eq("user_id", userId).eq("id", id);
  if (error) throw error;
}

export async function createPurchaseDocumentAccessUrl(client: Client, path: string, download = false) {
  const { data, error } = await client.storage.from("purchase-evidence").createSignedUrl(path, 60, download ? { download: true } : undefined);
  if (error) throw error;
  return data.signedUrl;
}
