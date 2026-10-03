import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requirePurchaseUser } from "@/features/purchases/data/auth";
import { deleteDocumentAction, deletePurchaseAction, uploadDocumentAction } from "@/features/purchases/data/actions";
import { getPurchaseById, listUnfinishedPurchaseDocuments, listPurchaseDocuments } from "@/features/purchases/data/purchases";
import { ConfirmDelete } from "@/features/purchases/components/ConfirmDelete";
import { UploadButton } from "@/features/purchases/components/UploadButton";
import { channelLabels, documentLabels, documentTypes } from "@/features/purchases/domain/types";
import { z } from "zod";
import { ExistingReceiptScanner } from "@/features/receipts/components/ExistingReceiptScanner";
import { applyReceiptCorrections } from "@/features/receipts/data/actions";

export const dynamic = "force-dynamic";

const notices: Record<string, string> = {
  created: "Pirkinys išsaugotas.", updated: "Pakeitimai išsaugoti.", uploaded: "Failas išsaugotas.",
  "file-deleted": "Failas pašalintas.", "file-too-large": "Failas per didelis. Didžiausias leidžiamas dydis – 15 MB.",
  "file-invalid": "Šis failo formatas nepalaikomas.", "upload-error": "Nepavyko įkelti failo. Bandykite dar kartą.",
  "delete-error": "Nepavyko ištrinti pirkinio. Bandykite dar kartą.",
  "delete-file-error": "Nepavyko pašalinti failo. Bandykite dar kartą."
};

