import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { todayInVilnius } from "@/lib/date";
import { validateCaseEvent } from "@/features/cases/validation";
import type { Json } from "@/lib/supabase/database.types";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
function fail(message: string, status: number, code: string) { return NextResponse.json({ error: message, code }, { status, headers }); }
const contextId = (context: { params: Promise<{ caseId: string }> }) => context.params.then((value) => value.caseId);

export async function POST(request: NextRequest, context: { params: Promise<{ caseId: string }> }) {
  const caseId = await contextId(context);
  if (!z.uuid().safeParse(caseId).success) return fail("Kreipimasis nerastas.", 404, "NOT_FOUND");
  const user = await getAuthenticatedUser();
  if (!user) return fail("Prisijunkite ir pakartokite veiksmą. Neišsaugotus duomenis gali tekti įvesti iš naujo.", 401, "AUTH_REQUIRED");
  let input: ReturnType<typeof validateCaseEvent>;
  try { input = validateCaseEvent(await request.json(), todayInVilnius()); }
  catch { return fail("Patikrinkite įvestus duomenis ir datas.", 400, "INVALID_INPUT"); }
  const client = await createClient();
  const { data, error } = await client.rpc("record_case_event", {
    p_case_id: caseId, p_request_id: input.requestId, p_expected_revision: input.expectedRevision,
    p_kind: input.kind, p_occurred_on: input.occurredOn, p_payload: input.payload as Json,
    p_evidence_id: input.evidenceId, p_target_event_id: input.targetEventId
  });
  if (error) {
    if (/Case not found/.test(error.message)) return fail("Kreipimasis nerastas.", 404, "NOT_FOUND");
    if (/Case revision changed|retry differs|correction|transition|already known|before submission/.test(error.message)) return fail("Kreipimasis pasikeitė. Atnaujinkite puslapį ir peržiūrėkite įrašus; jūsų įvesti duomenys išliko.", 409, "STALE_REVISION");
    if (/date|method|response|payload|too long|limit|promised/.test(error.message)) return fail("Patikrinkite įvestus duomenis ir datas.", 400, "INVALID_INPUT");
    console.error("Case mutation failed", { code: error.code });
    return fail("Nepavyko išsaugoti. Bandykite dar kartą; jūsų įvesti duomenys išliko.", 503, "SERVICE_UNAVAILABLE");
  }
  return NextResponse.json({ case: data }, { headers });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ caseId: string }> }) {
  const caseId = await contextId(context);
  if (!z.uuid().safeParse(caseId).success) return fail("Kreipimasis nerastas.", 404, "NOT_FOUND");
  const user = await getAuthenticatedUser();
  if (!user) return fail("Prisijunkite ir bandykite dar kartą.", 401, "AUTH_REQUIRED");
  const parsed = z.strictObject({ requestId: z.uuid(), expectedRevision: z.number().int().min(0).max(500) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Patikrinkite šalinimo užklausą.", 400, "INVALID_INPUT");
  const client = await createClient();
  const { data, error } = await client.rpc("delete_tracked_case", { p_case_id: caseId, p_request_id: parsed.data.requestId, p_expected_revision: parsed.data.expectedRevision });
  if (error?.message.includes("changed") || error?.message.includes("retry differs")) return fail("Kreipimasis pasikeitė. Atnaujinkite puslapį ir peržiūrėkite jo istoriją.", 409, "STALE_REVISION");
  if (error) return fail("Nepavyko ištrinti kreipimosi. Bandykite dar kartą.", 503, "SERVICE_UNAVAILABLE");
  if (!data) return fail("Kreipimasis nerastas.", 404, "NOT_FOUND");
  return NextResponse.json({ deleted: true }, { headers });
}
