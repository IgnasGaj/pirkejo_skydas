import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { getPurchaseById } from "@/features/purchases/data/purchases";
import { renderComplaintPdf } from "@/features/complaints/pdf";

export const dynamic = "force-dynamic";
const privateHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; complaintId: string; versionId: string }> }) {
  try {
  const { id, complaintId, versionId } = await params;
  if (![id, complaintId, versionId].every((value) => z.uuid().safeParse(value).success)) return new NextResponse("Nerasta", { status: 404, headers: privateHeaders });
  const user = await getAuthenticatedUser();
  if (!user) return new NextResponse("Prisijunkite", { status: 401, headers: privateHeaders });
  const client = await createClient();
  const purchase = await getPurchaseById(client, user.id, id);
  if (!purchase) return new NextResponse("Nerasta", { status: 404, headers: privateHeaders });
  const complaint = await client.from("complaints").select("id").eq("id", complaintId).eq("purchase_id", id).eq("user_id", user.id).maybeSingle();
  if (complaint.error) return new NextResponse("Dokumentas laikinai nepasiekiamas. Bandykite dar kartą.", { status: 503, headers: privateHeaders });
  if (!complaint.data) return new NextResponse("Nerasta", { status: 404, headers: privateHeaders });
  const { data: version, error: versionError } = await client.from("complaint_versions").select("*").eq("id", versionId).eq("complaint_id", complaintId).eq("purchase_id", id).eq("user_id", user.id).maybeSingle();
  if (versionError) return new NextResponse("Dokumento versija laikinai nepasiekiama. Bandykite dar kartą.", { status: 503, headers: privateHeaders });
  if (!version) return new NextResponse("Nerasta", { status: 404, headers: privateHeaders });
  const format = request.nextUrl.searchParams.get("format") === "txt" ? "txt" : "pdf";
  const base = `dokumentas-${version.document_date}-v${version.version_no}`;
  if (format === "txt") return new NextResponse(version.plain_text, { headers: { ...privateHeaders, "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": `attachment; filename="${base}.txt"` } });
  try {
    const sections = z.array(z.string().max(8000)).max(24).parse(version.sections);
    const bytes = await renderComplaintPdf(sections);
    return new NextResponse(Buffer.from(bytes), { headers: { ...privateHeaders, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${base}.pdf"` } });
  } catch {
    return new NextResponse("Nepavyko parengti PDF.", { status: 500, headers: privateHeaders });
  }
  } catch {
    return new NextResponse("Dokumentas laikinai nepasiekiamas. Bandykite dar kartą.", { status: 503, headers: privateHeaders });
  }
}
