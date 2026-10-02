import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePurchaseUser } from "@/features/purchases/data/auth";
import { getPurchaseById, listPurchaseDocuments } from "@/features/purchases/data/purchases";
import { ComplaintComposer } from "@/features/complaints/ComplaintComposer";

export const dynamic = "force-dynamic";
export default async function ComplaintPage({ params }: { params: Promise<{ id: string; complaintId: string }> }) {
  const { id, complaintId } = await params;
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(complaintId).success) notFound();
  const user = await requirePurchaseUser(`/purchases/${id}/complaints/${complaintId}`);
  const client = await createClient();
  const purchase = await getPurchaseById(client, user.id, id);
  if (!purchase) notFound();
  const [{ data: draft }, { data: versions }, documents] = await Promise.all([
    client.from("complaints").select("*").eq("id", complaintId).eq("purchase_id", id).eq("user_id", user.id).maybeSingle(),
    client.from("complaint_versions").select("*").eq("complaint_id", complaintId).eq("purchase_id", id).eq("user_id", user.id).order("version_no", { ascending: false }),
    listPurchaseDocuments(client, user.id, id)
  ]);
  if (!draft) notFound();
  return <main className="mx-auto max-w-4xl px-5 py-10 sm:px-8"><Link href={`/purchases/${id}`} className="text-sm font-semibold text-teal-800">← Pirkinys</Link><h1 className="my-7 text-3xl font-bold">Dokumentas pardavėjui</h1><ComplaintComposer purchase={purchase} documents={documents} initialDraft={draft} versions={versions ?? []} /></main>;
}
