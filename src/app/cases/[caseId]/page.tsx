import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePurchaseUser } from "@/features/purchases/data/auth";
import { todayInVilnius } from "@/lib/date";
import { CaseJournal } from "@/features/cases/CaseJournal";

export const dynamic = "force-dynamic";
export default async function CasePage({ params, searchParams }: { params: Promise<{ caseId: string }>; searchParams: Promise<{ page?: string; evidencePage?: string }> }) {
  const { caseId } = await params;
  if (!z.uuid().safeParse(caseId).success) notFound();
  const user = await requirePurchaseUser(`/cases/${caseId}`);
  const query = await searchParams;
  const page = Math.min(10000, Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1));
  const evidencePage = Math.min(10000, Math.max(1, Number.parseInt(query.evidencePage ?? "1", 10) || 1));
  const client = await createClient();
  const { data: item, error } = await client.from("cases").select("*").eq("id", caseId).eq("user_id", user.id).maybeSingle();
  if (error) throw new Error("Nepavyko įkelti kreipimosi.");
  if (!item) notFound();
  const [{ data: purchase, error: purchaseError }, { data: version, error: versionError }, history, docs, submissionEvent, receiptEvent, serviceEvent] = await Promise.all([
    client.from("purchases").select("*").eq("id", item.purchase_id).eq("user_id", user.id).maybeSingle(),
    client.from("complaint_versions").select("id,complaint_id,version_no,generated_at,template_version,source_version").eq("id", item.complaint_version_id).eq("user_id", user.id).maybeSingle(),
    client.from("case_events").select("*", { count: "exact" }).eq("case_id", caseId).eq("user_id", user.id).order("occurred_on", { ascending: false }).order("recorded_at", { ascending: false }).order("id", { ascending: false }).range((page - 1) * 20, page * 20 - 1),
    client.from("purchase_documents").select("*", { count: "exact" }).eq("user_id", user.id).eq("purchase_id", item.purchase_id).eq("upload_state", "READY").order("created_at", { ascending: false }).order("id", { ascending: false }).range((evidencePage - 1) * 50, evidencePage * 50 - 1),
    client.from("case_events").select("id").eq("case_id", caseId).in("kind", ["SUBMITTED", "SUBMISSION_CORRECTED"]).order("revision", { ascending: false }).limit(1).maybeSingle(),
    client.from("case_events").select("id").eq("case_id", caseId).in("kind", ["SUBMITTED", "RECEIPT_RECORDED", "RECEIPT_CORRECTED"]).order("revision", { ascending: false }).limit(1).maybeSingle(),
    client.from("case_events").select("occurred_on").eq("case_id", caseId).eq("kind", "SERVICE_STARTED").order("revision", { ascending: false }).limit(1).maybeSingle()
  ]);
  if (purchaseError || versionError || history.error || docs.error || submissionEvent.error || receiptEvent.error || serviceEvent.error) throw new Error("Nepavyko įkelti kreipimosi istorijos.");
  if (!purchase || !version) throw new Error("Kreipimosi dokumentas nepasiekiamas.");
  const visibleEventIds = (history.data ?? []).map((event) => event.id);
  const corrections = visibleEventIds.length ? await client.from("case_events").select("target_event_id").eq("case_id", caseId).eq("user_id", user.id).in("target_event_id", visibleEventIds) : { data: [], error: null };
  if (corrections.error) throw new Error("Nepavyko įkelti istorijos pataisų.");
  const supersededIds = (corrections.data ?? []).map((event) => event.target_event_id).filter((id): id is string => Boolean(id));
  const linkedIds = [...new Set((history.data ?? []).map((event) => event.evidence_id).filter((id): id is string => Boolean(id)))];
  const linked = linkedIds.length ? await client.from("purchase_documents").select("*").eq("user_id", user.id).eq("purchase_id", item.purchase_id).eq("upload_state", "READY").in("id", linkedIds) : { data: [], error: null };
  if (linked.error) throw new Error("Nepavyko patikrinti įrodymų.");
  const ready = new Map((linked.data ?? []).map((doc) => [doc.id, doc]));
  const evidenceAvailability = Object.fromEntries(await Promise.all(linkedIds.map(async (id) => {
    const document = ready.get(id);
    if (!document) return [id, "Pašalintas"] as const;
    try { const { error } = await client.storage.from("purchase-evidence").info(document.storage_path); return [id, error ? "Laikinai nepasiekiamas" : "Galimas"] as const; }
    catch { return [id, "Laikinai nepasiekiamas"] as const; }
  })));
  return <main className="mx-auto max-w-4xl px-5 py-10 sm:px-8"><Link href="/cases" className="font-semibold text-teal-800">← Mano kreipimaisi</Link>{item.family === "DEFECTIVE_PRODUCT" && <Link href={`/cases/${caseId}/vvtat`} className="mt-5 inline-flex min-h-12 items-center rounded-xl bg-teal-800 px-5 font-semibold text-white">Parengti dokumentų paketą VVTAT</Link>}<CaseJournal item={item} purchase={purchase} version={version} events={history.data ?? []} evidence={docs.data ?? []} evidenceAvailability={evidenceAvailability} supersededIds={supersededIds} today={todayInVilnius()} submissionEventId={submissionEvent.data?.id ?? null} receiptEventId={receiptEvent.data?.id ?? null} serviceStartedOn={serviceEvent.data?.occurred_on ?? null} /><nav className="mt-8 flex gap-5 font-semibold text-teal-800">{page > 1 && <Link href={`/cases/${caseId}?page=${page - 1}&evidencePage=${evidencePage}`}>← Naujesni įrašai</Link>}{page * 20 < (history.count ?? 0) && <Link href={`/cases/${caseId}?page=${page + 1}&evidencePage=${evidencePage}`}>Senesni įrašai →</Link>}</nav><p className="mt-2 text-sm text-slate-600">Istorijos įrašų: {history.count ?? 0}</p><nav className="mt-5 flex gap-5 font-semibold text-teal-800">{evidencePage > 1 && <Link href={`/cases/${caseId}?page=${page}&evidencePage=${evidencePage - 1}`}>← Naujesni įrodymai</Link>}{evidencePage * 50 < (docs.count ?? 0) && <Link href={`/cases/${caseId}?page=${page}&evidencePage=${evidencePage + 1}`}>Senesni įrodymai →</Link>}</nav><p className="mt-2 text-sm text-slate-600">Pasirenkamų įrodymų: {docs.count ?? 0}</p></main>;
}
