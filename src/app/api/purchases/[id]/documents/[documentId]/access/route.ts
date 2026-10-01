import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { createPurchaseDocumentAccessUrl, getPurchaseDocument } from "@/features/purchases/data/purchases";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; documentId: string }> }) {
  const { id, documentId } = await params;
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(documentId).success) return new NextResponse(null, { status: 404 });
  const user = await getAuthenticatedUser();
  if (!user) return new NextResponse(null, { status: 404 });
  try {
    const client = await createClient();
    const document = await getPurchaseDocument(client, user.id, id, documentId);
    if (!document) return new NextResponse(null, { status: 404 });
    const url = await createPurchaseDocumentAccessUrl(client, document.storage_path, request.nextUrl.searchParams.get("download") === "1");
    const response = NextResponse.redirect(url);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    console.error("Document access failed", error);
    return new NextResponse(null, { status: 404 });
  }
}
