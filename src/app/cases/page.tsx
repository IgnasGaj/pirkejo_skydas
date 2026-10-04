import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requirePurchaseUser } from "@/features/purchases/data/auth";
import { todayInVilnius } from "@/lib/date";
import { CASE_RULE_VERSION, CASE_VERIFIED_THROUGH, responseDeadline } from "@/features/cases/domain";
import type { Family } from "@/features/complaints/domain";

export const dynamic = "force-dynamic";
export default async function CasesPage({ searchParams }: { searchParams: Promise<{ state?: string; page?: string }> }) {
  const user = await requirePurchaseUser("/cases");
  const { state, page: rawPage } = await searchParams;
  const filter = state === "closed" ? "closed" : "active";
  const page = Math.min(10000, Math.max(1, Number.parseInt(rawPage ?? "1", 10) || 1));
  const client = await createClient();
  let query = client.from("cases").select("*", { count: "exact" }).eq("user_id", user.id);
  query = filter === "closed" ? query.in("progress", ["CLOSED", "RESOLVED"]) : query.in("progress", ["PREPARED", "AWAITING_RESPONSE", "RESPONSE_RECORDED", "IN_SERVICE"]);
  const { data: rows, error, count } = await query.order("updated_at", { ascending: false }).order("id", { ascending: false }).range((page - 1) * 20, page * 20 - 1);
  if (error) throw new Error("Nepavyko įkelti kreipimųsi sąrašo.");
  const purchaseIds = [...new Set((rows ?? []).map((row) => row.purchase_id))];
  const purchases = purchaseIds.length ? await client.from("purchases").select("id,product_name,seller_name").eq("user_id", user.id).in("id", purchaseIds) : { data: [], error: null };
  if (purchases.error) throw new Error("Nepavyko įkelti pirkinio informacijos.");
  const byId = new Map((purchases.data ?? []).map((item) => [item.id, item]));
  const today = todayInVilnius();
  return <main className="mx-auto max-w-5xl px-5 py-10 sm:px-8"><h1 className="text-3xl font-bold">Mano kreipimaisi</h1><p className="mt-2 text-slate-600">Sekite parengtus dokumentus ir užregistruotą kreipimosi eigą.</p><nav className="mt-6 flex gap-3"><Link href="/cases?state=active" aria-current={filter === "active" ? "page" : undefined} className="rounded-xl border px-4 py-3 font-semibold text-teal-900">Aktyvūs</Link><Link href="/cases?state=closed" aria-current={filter === "closed" ? "page" : undefined} className="rounded-xl border px-4 py-3 font-semibold text-teal-900">Uždaryti</Link></nav><p className="mt-5 text-sm text-slate-600">Rasta: {count ?? 0}</p>
    {(rows ?? []).length === 0 ? <p className="mt-6 rounded-2xl bg-white p-6">Kreipimųsi šiame sąraše nėra. <Link href="/purchases" className="text-teal-800 underline">Atidarykite pirkinį</Link> ir parenkite dokumentą.</p> : <ul className="mt-5 space-y-4">{(rows ?? []).map((item) => {
      const purchase = byId.get(item.purchase_id);
      const calculated = responseDeadline({ family: item.family as Family, submittedOn: item.submitted_on, receivedOn: item.received_on, substantiveResponse: item.has_substantive_response, today, sourceValidThrough: CASE_VERIFIED_THROUGH });
      const deadline = calculated.state !== "UNAVAILABLE" && item.deadline_rule_version !== CASE_RULE_VERSION ? { state: "UNAVAILABLE" as const, reason: "Termino taisyklę reikia patikrinti iš naujo." } : calculated;
      return <li key={item.id} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5"><Link href={`/cases/${item.id}`} className="break-words text-lg font-bold text-teal-800 underline">{purchase?.product_name ?? "Pirkinys"} · {purchase?.seller_name ?? "Pardavėjas"}</Link><p className="mt-2 text-sm">{item.submitted_on ? `Pateikta ${item.submitted_on}` : "Dokumentas parengtas, pateikimas nepažymėtas"}</p><p className="mt-1 text-sm text-slate-600">{deadline.state === "UNAVAILABLE" ? deadline.reason : `Atsakymo termino pabaiga: ${deadline.date}`}</p><p className="mt-1 text-xs text-slate-500">Atnaujinta {new Date(item.updated_at).toLocaleString("lt-LT", { timeZone: "Europe/Vilnius" })}</p></li>;
    })}</ul>}
    <nav className="mt-6 flex gap-5 font-semibold text-teal-800">{page > 1 && <Link href={`/cases?state=${filter}&page=${page - 1}`}>← Ankstesni</Link>}{page * 20 < (count ?? 0) && <Link href={`/cases?state=${filter}&page=${page + 1}`}>Kiti →</Link>}</nav>
  </main>;
}
