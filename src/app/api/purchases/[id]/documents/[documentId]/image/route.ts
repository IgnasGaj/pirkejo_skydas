import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { getPurchaseDocument } from "@/features/purchases/data/purchases";

const unavailable = () => new NextResponse(null, { status: 404, headers: { "Cache-Control": "private, no-store" } });
export async function GET(_: Request, { params }: { params: Promise<{ id: string; documentId: string }> }) {
  const { id, documentId } = await params;
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(documentId).success) return unavailable();
  const user = await getAuthenticatedUser();
  if (!user) return unavailable();
  try {
    const client = await createClient();
    const document = await getPurchaseDocument(client, user.id, id, documentId);
    if (!document || document.document_type !== "RECEIPT" || !["image/jpeg", "image/png", "image/webp"].includes(document.mime_type) || document.size_bytes > 15 * 1024 * 1024) return unavailable();
    const storage = client.storage.from("purchase-evidence");
    const { data: info, error: infoError } = await storage.info(document.storage_path);
    if (infoError || !info || info.size !== document.size_bytes || info.size > 15 * 1024 * 1024 || info.contentType !== document.mime_type) return unavailable();
    const { data, error } = await storage.download(document.storage_path);
    if (error || !data || data.size !== document.size_bytes || data.size > 15 * 1024 * 1024) return unavailable();
    return new NextResponse(data, { headers: {
      "Content-Type": document.mime_type, "Content-Length": String(data.size),
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"
    } });
  } catch { return unavailable(); }
}
