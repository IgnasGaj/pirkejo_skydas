"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePurchaseUser } from "@/features/purchases/data/auth";
import { createPurchase, getPurchaseById, getPurchaseDocument, updatePurchaseIfCurrent } from "@/features/purchases/data/purchases";
import { saveDocument } from "@/features/purchases/data/document-service";
import { documentMetadataSchema, extensionForMime, purchaseSchema, validateDocumentFile, verifyFileSignature } from "@/features/purchases/domain/validation";
import type { PurchaseFormState } from "@/features/purchases/data/actions";
import { saveAttempt } from "../domain/saveAttempt";
import { correctionFields, selectedCorrectionInput, type CorrectionField, type CorrectionValues } from "../domain/corrections";

const fields = ["productName", "sellerName", "purchaseDate", "receivedDate", "purchaseChannel", "price", "referenceNumber", "notes"];
function values(form: FormData) { return Object.fromEntries(fields.map((key) => [key, String(form.get(key) ?? "")])); }
function errorState(form: FormData, error: string, purchaseId?: string): PurchaseFormState {
  return { error, values: values(form), savedPurchaseId: purchaseId };
}
function refresh(id: string) {
  revalidatePath("/"); revalidatePath("/purchases"); revalidatePath(`/purchases/${id}`);
}

export async function saveReviewedPurchase(previous: PurchaseFormState, form: FormData): Promise<PurchaseFormState> {
  const user = await requirePurchaseUser("/purchases/new");
  const id = String(form.get("draftId") ?? "");
  const documentId = String(form.get("documentId") ?? "");
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(documentId).success) return errorState(form, "Atnaujinkite puslapį ir bandykite dar kartą.");
  const wantsReceipt = form.get("withReceipt") === "1";
  const file = form.getAll("receipt").find((entry) => entry instanceof File && entry.size > 0);
  if (wantsReceipt && (!(file instanceof File) || file.size === 0)) {
    return errorState(form, "Pasirinkite čekio failą. Jei puslapį atnaujinote, pasirinkite jį iš naujo.", previous.savedPurchaseId);
  }
  if (wantsReceipt && file instanceof File) {
    const meta = documentMetadataSchema.safeParse({ purchaseId: id, documentType: "RECEIPT", originalFilename: file.name, mimeType: file.type, sizeBytes: file.size });
    if (validateDocumentFile(file) || !meta.success || !await verifyFileSignature(file)) return errorState(form, "Čekio failas netinkamas arba didesnis nei 15 MB.", previous.savedPurchaseId);
  }
  const client = await createClient();
  let existing;
  try { existing = await getPurchaseById(client, user.id, id); }
  catch (error) {
    console.error("Reviewed purchase lookup failed", error);
    return errorState(form, "Nepavyko patikrinti pirkinio. Bandykite dar kartą.");
  }
  const confirmed = existing ? {
    productName: existing.product_name, sellerName: existing.seller_name, purchaseDate: existing.purchase_date,
    receivedDate: existing.received_date ?? "", purchaseChannel: existing.purchase_channel,
    price: existing.price_cents == null ? "" : (existing.price_cents / 100).toFixed(2),
    referenceNumber: existing.reference_number ?? "", notes: existing.notes ?? ""
  } : values(form);
  const parsed = purchaseSchema.safeParse(confirmed);
  if (!parsed.success) return errorState(form, "Patikrinkite įvestus duomenis ir bandykite dar kartą.", existing?.id);
  const path = file instanceof File ? `${user.id}/${id}/${documentId}.${extensionForMime(file.type)}` : "";
  let outcome;
  try {
    const storage = client.storage.from("purchase-evidence");
    outcome = await saveAttempt({
      findPurchase: () => getPurchaseById(client, user.id, id),
      createPurchase: () => createPurchase(client, user.id, parsed.data, id),
      findDocument: async () => {
        const row = await getPurchaseDocument(client, user.id, id, documentId);
        return row ? { path: row.storage_path, size: row.size_bytes, mime: row.mime_type, filename: row.original_filename } : null;
      },
      inspectObject: async () => {
        const { data } = await storage.info(path);
        return data ? { size: data.size ?? -1, mime: data.contentType ?? "" } : null;
      },
      removeOrphan: async () => { const { error } = await storage.remove([path]); if (error) throw error; },
      uploadReceipt: async () => {
        if (!(file instanceof File)) throw new Error("Missing receipt");
        await saveDocument(client, { id: documentId, user_id: user.id, purchase_id: id, document_type: "RECEIPT",
          original_filename: file.name, storage_path: path, mime_type: file.type, size_bytes: file.size }, file);
      }
    }, wantsReceipt && file instanceof File ? { path, size: file.size, mime: file.type, filename: file.name } : undefined);
  } catch (error) {
    console.error("Reviewed purchase save failed", error);
    return errorState(form, "Nepavyko išsaugoti pirkinio. Bandykite dar kartą.");
  }
  refresh(id);
  if (outcome.partialError) {
    console.error("Reviewed receipt attachment failed", outcome.partialError);
    return errorState(form, "Pirkinys išsaugotas, tačiau čekio įkelti nepavyko.", id);
  }
  refresh(id);
  redirect(`/purchases/${id}?state=created`);
}

export type CorrectionState = { error: string | null; values?: Record<string, string> };

export async function applyReceiptCorrections(purchaseId: string, documentId: string, previous: CorrectionState, form: FormData): Promise<CorrectionState> {
  const user = await requirePurchaseUser(`/purchases/${purchaseId}`);
  const values = Object.fromEntries(correctionFields.map((key) => [key, String(form.get(key) ?? "")])) as CorrectionValues;
  const fail = (error: string) => ({ error, values });
  if (!z.uuid().safeParse(purchaseId).success || !z.uuid().safeParse(documentId).success) return fail("Čekis nepasiekiamas.");
  const selected = form.getAll("apply").map(String);
  if (!selected.length) return fail("Pasirinkite bent vieną pakeitimą.");
  if (selected.some((key) => !correctionFields.includes(key as CorrectionField))) return fail("Pasirinkti pakeitimai netinkami.");
  const client = await createClient();
  try {
    const [purchase, document] = await Promise.all([
      getPurchaseById(client, user.id, purchaseId), getPurchaseDocument(client, user.id, purchaseId, documentId)
    ]);
    if (!purchase || !document || document.document_type !== "RECEIPT" || !["image/jpeg", "image/png", "image/webp"].includes(document.mime_type)) return fail("Čekis nepasiekiamas.");
    if (purchase.updated_at !== form.get("updatedAt")) return fail("Pirkinys buvo pakeistas kitur. Atnaujinkite puslapį ir peržiūrėkite duomenis iš naujo.");
    const input = selectedCorrectionInput(purchase, selected as CorrectionField[], values);
    const parsed = purchaseSchema.safeParse(input);
    if (!parsed.success) return fail("Patikrinkite pasirinktus pakeitimus.");
    const updated = await updatePurchaseIfCurrent(client, user.id, purchaseId, purchase.updated_at, parsed.data);
    if (!updated) return fail("Pirkinys buvo pakeistas kitur. Atnaujinkite puslapį ir peržiūrėkite duomenis iš naujo.");
  } catch (error) {
    console.error("Receipt corrections failed", error);
    return fail("Nepavyko išsaugoti pakeitimų. Bandykite dar kartą.");
  }
  refresh(purchaseId);
  redirect(`/purchases/${purchaseId}?state=updated`);
}
