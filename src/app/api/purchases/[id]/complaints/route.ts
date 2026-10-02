import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "node:crypto";
import { z } from "zod";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import { getPurchaseById, listPurchaseDocuments } from "@/features/purchases/data/purchases";
import { todayInVilnius } from "@/lib/date";
import { decide, familySchema, renderLetter, requestSchema, selectEvidence, SOURCE_VERSION, TEMPLATE_VERSION, validateReviewed } from "@/features/complaints/domain";

export const dynamic = "force-dynamic";
const bodySchema = z.object({
  operation: z.enum(["save", "generate", "delete"]), complaintId: z.uuid().optional(),
  requestId: z.uuid(), expectedVersion: z.number().int().positive().optional(),
  family: familySchema.optional(), answers: z.unknown().optional(), facts: z.unknown().optional(), remedy: requestSchema.optional()
});
const headers = { "Cache-Control": "private, no-store" };
const errorResponse = (message: string, status = 400) => NextResponse.json({ error: message }, { status, headers });
const asJson = (value: unknown): Json => JSON.parse(JSON.stringify(value)) as Json;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return errorResponse("Pirkinys nerastas.", 404);
  const user = await getAuthenticatedUser();
  if (!user) return errorResponse("Prisijunkite ir pakartokite veiksmą. Neišsaugotus duomenis gali tekti įvesti iš naujo.", 401);
  const payload = bodySchema.safeParse(await request.json().catch(() => null));
  if (!payload.success) return errorResponse("Patikrinkite pateiktus duomenis.");
  const client = await createClient();
  const purchase = await getPurchaseById(client, user.id, id);
  if (!purchase) return errorResponse("Pirkinys nerastas.", 404);
  const input = payload.data;
  try {
    if (input.operation === "delete") {
      if (!input.complaintId) return errorResponse("Dokumentas nerastas.", 404);
      const { data, error } = await client.from("complaints").delete().eq("id", input.complaintId).eq("purchase_id", id).eq("user_id", user.id).select("id").maybeSingle();
      if (error) throw error;
      return data ? NextResponse.json({ deleted: true }, { headers }) : errorResponse("Dokumentas nerastas.", 404);
    }
    const today = todayInVilnius();
    if (input.operation === "save") {
      if (!input.family || !input.remedy) return errorResponse("Pakartokite teisinę patikrą.");
      const evaluated = decide(input.family, input.answers, today);
      if (!evaluated) return errorResponse("Pakartokite teisinę patikrą.");
      const facts = validateReviewed(input.family, evaluated.answers, evaluated.decision, input.remedy, input.facts, purchase, today);
      const documents = await listPurchaseDocuments(client, user.id, id);
      selectEvidence(facts.evidenceIds, documents);
      const values = { family: input.family, answers: asJson(evaluated.answers), facts: asJson(facts), remedy: input.remedy, purchase_updated_at: purchase.updated_at, template_version: TEMPLATE_VERSION, source_version: SOURCE_VERSION };
      if (input.complaintId) {
        if (!input.expectedVersion) return errorResponse("Juodraštis pasikeitė. Atnaujinkite puslapį.", 409);
        const { data, error } = await client.from("complaints").update(values).eq("id", input.complaintId).eq("purchase_id", id).eq("user_id", user.id).eq("draft_version", input.expectedVersion).eq("purchase_updated_at", purchase.updated_at).select("id,draft_version").maybeSingle();
        if (error) throw error;
        return data ? NextResponse.json(data, { headers }) : errorResponse("Juodraštis arba pirkinys pasikeitė. Atnaujinkite puslapį ir patikrinkite duomenis.", 409);
      }
      const { data, error } = await client.from("complaints").insert({ ...values, user_id: user.id, purchase_id: id, request_id: input.requestId }).select("id,draft_version").single();
      if (!error) return NextResponse.json(data, { headers });
      if (error.code === "23505") {
        const retry = await client.from("complaints").select("id,draft_version").eq("user_id", user.id).eq("request_id", input.requestId).eq("purchase_id", id).maybeSingle();
        if (retry.data) return NextResponse.json(retry.data, { headers });
      }
      throw error;
    }
    if (!input.complaintId || !input.expectedVersion) return errorResponse("Juodraštis nerastas.", 404);
    const { data: draft, error: draftError } = await client.from("complaints").select("*").eq("id", input.complaintId).eq("purchase_id", id).eq("user_id", user.id).maybeSingle();
    if (draftError) throw draftError;
    if (!draft) return errorResponse("Juodraštis nerastas.", 404);
    const evaluated = decide(draft.family, draft.answers, today);
    if (!evaluated) return errorResponse("Pakartokite teisinę patikrą.");
    const remedy = requestSchema.parse(draft.remedy);
    const facts = validateReviewed(draft.family, evaluated.answers, evaluated.decision, remedy, draft.facts, purchase, today);
    const documents = await listPurchaseDocuments(client, user.id, id);
    const evidence = selectEvidence(facts.evidenceIds, documents);
    for (const item of evidence) {
      const document = documents.find((row) => row.id === item.id)!;
      const { error } = await client.storage.from("purchase-evidence").info(document.storage_path);
      if (error) return errorResponse("Pasirinktas priedas nepasiekiamas. Peržiūrėkite priedus iš naujo.", 409);
    }
    const letter = renderLetter(draft.family, remedy, facts, evidence);
    const snapshot = { purchase: { id: purchase.id, updated_at: purchase.updated_at, product_name: purchase.product_name, seller_name: purchase.seller_name, purchase_date: purchase.purchase_date, received_date: purchase.received_date, purchase_channel: purchase.purchase_channel, price_cents: purchase.price_cents }, facts, answers: evaluated.answers, decision: { code: evaluated.decision.code, rulesTriggered: evaluated.decision.rulesTriggered }, remedy, evidence };
    const key = process.env.COMPLAINT_SIGNING_KEY;
    if (!key || key.length < 32) return errorResponse("Dokumentų rengimas šiuo metu nepasiekiamas.", 503);
    const payloadText = JSON.stringify({
      complaintId: draft.id, requestId: input.requestId, expectedVersion: input.expectedVersion,
      purchaseUpdatedAt: purchase.updated_at, evidenceIds: facts.evidenceIds,
      documentDate: facts.documentDate, snapshot, sections: letter.sections, plainText: letter.text,
      templateVersion: TEMPLATE_VERSION, sourceVersion: SOURCE_VERSION
    });
    const signature = createHmac("sha256", key).update(payloadText, "utf8").digest("hex");
    const { data: version, error } = await client.rpc("generate_signed_complaint_version", { p_payload: payloadText, p_signature: signature });
    if (error) return errorResponse("Pirkinys, juodraštis arba priedai pasikeitė. Atnaujinkite puslapį ir peržiūrėkite duomenis.", 409);
    return NextResponse.json({ id: version.id, version_no: version.version_no }, { headers });
  } catch {
    return errorResponse("Nepavyko atlikti veiksmo. Patikrinkite duomenis ir bandykite dar kartą.", 400);
  }
}
