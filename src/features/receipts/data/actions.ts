"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePurchaseUser } from "@/features/purchases/data/auth";
import { createPurchase, getPurchaseById, getPurchaseDocument, updatePurchaseIfCurrent } from "@/features/purchases/data/purchases";
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
  const sha256 = file instanceof File ? [...new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()))]
    .map((byte) => byte.toString(16).padStart(2, "0")).join("") : "";
  const claimToken = crypto.randomUUID();
  let outcome;
  try {
    const storage = client.storage.from("purchase-evidence");
    outcome = await saveAttempt({
      findPurchase: () => getPurchaseById(client, user.id, id),
      createPurchase: () => createPurchase(client, user.id, parsed.data, id),
      claimDocument: async () => {
        if (!(file instanceof File)) throw new Error("Missing receipt");
        const { data, error } = await client.rpc("claim_reviewed_receipt", {
          p_purchase_id: id, p_document_id: documentId, p_path: path, p_filename: file.name,
          p_mime: file.type, p_size: file.size, p_sha256: sha256, p_token: claimToken
        });
        if (error) throw error;
        if (!["CLAIMED", "PENDING", "READY", "CONFLICT", "UNAVAILABLE"].includes(data)) throw new Error("Unexpected receipt claim result");
        return data as "CLAIMED" | "PENDING" | "READY" | "CONFLICT" | "UNAVAILABLE";
      },
      verifyObject: async () => {
        if (!(file instanceof File)) return false;
        const { data, error } = await storage.download(path);
        if (error || !data || data.size !== file.size || data.type !== file.type) return false;
        const actual = [...new Uint8Array(await crypto.subtle.digest("SHA-256", await data.arrayBuffer()))]
          .map((byte) => byte.toString(16).padStart(2, "0")).join("");
        return actual === sha256;
      },
      uploadReceipt: async () => {
        if (!(file instanceof File)) throw new Error("Missing receipt");
        const { error } = await storage.upload(path, file, { contentType: file.type, upsert: false });
        if (error) throw error;
      },
      finishDocument: async () => {
        const { data, error } = await client.from("purchase_documents").update({ upload_state: "READY", upload_claim_token: null,
          upload_claim_expires_at: null }).eq("user_id", user.id).eq("purchase_id", id).eq("id", documentId)
          .eq("upload_state", "PENDING").eq("upload_claim_token", claimToken).select("id").maybeSingle();
        if (error) throw error;
        if (!data) throw new Error("Receipt upload claim changed");
      },
      releaseClaim: async () => {
        const { error } = await client.from("purchase_documents").update({ upload_claim_expires_at: new Date(0).toISOString() })
          .eq("user_id", user.id).eq("purchase_id", id).eq("id", documentId)
          .eq("upload_state", "PENDING").eq("upload_claim_token", claimToken);
        if (error) throw error;
      }
    }, wantsReceipt && file instanceof File);
  } catch (error) {
    console.error("Reviewed purchase save failed", error);
    return errorState(form, "Nepavyko išsaugoti pirkinio. Bandykite dar kartą.");
  }
  refresh(id);
  if (outcome.partialError) {
    console.error("Reviewed receipt attachment failed", outcome.partialError);
    return errorState(form, outcome.partialError instanceof Error && outcome.partialError.message === "Receipt upload in progress; retry later"
      ? "Pirkinys išsaugotas. Čekis dar įkeliamas kitame lange; palaukite ir bandykite dar kartą."
      : "Pirkinys išsaugotas, tačiau čekio įkelti nepavyko.", id);
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
