"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePurchaseUser } from "./auth";
import { createPurchase, getPurchaseById, getPurchaseDocument, updatePurchase } from "./purchases";
import { removeDocument, removePurchaseAndEvidence, saveDocument } from "./document-service";
import { documentMetadataSchema, extensionForMime, purchaseSchema, validateDocumentFile, verifyFileSignature } from "../domain/validation";
import type { Purchase, PurchaseDocument } from "../domain/types";

function purchaseInput(form: FormData) {
  return purchaseSchema.safeParse({
    productName: form.get("productName"), sellerName: form.get("sellerName"),
    purchaseDate: form.get("purchaseDate"), receivedDate: form.get("receivedDate") ?? "",
    purchaseChannel: form.get("purchaseChannel"), price: form.get("price") ?? "",
    referenceNumber: form.get("referenceNumber") ?? "", notes: form.get("notes") ?? ""
  });
}
function validId(id: string) { return z.uuid().safeParse(id).success; }
function failure(path: string, kind: string): never { redirect(`${path}${path.includes("?") ? "&" : "?"}state=${kind}`); }

export type PurchaseFormState = { error: string | null; values?: Record<string, string>; attempt?: number; savedPurchaseId?: string };

function failedForm(previous: PurchaseFormState, form: FormData, error: string): PurchaseFormState {
  const fields = ["productName", "sellerName", "purchaseDate", "receivedDate", "purchaseChannel", "price", "referenceNumber", "notes"];
  return {
    error,
    attempt: (previous.attempt ?? 0) + 1,
    values: Object.fromEntries(fields.map((field) => [field, String(form.get(field) ?? "")]))
  };
}

export async function createPurchaseAction(previous: PurchaseFormState, form: FormData): Promise<PurchaseFormState> {
  const user = await requirePurchaseUser("/purchases/new");
  const input = purchaseInput(form);
  if (!input.success) return failedForm(previous, form, "Patikrinkite įvestus duomenis ir bandykite dar kartą.");
  let purchase: Purchase;
  try {
    const client = await createClient();
    purchase = await createPurchase(client, user.id, input.data);
  } catch (error) {
    console.error("Purchase creation failed", error);
    return failedForm(previous, form, "Nepavyko išsaugoti pirkinio. Bandykite dar kartą.");
  }
  revalidatePath("/purchases");
  redirect(`/purchases/${purchase.id}?state=created`);
}

export async function editPurchaseAction(id: string, previous: PurchaseFormState, form: FormData): Promise<PurchaseFormState> {
  const user = await requirePurchaseUser(`/purchases/${id}/edit`);
  if (!validId(id)) failure("/purchases", "missing");
  const input = purchaseInput(form);
  if (!input.success) return failedForm(previous, form, "Patikrinkite įvestus duomenis ir bandykite dar kartą.");
  let purchase: Purchase | null;
  try {
    const client = await createClient();
    purchase = await updatePurchase(client, user.id, id, input.data);
  } catch (error) {
    console.error("Purchase update failed", error);
    return failedForm(previous, form, "Nepavyko išsaugoti pirkinio. Bandykite dar kartą.");
  }
  if (!purchase) failure("/purchases", "missing");
  revalidatePath("/purchases");
  revalidatePath(`/purchases/${id}`);
  redirect(`/purchases/${id}?state=updated`);
}

export async function deletePurchaseAction(id: string) {
  const user = await requirePurchaseUser(`/purchases/${id}`);
  if (!validId(id)) failure("/purchases", "missing");
  const client = await createClient();
  let purchase: Purchase | null;
  try {
    purchase = await getPurchaseById(client, user.id, id);
  } catch (error) {
    console.error("Purchase lookup failed", error);
    failure(`/purchases/${id}`, "delete-error");
  }
  if (!purchase) failure("/purchases", "missing");
  try {
    await removePurchaseAndEvidence(client, user.id, id);
  } catch (error) {
    console.error("Purchase deletion failed", error);
    failure(`/purchases/${id}`, "delete-error");
  }
  revalidatePath("/purchases");
  redirect("/purchases?state=deleted");
}

export async function uploadDocumentAction(id: string, form: FormData) {
  const user = await requirePurchaseUser(`/purchases/${id}`);
  if (!validId(id)) failure("/purchases", "missing");
  const file = form.get("file");
  if (!(file instanceof File)) failure(`/purchases/${id}`, "file-invalid");
  const metadata = documentMetadataSchema.safeParse({
    purchaseId: id, documentType: form.get("documentType"), originalFilename: file.name,
    mimeType: file.type, sizeBytes: file.size
  });
  const fileError = validateDocumentFile(file);
  if (fileError === "too-large") failure(`/purchases/${id}`, "file-too-large");
  if (fileError || !metadata.success || !await verifyFileSignature(file)) failure(`/purchases/${id}`, "file-invalid");
  const client = await createClient();
  let purchase: Purchase | null;
  try {
    purchase = await getPurchaseById(client, user.id, id);
  } catch (error) {
    console.error("Purchase lookup failed", error);
    failure(`/purchases/${id}`, "upload-error");
  }
  if (!purchase) failure("/purchases", "missing");
  try {
    const path = `${user.id}/${id}/${crypto.randomUUID()}.${extensionForMime(file.type)}`;
    await saveDocument(client, {
      user_id: user.id, purchase_id: id, document_type: metadata.data.documentType,
      original_filename: file.name, storage_path: path, mime_type: file.type, size_bytes: file.size
    }, file);
  } catch (error) {
    console.error("Document upload failed", error);
    failure(`/purchases/${id}`, "upload-error");
  }
  revalidatePath(`/purchases/${id}`);
  redirect(`/purchases/${id}?state=uploaded`);
}

export async function deleteDocumentAction(purchaseId: string, documentId: string) {
  const user = await requirePurchaseUser(`/purchases/${purchaseId}`);
  if (!validId(purchaseId) || !validId(documentId)) failure("/purchases", "missing");
  const client = await createClient();
  let document: PurchaseDocument | null;
  try {
    document = await getPurchaseDocument(client, user.id, purchaseId, documentId);
  } catch (error) {
    console.error("Document lookup failed", error);
    failure(`/purchases/${purchaseId}`, "delete-file-error");
  }
  if (!document) failure("/purchases", "missing");
  try {
    await removeDocument(client, user.id, document);
  } catch (error) {
    console.error("Document deletion failed", error);
    failure(`/purchases/${purchaseId}`, "delete-file-error");
  }
  revalidatePath(`/purchases/${purchaseId}`);
  redirect(`/purchases/${purchaseId}?state=file-deleted`);
}
