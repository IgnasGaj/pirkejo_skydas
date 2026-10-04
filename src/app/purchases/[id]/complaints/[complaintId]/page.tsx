import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePurchaseUser } from "@/features/purchases/data/auth";
import { getPurchaseById, listPurchaseDocuments } from "@/features/purchases/data/purchases";
import { ComplaintComposer } from "@/features/complaints/ComplaintComposer";

export const dynamic = "force-dynamic";
export default async function ComplaintPage({ params, searchParams }: { params: Promise<{ id: string; complaintId: string }>; searchParams: Promise<{ page?: string }> }) {
  const { id, complaintId } = await params;
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(complaintId).success) notFound();
  const user = await requirePurchaseUser(`/purchases/${id}/complaints/${complaintId}`);
  const client = await createClient();
  const purchase = await getPurchaseById(client, user.id, id);
  if (!purchase) notFound();
  const page = Math.min(10000, Math.max(1, Number.parseInt((await searchParams).page ?? "1", 10) || 1));
  const [{ data: draft, error: draftError }, { data: versions, error: versionsError }, documents] = await Promise.all([
    client.from("complaints").select("*").eq("id", complaintId).eq("purchase_id", id).eq("user_id", user.id).maybeSingle(),
    client.from("complaint_versions").select("*").eq("complaint_id", complaintId).eq("purchase_id", id).eq("user_id", user.id).order("version_no", { ascending: false }).range((page - 1) * 20, page * 20),
    listPurchaseDocuments(client, user.id, id)
  ]);
  if (draftError || versionsError) throw new Error("Nepavyko įkelti dokumento istorijos.");
  if (!draft) notFound();
  const versionIds = (versions ?? []).map((version) => version.id);
  const tracked = versionIds.length ? await client.from("cases").select("id,complaint_version_id").eq("user_id", user.id).eq("purchase_id", id).in("complaint_version_id", versionIds) : { data: [], error: null };
  if (tracked.error) throw new Error("Nepavyko įkelti kreipimųsi.");
  const caseByVersion = Object.fromEntries((tracked.data ?? []).map((item) => [item.complaint_version_id, item.id]));
  const currentFiles = new Map(documents.map((document) => [document.id, document]));
  const historicalIds = [...new Set((versions ?? []).flatMap((version) => {
    const snapshot = version.snapshot as { evidence?: Array<{ id?: string }> };
    return Array.isArray(snapshot?.evidence) ? snapshot.evidence.map((item) => item.id).filter((value): value is string => typeof value === "string") : [];
  }))];
  const attachmentAvailability = Object.fromEntries(await Promise.all(historicalIds.map(async (documentId) => {
    const currentFile = currentFiles.get(documentId);
    if (!currentFile) return [documentId, "Pašalintas"] as const;
    try {
      const { error } = await client.storage.from("purchase-evidence").info(currentFile.storage_path);
      return [documentId, error ? "Laikinai nepasiekiamas" : "Galimas"] as const;
    } catch { return [documentId, "Laikinai nepasiekiamas"] as const; }
  })));
  return <main className="mx-auto max-w-4xl px-5 py-10 sm:px-8"><Link href={`/purchases/${id}`} className="text-sm font-semibold text-teal-800">← Pirkinys</Link><h1 className="my-7 text-3xl font-bold">Dokumentas pardavėjui</h1><ComplaintComposer key={draft.id} purchase={purchase} documents={documents} initialDraft={draft} versions={(versions ?? []).slice(0, 20)} attachmentAvailability={attachmentAvailability} caseByVersion={caseByVersion} /><nav className="mt-5 flex gap-4 text-teal-800">{page > 1 && <Link href={`?page=${page - 1}`}>← Naujesnės versijos</Link>}{(versions?.length ?? 0) > 20 && <Link href={`?page=${page + 1}`}>Senesnės versijos →</Link>}</nav></main>;
}
