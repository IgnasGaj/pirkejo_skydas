import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePurchaseUser } from "@/features/purchases/data/auth";
import { getPurchaseById, listPurchaseDocuments } from "@/features/purchases/data/purchases";
import { ComplaintComposer } from "@/features/complaints/ComplaintComposer";

export const dynamic = "force-dynamic";
export default async function NewComplaintPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ flow?: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const user = await requirePurchaseUser(`/purchases/${id}/complaints/new`);
  const client = await createClient();
  const purchase = await getPurchaseById(client, user.id, id);
  if (!purchase) notFound();
  const documents = await listPurchaseDocuments(client, user.id, id);
  const { flow } = await searchParams;
  return <main className="mx-auto max-w-4xl px-5 py-10 sm:px-8"><Link href={`/purchases/${id}`} className="text-sm font-semibold text-teal-800">← Pirkinys</Link><h1 className="my-7 text-3xl font-bold">Naujas dokumentas pardavėjui</h1><ComplaintComposer purchase={purchase} documents={documents} initialFlow={flow} /></main>;
}
