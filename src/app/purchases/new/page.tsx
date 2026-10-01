import Link from "next/link";
import { requirePurchaseUser } from "@/features/purchases/data/auth";
import { saveReviewedPurchase } from "@/features/receipts/data/actions";
import { PurchaseForm } from "@/features/purchases/components/PurchaseForm";
import { createClient } from "@/lib/supabase/server";
import { getPurchaseById, getPurchaseDocument } from "@/features/purchases/data/purchases";
import { redirect } from "next/navigation";
import { z } from "zod";

export const dynamic = "force-dynamic";

export default async function NewPurchasePage({ searchParams }: { searchParams: Promise<{ state?: string; draft?: string; document?: string }> }) {
  const { state, draft, document } = await searchParams;
  const idsValid = z.uuid().safeParse(draft).success && z.uuid().safeParse(document).success;
  const user = await requirePurchaseUser(idsValid ? `/purchases/new?draft=${draft}&document=${document}` : "/purchases/new");
  if (!idsValid) redirect(`/purchases/new?draft=${crypto.randomUUID()}&document=${crypto.randomUUID()}`);
  const client = await createClient();
  const purchase = await getPurchaseById(client, user.id, draft!);
  if (purchase) {
    const evidence = await getPurchaseDocument(client, user.id, draft!, document!);
    if (evidence) {
      const { data: info } = await client.storage.from("purchase-evidence").info(evidence.storage_path);
      if (info?.size === evidence.size_bytes && info.contentType === evidence.mime_type) redirect(`/purchases/${purchase.id}?state=created`);
    }
  }
  return <main className="mx-auto max-w-2xl px-5 py-10 sm:px-8"><Link href="/purchases" className="text-sm font-semibold text-teal-800">← Mano pirkiniai</Link><h1 className="mb-8 mt-6 text-3xl font-bold">Pridėti pirkinį</h1>{state && <p role="alert" className="mb-6 rounded-xl bg-amber-50 p-4 text-sm text-amber-950">{state === "invalid" ? "Patikrinkite įvestus duomenis ir bandykite dar kartą." : "Nepavyko išsaugoti pirkinio. Bandykite dar kartą."}</p>}<PurchaseForm action={saveReviewedPurchase} purchase={purchase ?? undefined} submitLabel="Išsaugoti pirkinį" enableScanning draftIds={{ purchase: draft!, document: document! }} /></main>;
}
