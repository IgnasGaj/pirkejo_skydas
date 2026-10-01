import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requirePurchaseUser } from "@/features/purchases/data/auth";
import { editPurchaseAction } from "@/features/purchases/data/actions";
import { getPurchaseById } from "@/features/purchases/data/purchases";
import { PurchaseForm } from "@/features/purchases/components/PurchaseForm";
import { z } from "zod";

export const dynamic = "force-dynamic";

export default async function EditPurchasePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ state?: string }> }) {
  const { id } = await params;
  const user = await requirePurchaseUser(`/purchases/${id}/edit`);
  if (!z.uuid().safeParse(id).success) notFound();
  const purchase = await getPurchaseById(await createClient(), user.id, id);
  if (!purchase) notFound();
  const { state } = await searchParams;
  return <main className="mx-auto max-w-2xl px-5 py-10 sm:px-8"><Link href={`/purchases/${id}`} className="text-sm font-semibold text-teal-800">← Grįžti prie pirkinio</Link><h1 className="mb-8 mt-6 text-3xl font-bold">Redaguoti pirkinį</h1>{state && <p role="alert" className="mb-6 rounded-xl bg-amber-50 p-4 text-sm text-amber-950">{state === "invalid" ? "Patikrinkite įvestus duomenis." : "Nepavyko išsaugoti pirkinio. Bandykite dar kartą."}</p>}<PurchaseForm action={editPurchaseAction.bind(null, id)} purchase={purchase} submitLabel="Išsaugoti pakeitimus" /></main>;
}
