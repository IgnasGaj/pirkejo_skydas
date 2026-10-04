import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { preparationSchema } from "@/features/vvtat/domain";
import type { Json } from "@/lib/supabase/database.types";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const fail = (message: string, status: number, code: string) => NextResponse.json({ error: message, code }, { status, headers });

export async function POST(request: NextRequest, { params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  if (!z.uuid().safeParse(caseId).success) return fail("Kreipimasis nerastas.", 404, "NOT_FOUND");
  const user = await getAuthenticatedUser();
  if (!user) return fail("Prisijunkite iš naujo. Neišsaugotus duomenis gali tekti įvesti iš naujo.", 401, "AUTH_REQUIRED");
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 30_000) return fail("Paketo aprašymas per ilgas.", 413, "TOO_LARGE");
  const raw = await request.text().catch(() => "");
  if (Buffer.byteLength(raw, "utf8") > 30_000) return fail("Paketo aprašymas per ilgas.", 413, "TOO_LARGE");
  let body: unknown = null;
  try { body = JSON.parse(raw); } catch { /* Invalid body is reported by schema validation. */ }
  const parsed = z.strictObject({ requestId: z.uuid(), expectedRevision: z.number().int().min(0).max(500),
    preparation: preparationSchema }).safeParse(body);
  if (!parsed.success) return fail("Patikrinkite peržiūrėtus duomenis ir pasirinktus failus.", 400, "INVALID_INPUT");
  const client = await createClient();
  const { data, error } = await client.rpc("create_vvtat_package", {
    p_case_id: caseId, p_expected_revision: parsed.data.expectedRevision,
    p_request_id: parsed.data.requestId, p_payload: parsed.data.preparation as Json
  });
  if (error) {
    if (/Case not found|Purchase unavailable|Complaint version unavailable/.test(error.message)) return fail("Kreipimasis nerastas arba nepasiekiamas.", 404, "NOT_FOUND");
    if (/Case revision changed|retry differs/i.test(error.message)) return fail("Kreipimosi eiga pasikeitė. Peržiūrėkite naujausius įrašus; jūsų įvesti duomenys išliko.", 409, "STALE_REVISION");
    if (/Evidence|evidence|history|limit|large|too|Invalid|Unsupported|review/i.test(error.message))
      return fail("Paketo duomenys arba pasirinkti failai nebegalioja arba viršija dydžio ribą. Patikrinkite pasirinkimą.", 400, "INVALID_INPUT");
    console.error("Package creation failed", { code: error.code });
    return fail("Nepavyko išsaugoti. Bandykite dar kartą ta pačia užklausa.", 503, "SERVICE_UNAVAILABLE");
  }
  return NextResponse.json({ package: { id: data.id, versionNo: data.version_no } }, { headers });
}