export default async function PurchasePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ state?: string; documentsPage?: string }> }) {
  const { id } = await params;
  const user = await requirePurchaseUser(`/purchases/${id}`);
  if (!z.uuid().safeParse(id).success) notFound();
  const client = await createClient();
  const purchase = await getPurchaseById(client, user.id, id);
  if (!purchase) notFound();
  const documents = await listPurchaseDocuments(client, user.id, id);
  const unfinishedDocuments = await listUnfinishedPurchaseDocuments(client, user.id, id);
  const { state, documentsPage } = await searchParams;
  const page = Math.min(10000, Math.max(1, Number.parseInt(documentsPage ?? "1", 10) || 1));
  const { data: complaintRows, error: complaintsError } = await client.from("complaints").select("id,family,created_at,updated_at").eq("purchase_id", id).eq("user_id", user.id).order("updated_at", { ascending: false }).order("id", { ascending: false }).range((page - 1) * 20, page * 20);
  if (complaintsError) throw new Error("Nepavyko įkelti dokumentų sąrašo.");
  const complaints = complaintRows ?? [];
  const latest = await Promise.all(complaints.map(async (item) => {
    const { data, error } = await client.from("complaint_versions").select("version_no").eq("complaint_id", item.id).eq("purchase_id", id).eq("user_id", user.id).order("version_no", { ascending: false }).limit(1);
    if (error) throw new Error("Nepavyko įkelti dokumentų istorijos.");
    return [item.id, data?.[0]?.version_no ?? null] as const;
  }));
  const latestById = new Map(latest);
  const rows = [
    ["Pardavėjas", purchase.seller_name], ["Pirkimo data", purchase.purchase_date],
    ["Gavau prekę", purchase.received_date], ["Pirkimo būdas", channelLabels[purchase.purchase_channel]],
    ["Kaina", purchase.price_cents == null ? null : `${(purchase.price_cents / 100).toFixed(2)} EUR`],
    ["Užsakymo / čekio numeris", purchase.reference_number], ["Pastabos", purchase.notes]
  ];
  return <main className="mx-auto max-w-4xl px-5 py-10 sm:px-8"><Link href="/purchases" className="text-sm font-semibold text-teal-800">← Mano pirkiniai</Link><h1 className="mt-6 break-words text-3xl font-bold text-slate-950">{purchase.product_name}</h1>
    {purchase.deletion_state === "DELETING" && <p role="alert" className="mt-6 rounded-xl bg-amber-50 p-4">Pirkinio šalinimas nebaigtas. Paspauskite „Ištrinti pirkinį“ dar kartą, kad užbaigtumėte.</p>}
    {state && notices[state] && <p role={state.includes("error") || state.includes("invalid") || state === "file-too-large" ? "alert" : "status"} className="mt-6 rounded-xl bg-teal-50 p-4 text-sm text-teal-950">{notices[state]}</p>}
    <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 sm:p-8"><h2 className="text-xl font-bold">Pirkinio informacija</h2><dl className="mt-5 space-y-4">{rows.filter(([, value]) => value != null && value !== "").map(([label, value]) => <div key={label} className="grid gap-1 border-t border-slate-100 pt-4 sm:grid-cols-[13rem_1fr]"><dt className="text-sm font-semibold text-slate-500">{label}</dt><dd className="break-words text-sm text-slate-950">{value}</dd></div>)}</dl><div className="mt-7 flex flex-wrap items-center gap-4"><Link href={`/purchases/${id}/edit`} className="inline-flex min-h-12 items-center rounded-xl bg-teal-800 px-5 font-semibold text-white">Redaguoti</Link><ConfirmDelete action={deletePurchaseAction.bind(null, id)} label="Ištrinti pirkinį" title="Ištrinti pirkinį?" description="Bus pašalinti ir prie šio pirkinio išsaugoti failai, juodraščiai bei parengtos dokumentų versijos. Šio veiksmo atšaukti nepavyks." /></div></section>
    <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 sm:p-8"><h2 className="text-xl font-bold">Dokumentai pardavėjui</h2><p className="mt-2 text-sm text-slate-600">Juodraščiai ir parengtos versijos lieka privatūs. Dokumentą pardavėjui pateikite patys.</p><Link href={`/purchases/${id}/complaints/new`} className="mt-5 inline-flex min-h-12 items-center rounded-xl bg-teal-800 px-5 font-semibold text-white">Parengti dokumentą</Link>{complaints.length ? <ul className="mt-5 space-y-3">{complaints.slice(0, 20).map((item) => <li key={item.id} className="rounded-xl border border-slate-200 p-4"><Link className="font-semibold text-teal-800 underline" href={`/purchases/${id}/complaints/${item.id}`}>{item.family === "DEFECTIVE_PRODUCT" ? "Pretenzija dėl prekės trūkumo" : item.family === "DISTANCE_WITHDRAWAL" ? "Sutarties atsisakymas" : "Prašymas pardavėjui"}</Link><p className="mt-1 text-sm text-slate-600">Sukurta {new Date(item.created_at).toLocaleDateString("lt-LT")} · {latestById.get(item.id) ? `Paskutinė parengta versija: ${latestById.get(item.id)}` : "Juodraštis"}</p></li>)}</ul> : <p className="mt-4 text-sm text-slate-600">Dokumentų dar nėra.</p>}<nav className="mt-4 flex gap-4 text-teal-800">{page > 1 && <Link href={`?documentsPage=${page - 1}`}>← Ankstesni</Link>}{complaints.length > 20 && <Link href={`?documentsPage=${page + 1}`}>Kiti →</Link>}</nav></section>
    <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 sm:p-8"><h2 className="text-xl font-bold">Pirkimo įrodymai</h2>{documents.length === 0 && <p className="mt-3 text-sm text-slate-600">Dar nepridėjote čekio ar kito pirkimo įrodymo.</p>}
      {unfinishedDocuments.map((document) => <div key={document.id} className="mt-4 rounded-xl border border-amber-300 p-4"><p className="break-all">Failo „{document.original_filename}“ {document.upload_state === "PENDING" ? "įkėlimas nebaigtas" : "šalinimas nebaigtas"}.</p><ConfirmDelete action={deleteDocumentAction.bind(null, id, document.id)} label="Pašalinti nebaigtą failą" title="Pašalinti nebaigtą failą?" description="Bus bandoma pašalinti failą ir jo nebaigtą įrašą." /></div>)}
      <form action={uploadDocumentAction.bind(null, id)} className="mt-6 space-y-4 rounded-2xl bg-slate-50 p-5"><h3 className="font-semibold">Pridėti pirkimo įrodymą</h3><label className="block text-sm font-semibold">Dokumento tipas<select name="documentType" defaultValue="RECEIPT" className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3">{documentTypes.map((type) => <option key={type} value={type}>{documentLabels[type]}</option>)}</select></label><label className="block text-sm font-semibold">Failas<input name="file" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,.heic,.heif" required className="mt-2 block w-full rounded-xl border border-slate-300 bg-white p-3 text-sm" /></label><p className="text-xs text-slate-600">JPG, PNG, WebP, HEIC, HEIF arba PDF, iki 15 MB.</p><UploadButton /></form>
      {documents.length > 0 && <ul className="mt-7 space-y-4">{documents.map((document) => {
        const access = `/api/purchases/${id}/documents/${document.id}/access`;
        const previewable = ["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(document.mime_type);
        return <li key={document.id} className="rounded-2xl border border-slate-200 p-5"><p className="font-semibold">{documentLabels[document.document_type]}</p><p className="mt-1 break-all text-sm text-slate-700">{document.original_filename}</p><p className="mt-1 text-xs text-slate-500">{(document.size_bytes / 1024 / 1024).toFixed(2)} MB · {new Date(document.created_at).toLocaleDateString("lt-LT")}</p><div className="mt-4 flex flex-wrap items-center gap-4">{previewable && <a href={access} target="_blank" rel="noopener noreferrer" className="min-h-11 content-center font-semibold text-teal-800 underline">Peržiūrėti</a>}<a href={`${access}?download=1`} className="min-h-11 content-center font-semibold text-teal-800 underline">Atsisiųsti</a><ConfirmDelete action={deleteDocumentAction.bind(null, id, document.id)} label="Pašalinti" title="Pašalinti failą?" description="Šio veiksmo atšaukti nepavyks." /></div>{document.document_type === "RECEIPT" && ["image/jpeg", "image/png", "image/webp"].includes(document.mime_type) && <ExistingReceiptScanner purchase={purchase} document={document} action={applyReceiptCorrections.bind(null, id, document.id)} />}</li>;
      })}</ul>}
    </section>
    <section className="mt-8 rounded-3xl border border-teal-200 bg-teal-50 p-6 sm:p-8"><h2 className="text-xl font-bold">Reikia pagalbos su šiuo pirkiniu?</h2><div className="mt-5 flex flex-wrap gap-3"><Link href={`/returns?purchaseId=${id}`} className="inline-flex min-h-12 items-center rounded-xl bg-teal-800 px-5 font-semibold text-white">Ar galiu grąžinti?</Link><Link href={`/defective-product?purchaseId=${id}`} className="inline-flex min-h-12 items-center rounded-xl border border-teal-700 px-5 font-semibold text-teal-900">Prekė sugedo</Link></div></section>
  </main>;
}
