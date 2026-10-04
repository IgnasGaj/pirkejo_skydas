import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "node:crypto";
import { z } from "zod";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import { getPurchaseById, listPurchaseDocuments } from "@/features/purchases/data/purchases";
import { todayInVilnius } from "@/lib/date";
import { decide, familySchema, renderLetter, requestSchema, selectEvidence, SOURCE_VERSION, TEMPLATE_VERSION, validateReviewed } from "@/features/complaints/domain";
import { assertDocumentBudget } from "@/features/complaints/limits";

export const dynamic = "force-dynamic";
const bodySchema = z.object({
  operation: z.enum(["save", "generate", "delete"]), complaintId: z.uuid().optional(),
  requestId: z.uuid(), expectedVersion: z.number().int().positive().optional(), rebind: z.boolean().optional(),
  family: familySchema.optional(), answers: z.unknown().optional(), facts: z.unknown().optional(), remedy: requestSchema.optional()
});
const headers = { "Cache-Control": "private, no-store" };
const errorResponse = (message: string, status = 400, code = status === 401 ? "AUTH_REQUIRED" : status === 404 ? "NOT_FOUND" : status === 409 ? "STALE_REVISION" : status === 503 ? "SERVICE_UNAVAILABLE" : "INVALID_INPUT", details?: Record<string, unknown>) => NextResponse.json({ error: message, code, ...details }, { status, headers });
const asJson = (value: unknown): Json => JSON.parse(JSON.stringify(value)) as Json;
const fieldLabels: Record<string, string> = { consumerName: "vardas ir pavardė", consumerEmail: "el. paštas", sellerName: "pardavėjas", sellerContact: "pardavėjo kontaktas", productName: "prekė", referenceNumber: "užsakymo numeris", defectDescription: "trūkumo aprašymas", reductionExplanation: "sumažinimo pagrindimas", alternativeProof: "kitas įrodymas", priceCents: "kaina", evidenceIds: "priedai" };
class ComplaintInputError extends Error {}
class MissingEvidenceError extends Error {}
function reviewed(...args: Parameters<typeof validateReviewed>) {
  try { return validateReviewed(...args); }
  catch (error) { if (error instanceof z.ZodError) throw error; throw new ComplaintInputError(error instanceof Error ? error.message : "Patikrinkite duomenis."); }
}
function selectedEvidence(...args: Parameters<typeof selectEvidence>) {
  try { return selectEvidence(...args); }
  catch (error) { throw new MissingEvidenceError(error instanceof Error ? error.message : "Pasirinktas priedas nepasiekiamas."); }
}
const canonical = (value: unknown): string => JSON.stringify(value, (_key, item) =>
  item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
function serviceError(error: unknown) {
  const issue = error as { code?: string; message?: string };
  if (issue.code === "PGRST202" || issue.code === "42883" || issue.code === "42P01") return errorResponse("Duomenų bazės pakeitimai dar neįdiegti. Kreipkitės į administratorių.", 503, "MIGRATION_MISSING");
  if (issue.message === "Generation not configured" || issue.message === "Invalid generation signature") return errorResponse("Dokumentų pasirašymo nustatymai nesutampa. Kreipkitės į administratorių.", 503, "SIGNING_UNAVAILABLE");
  if (issue.message?.includes("changed") || issue.message?.includes("Reassessment required") || issue.message?.includes("Save retry differs")) return errorResponse("Juodraštis, pirkinys arba priedai pasikeitė. Įkelkite naujausią versiją ir peržiūrėkite pakeitimus.", 409, "STALE_REVISION");
  if (issue.code === "23514" || issue.message?.includes("size")) return errorResponse("Duomenys per ilgi. Sutrumpinkite tekstą ir bandykite dar kartą.", 400, "SIZE_LIMIT");
  console.error("Complaint operation failed", { code: issue.code ?? "UNKNOWN", kind: error instanceof z.ZodError ? "validation" : "service" });
  return errorResponse("Paslauga šiuo metu nepasiekiama. Įvesti duomenys išliko; bandykite dar kartą.", 503, "SERVICE_UNAVAILABLE");
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) return errorResponse("Pirkinys nerastas.", 404, "NOT_FOUND");
    const user = await getAuthenticatedUser();
    if (!user) return errorResponse("Prisijunkite ir bandykite dar kartą.", 401, "AUTH_REQUIRED");
    const complaintId = request.nextUrl.searchParams.get("complaintId");
    if (!z.uuid().safeParse(complaintId).success) return errorResponse("Juodraštis nerastas.", 404, "NOT_FOUND");
    const client = await createClient();
    const purchase = await getPurchaseById(client, user.id, id);
    if (!purchase) return errorResponse("Pirkinys nerastas.", 404, "NOT_FOUND");
    const { data, error } = await client.from("complaints").select("*").eq("id", complaintId!).eq("purchase_id", id).eq("user_id", user.id).maybeSingle();
    if (error) throw error;
    return data ? NextResponse.json({ draft: data }, { headers }) : errorResponse("Juodraštis nerastas.", 404, "NOT_FOUND");
  } catch (error) { return serviceError(error); }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return errorResponse("Pirkinys nerastas.", 404);
  const user = await getAuthenticatedUser();
  if (!user) return errorResponse("Prisijunkite ir pakartokite veiksmą. Neišsaugotus duomenis gali tekti įvesti iš naujo.", 401);
  const payload = bodySchema.safeParse(await request.json().catch(() => null));
  if (!payload.success) return errorResponse("Patikrinkite pateiktus duomenis.");
  const client = await createClient();
  const purchase = await getPurchaseById(client, user.id, id);
  if (!purchase) return errorResponse("Pirkinys nerastas.", 404);
  if (purchase.deletion_state === "DELETING") return errorResponse("Pirkinys šalinamas. Užbaikite šalinimą pirkinio puslapyje.", 409, "PURCHASE_DELETING");
  const input = payload.data;
    if (input.operation === "delete") {
      if (!input.complaintId) return errorResponse("Dokumentas nerastas.", 404);
      const tracked = await client.from("cases").select("id").eq("complaint_id", input.complaintId).eq("purchase_id", id).eq("user_id", user.id).limit(1);
      if (tracked.error) throw tracked.error;
      if (tracked.data?.length) return errorResponse("Šio dokumento versija susieta su kreipimusi. Pirmiausia aiškiai ištrinkite kreipimosi sekimą.", 409, "TRACKED_DOCUMENT", { caseId: tracked.data[0].id });
      const { data, error } = await client.from("complaints").delete().eq("id", input.complaintId).eq("purchase_id", id).eq("user_id", user.id).select("id").maybeSingle();
      if (error) throw error;
      return data ? NextResponse.json({ deleted: true }, { headers }) : errorResponse("Dokumentas nerastas.", 404);
    }
    const today = todayInVilnius();
    if (input.operation === "save") {
      if (!input.family || !input.remedy) return errorResponse("Pakartokite teisinę patikrą.");
      const evaluated = decide(input.family, input.answers, today);
      if (!evaluated) return errorResponse("Pakartokite teisinę patikrą.");
      const facts = reviewed(input.family, evaluated.answers, evaluated.decision, input.remedy, input.facts, purchase, today);
      assertDocumentBudget("Patikros atsakymai", evaluated.answers, 12000);
      const documents = await listPurchaseDocuments(client, user.id, id);
      selectedEvidence(facts.evidenceIds, documents);
      const values = { family: input.family, answers: asJson(evaluated.answers), facts: asJson(facts), remedy: input.remedy, purchase_updated_at: purchase.updated_at, template_version: TEMPLATE_VERSION, source_version: SOURCE_VERSION };
      if (input.complaintId) {
        if (!input.expectedVersion) return errorResponse("Juodraštis pasikeitė. Atnaujinkite puslapį.", 409);
        const { data, error } = await client.rpc("save_reviewed_complaint", {
          p_complaint_id: input.complaintId, p_expected_version: input.expectedVersion,
          p_purchase_updated_at: purchase.updated_at, p_rebind: input.rebind === true,
          p_request_id: input.requestId, p_family: input.family, p_answers: values.answers,
          p_facts: values.facts, p_remedy: input.remedy, p_template_version: TEMPLATE_VERSION,
          p_source_version: SOURCE_VERSION
        });
        if (error) return serviceError(error);
        return NextResponse.json({ id: data.id, draft_version: data.draft_version }, { headers });
      }
      const { data, error } = await client.from("complaints").insert({ ...values, user_id: user.id, purchase_id: id, request_id: input.requestId }).select("id,draft_version").single();
      if (!error) return NextResponse.json(data, { headers });
      if (error.code === "23505") {
        const retry = await client.from("complaints").select("*").eq("user_id", user.id).eq("request_id", input.requestId).maybeSingle();
        if (retry.error) throw retry.error;
        if (retry.data) {
          const old = retry.data;
          const same = old.purchase_id === id && old.family === values.family && old.remedy === values.remedy &&
            old.purchase_updated_at === values.purchase_updated_at && old.template_version === values.template_version &&
            old.source_version === values.source_version && canonical(old.answers) === canonical(values.answers) && canonical(old.facts) === canonical(values.facts);
          return same ? NextResponse.json({ id: old.id, draft_version: old.draft_version }, { headers }) :
            errorResponse("Ankstesnis juodraštis išsaugotas su kitais duomenimis. Peržiūrėkite jį ir aiškiai pritaikykite dabartinius pakeitimus.", 409, "CREATION_CHANGED", { id: old.id, draft_version: old.draft_version });
        }
      }
      throw error;
    }
    if (!input.complaintId || !input.expectedVersion) return errorResponse("Juodraštis nerastas.", 404);
    const { data: draft, error: draftError } = await client.from("complaints").select("*").eq("id", input.complaintId).eq("purchase_id", id).eq("user_id", user.id).maybeSingle();
    if (draftError) throw draftError;
    if (!draft) return errorResponse("Juodraštis nerastas.", 404);
    const { data: existing, error: existingError } = await client.from("complaint_versions").select("id,version_no").eq("complaint_id", draft.id).eq("request_id", input.requestId).maybeSingle();
    if (existingError) throw existingError;
    if (existing) return NextResponse.json(existing, { headers });
    const evaluated = decide(draft.family, draft.answers, today);
    if (!evaluated) return errorResponse("Pakartokite teisinę patikrą.");
    const remedy = requestSchema.parse(draft.remedy);
    const facts = reviewed(draft.family, evaluated.answers, evaluated.decision, remedy, draft.facts, purchase, today);
    const documents = await listPurchaseDocuments(client, user.id, id);
    const evidence = selectedEvidence(facts.evidenceIds, documents);
    for (const item of evidence) {
      const document = documents.find((row) => row.id === item.id)!;
      const { error } = await client.storage.from("purchase-evidence").info(document.storage_path);
      if (error) return errorResponse("Pasirinktas priedas nepasiekiamas. Peržiūrėkite priedus iš naujo.", 409);
    }
    const letter = renderLetter(draft.family, remedy, facts, evidence, evaluated.decision);
    const snapshot = { purchase: { id: purchase.id, updated_at: purchase.updated_at, product_name: purchase.product_name, seller_name: purchase.seller_name, purchase_date: purchase.purchase_date, received_date: purchase.received_date, purchase_channel: purchase.purchase_channel, price_cents: purchase.price_cents }, facts, answers: evaluated.answers, decision: { code: evaluated.decision.code, rulesTriggered: evaluated.decision.rulesTriggered, secondaryRemedyGrounds: "secondaryRemedyGrounds" in evaluated.decision ? evaluated.decision.secondaryRemedyGrounds : [] }, remedy, evidence };
    assertDocumentBudget("Dokumento kopija", snapshot, 32000);
    assertDocumentBudget("Dokumento skyriai", letter.sections, 24000);
    if (letter.text.length > 24000) return errorResponse("Dokumento tekstas per ilgas. Sutrumpinkite peržiūrimus faktus.", 400, "SIZE_LIMIT");
    const key = process.env.COMPLAINT_SIGNING_KEY;
    if (!key || key.length < 32) return errorResponse("Dokumentų pasirašymas nesukonfigūruotas. Kreipkitės į administratorių.", 503, "SIGNING_UNAVAILABLE");
    const payloadText = JSON.stringify({
      complaintId: draft.id, requestId: input.requestId, expectedVersion: input.expectedVersion,
      purchaseUpdatedAt: purchase.updated_at, evidenceIds: facts.evidenceIds,
      documentDate: facts.documentDate, snapshot, sections: letter.sections, plainText: letter.text,
      templateVersion: TEMPLATE_VERSION, sourceVersion: SOURCE_VERSION
    });
    const signature = createHmac("sha256", key).update(payloadText, "utf8").digest("hex");
    const { data: version, error } = await client.rpc("generate_signed_complaint_version", { p_payload: payloadText, p_signature: signature });
    if (error) return serviceError(error);
    return NextResponse.json({ id: version.id, version_no: version.version_no }, { headers });
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse(`Patikrinkite lauką „${fieldLabels[String(error.issues[0]?.path[0])] ?? "duomenys"}“.`, 400, "INVALID_FIELD");
    if (error instanceof MissingEvidenceError) return errorResponse(error.message, 409, "MISSING_EVIDENCE");
    if (error instanceof ComplaintInputError) return errorResponse(error.message, 400, "INVALID_FIELD");
    if (error instanceof Error && /per ilgi|patikrinkite|nesutampa|nurodykite|aprašykite|palaikomas|patvirtinkite|prašydami|negali|reikia|viršija|pataisykite|peržiūrėkite/i.test(error.message)) return errorResponse(error.message, 400, "INVALID_FIELD");
    return serviceError(error);
  }
}
