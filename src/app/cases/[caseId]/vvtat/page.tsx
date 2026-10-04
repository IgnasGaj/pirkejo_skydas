import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePurchaseUser } from "@/features/purchases/data/auth";
import { todayInVilnius } from "@/lib/date";
import { VvtatPreparation } from "@/features/vvtat/VvtatPreparation";

export const dynamic = "force-dynamic";
export default async function VvtatPage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  if (!z.uuid().safeParse(caseId).success) notFound();
  const user = await requirePurchaseUser(`/cases/${caseId}/vvtat`);
  const client = await createClient();
  const { data: item, error } = await client.from("cases").select("*").eq("id", caseId).eq("user_id", user.id).maybeSingle();
  if (error) throw new Error("Kreipimosi nepavyko įkelti.");
  if (!item) notFound();
  const [versionResult, purchaseResult, packagesResult, evidenceResult, eventResult] = await Promise.all([
    client.from("complaint_versions").select("id,complaint_id,version_no,generated_at,snapshot,plain_text,template_version,source_version")
      .eq("id", item.complaint_version_id).eq("purchase_id", item.purchase_id).eq("user_id", user.id).maybeSingle(),
    client.from("purchases").select("id,product_name,seller_name,purchase_date,received_date,purchase_channel,price_cents,updated_at,deletion_state")
      .eq("id", item.purchase_id).eq("user_id", user.id).maybeSingle(),
    client.from("vvtat_packages").select("id,version_no,case_revision,created_at")
      .eq("case_id", caseId).eq("user_id", user.id).order("version_no", { ascending: false }).limit(100),
    client.from("purchase_documents").select("id,original_filename,document_type,size_bytes,upload_state,content_sha256,storage_path", { count: "exact" })
      .eq("purchase_id", item.purchase_id).eq("user_id", user.id).order("created_at", { ascending: false })
      .order("id", { ascending: false }).range(0, 49),
    client.from("case_events").select("revision,evidence_id").eq("case_id", caseId).eq("user_id", user.id)
      .order("revision", { ascending: true }).range(0, 499)
  ]);
  if (versionResult.error || purchaseResult.error || packagesResult.error || evidenceResult.error || eventResult.error || !versionResult.data || !purchaseResult.data)
    throw new Error("Paketo rengimo duomenų nepavyko įkelti.");
  const eventReferences: Record<string, number[]> = {};
  for (const event of eventResult.data ?? []) if (event.evidence_id) (eventReferences[event.evidence_id] ??= []).push(event.revision);
  const availableEvidence = await Promise.all((evidenceResult.data ?? []).map(async (doc) => {
    if (doc.upload_state !== "READY") return { ...doc, available: false };
    const { error } = await client.storage.from("purchase-evidence").info(doc.storage_path);
    return { ...doc, available: !error };
  }));
  return <main className="mx-auto max-w-4xl px-5 py-10 sm:px-8"><Link className="font-semibold text-teal-800" href={`/cases/${caseId}`}>← Kreipimosi eiga</Link>
    <h1 className="mt-5 text-3xl font-bold">VVTAT dokumentų paketas</h1>
    <VvtatPreparation item={item} purchase={purchaseResult.data} version={versionResult.data}
      packages={packagesResult.data ?? []} initialEvidence={availableEvidence} evidenceCount={evidenceResult.count ?? 0} eventReferences={eventReferences} today={todayInVilnius()} />
  </main>;
}
