import Link from "next/link";
import { requirePurchaseUser } from "@/features/purchases/data/auth";
import { createPurchaseAction } from "@/features/purchases/data/actions";
import { PurchaseForm } from "@/features/purchases/components/PurchaseForm";

export const dynamic = "force-dynamic";

export default async function NewPurchasePage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  await requirePurchaseUser("/purchases/new");
  const { state } = await searchParams;
  return <main className="mx-auto max-w-2xl px-5 py-10 sm:px-8"><Link href="/purchases" className="text-sm font-semibold text-teal-800">← Mano pirkiniai</Link><h1 className="mb-8 mt-6 text-3xl font-bold">Pridėti pirkinį</h1>{state && <p role="alert" className="mb-6 rounded-xl bg-amber-50 p-4 text-sm text-amber-950">{state === "invalid" ? "Patikrinkite įvestus duomenis ir bandykite dar kartą." : "Nepavyko išsaugoti pirkinio. Bandykite dar kartą."}</p>}<PurchaseForm action={createPurchaseAction} submitLabel="Išsaugoti pirkinį" /></main>;
}
