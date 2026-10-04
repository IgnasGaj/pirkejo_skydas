import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest, { params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  const headers = { "Cache-Control": "private, no-store" };
  if (!z.uuid().safeParse(caseId).success) return NextResponse.json({ error: "Kreipimasis nerastas." }, { status: 404, headers });
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Prisijunkite iš naujo." }, { status: 401, headers });
  const page = Number(request.nextUrl.searchParams.get("page"));
  if (!Number.isSafeInteger(page) || page < 1 || page > 1000) return NextResponse.json({ error: "Neteisingas puslapis." }, { status: 400, headers });
  const client = await createClient();
  const { data: item } = await client.from("cases").select("purchase_id").eq("id", caseId).eq("user_id", user.id).maybeSingle();
  if (!item) return NextResponse.json({ error: "Kreipimasis nerastas." }, { status: 404, headers });
  const { data, count, error } = await client.from("purchase_documents").select("id,original_filename,document_type,size_bytes,upload_state,content_sha256,storage_path", { count: "exact" })
    .eq("user_id", user.id).eq("purchase_id", item.purchase_id).order("created_at", { ascending: false })
    .order("id", { ascending: false }).range((page - 1) * 50, page * 50 - 1);
  if (error) return NextResponse.json({ error: "Failų nepavyko įkelti." }, { status: 503, headers });
  const evidence = await Promise.all((data ?? []).map(async (doc) => {
    if (doc.upload_state !== "READY") return { ...doc, available: false };
    const { error: storageError } = await client.storage.from("purchase-evidence").info(doc.storage_path);
    return { ...doc, available: !storageError };
  }));
  return NextResponse.json({ evidence, count: count ?? 0 }, { headers });
}
