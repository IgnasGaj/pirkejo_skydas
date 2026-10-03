import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requirePurchaseUser } from "@/features/purchases/data/auth";
import { listPurchases, purchaseIdsWithEvidence } from "@/features/purchases/data/purchases";
import { channelLabels } from "@/features/purchases/domain/types";

export const dynamic = "force-dynamic";

export default async function PurchasesPage({ searchParams }: { searchParams: Promise<{ state?: string; page?: string }> }) {
  const user = await requirePurchaseUser("/purchases");
  const client = await createClient();
  const { state, page: rawPage } = await searchParams;
  const page = Math.min(10000, Math.max(1, Number.parseInt(rawPage ?? "1", 10) || 1));
  const purchases = await listPurchases(client, user.id, 21, (page - 1) * 20);
  const evidence = await purchaseIdsWithEvidence(client, user.id, purchases.map((purchase) => purchase.id));
  return <main className="mx-auto max-w-5xl px-5 py-10 sm:px-8"><div className="flex flex-wrap items-center justify-between gap-4"><h1 className="text-3xl font-bold text-slate-950">Mano pirkiniai</h1><Link href="/purchases/new" className="inline-flex min-h-12 items-center rounded-xl bg-teal-800 px-5 font-semibold text-white">Pridėti pirkinį</Link></div>
    {state === "deleted" && <p role="status" className="mt-6 rounded-xl bg-teal-50 p-4 text-teal-950">Pirkinys ištrintas.</p>}
    {state === "missing" && <p role="alert" className="mt-6 rounded-xl bg-amber-50 p-4 text-amber-950">Pirkinio rasti nepavyko.</p>}
    {purchases.length === 0 && page === 1 ? <section className="mt-10 rounded-3xl border border-slate-200 bg-white p-8"><h2 className="text-2xl font-bold">Čia bus jūsų pirkiniai</h2><p className="mt-3 text-slate-600">Išsaugokite pirkinį ir jo pirkimo įrodymą, kad prireikus viską rastumėte vienoje vietoje.</p><Link href="/purchases/new" className="mt-6 inline-flex min-h-12 items-center rounded-xl bg-teal-800 px-5 font-semibold text-white">Pridėti pirmą pirkinį</Link></section> : <div className="mt-8 grid gap-4 sm:grid-cols-2">{purchases.slice(0, 20).map((purchase) => <Link key={purchase.id} href={`/purchases/${purchase.id}`} className="rounded-2xl border border-slate-200 bg-white p-6 hover:border-teal-500 focus-visible:ring-2 focus-visible:ring-teal-600"><h2 className="text-xl font-bold text-slate-950">{purchase.product_name}</h2><p className="mt-2 text-sm text-slate-700">{purchase.seller_name} · {purchase.purchase_date}</p><p className="mt-2 text-sm text-slate-600">{channelLabels[purchase.purchase_channel]}{purchase.price_cents != null ? ` · ${(purchase.price_cents / 100).toFixed(2)} EUR` : ""}</p><p className="mt-4 text-xs font-semibold text-teal-800">{evidence.has(purchase.id) ? "Pirkimo įrodymas išsaugotas" : "Pirkimo įrodymas nepridėtas"}</p></Link>)}</div>}
    <nav className="mt-6 flex gap-5 font-semibold text-teal-800">{page > 1 && <Link href={`/purchases?page=${page - 1}`}>← Ankstesni</Link>}{purchases.length > 20 && <Link href={`/purchases?page=${page + 1}`}>Kiti →</Link>}</nav>
  </main>;
}
