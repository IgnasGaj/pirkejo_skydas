"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import type { Purchase } from "../domain/types";
import type { PurchaseFormState } from "../data/actions";
import { channelLabels, purchaseChannels } from "../domain/types";
import { todayInVilnius } from "@/lib/date";
import { ReceiptScanner } from "@/features/receipts/components/ReceiptScanner";
import type { ReceiptSuggestions } from "@/features/receipts/domain/types";

const field = "mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className="min-h-12 w-full rounded-xl bg-teal-800 px-5 font-semibold text-white hover:bg-teal-900 focus-visible:ring-2 focus-visible:ring-teal-600 disabled:opacity-60 sm:w-auto">{pending ? "Saugoma…" : label}</button>;
}

export function PurchaseForm({ action, purchase, submitLabel, enableScanning = false, draftIds }: { action: (state: PurchaseFormState, form: FormData) => Promise<PurchaseFormState>; purchase?: Purchase; submitLabel: string; enableScanning?: boolean; draftIds?: { purchase: string; document: string } }) {
  const [channel, setChannel] = useState(purchase?.purchase_channel ?? "UNKNOWN");
  const [state, formAction] = useActionState(action, { error: null, savedPurchaseId: enableScanning ? purchase?.id : undefined });
  const [mode, setMode] = useState<"scan" | "manual">("manual");
  const [file, setFile] = useState<File | null>(null);
  const [suggestions, setSuggestions] = useState<ReceiptSuggestions | null>(null);
  const [priceTouched, setPriceTouched] = useState(false);
  const [autoPrice, setAutoPrice] = useState(false);
  const [inputValues, setInputValues] = useState({
    productName: purchase?.product_name ?? "", sellerName: purchase?.seller_name ?? "", purchaseDate: purchase?.purchase_date ?? "",
    receivedDate: purchase?.received_date ?? "", price: purchase?.price_cents == null ? "" : (purchase.price_cents / 100).toFixed(2),
    referenceNumber: purchase?.reference_number ?? "", notes: purchase?.notes ?? ""
  });
  const formRef = useRef<HTMLFormElement>(null);
  const chooserRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  function setField(name: keyof typeof inputValues, value: string) {
    if (enableScanning) { setInputValues((previous) => ({ ...previous, [name]: value })); return; }
    const input = formRef.current?.elements.namedItem(name) as HTMLInputElement | null;
    if (input) input.value = value;
  }
  function applySuggestions(result: ReceiptSuggestions) {
    setSuggestions(result);
    setInputValues((previous) => ({ ...previous,
      sellerName: previous.sellerName || result.seller?.value || "",
      purchaseDate: previous.purchaseDate || result.purchaseDate?.value || "",
      referenceNumber: previous.referenceNumber || result.referenceNumber?.value || ""
    }));
  }
  function chooseProduct(index: number) {
    const product = suggestions?.products[index];
    if (!product) return;
    if (!priceTouched) setAutoPrice(product.amountCents !== null);
    setInputValues((previous) => ({ ...previous, productName: product.name,
      price: priceTouched ? previous.price : product.amountCents === null ? "" : (product.amountCents / 100).toFixed(2) }));
  }
  function submit(form: FormData) {
    if (file) { form.delete("receipt"); form.set("receipt", file); }
    formAction(form);
  }
  const values = state.values;
  const retryingReceipt = enableScanning && Boolean(state.savedPurchaseId);
  return <form ref={formRef} key={enableScanning ? undefined : state.attempt ?? 0} action={enableScanning ? submit : formAction} className="space-y-6 rounded-3xl border border-slate-200 bg-white p-6 sm:p-8">
    {state.error && <p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-950">{state.error}</p>}
    {state.savedPurchaseId && <p className="rounded-xl bg-teal-50 p-4 text-sm text-teal-950">Pirkinys jau išsaugotas. <Link href={`/purchases/${state.savedPurchaseId}`} className="font-semibold underline">Atidaryti pirkinį</Link>. Galite dar kartą bandyti įkelti čekį. Pirkinio duomenis keiskite jo puslapyje.</p>}
    {enableScanning && <>
      <input type="hidden" name="draftId" value={draftIds?.purchase ?? ""} /><input type="hidden" name="documentId" value={draftIds?.document ?? ""} />
      <input type="hidden" name="withReceipt" value={file ? "1" : "0"} />
      <div className="flex flex-wrap gap-3" role="group" aria-label="Duomenų įvedimo būdas">
        <button type="button" onClick={() => setMode("scan")} aria-pressed={mode === "scan"} className="min-h-12 rounded-xl border border-teal-700 px-5 font-semibold text-teal-900">Nuskaityti čekį</button>
        <button type="button" onClick={() => setMode("manual")} aria-pressed={mode === "manual"} className="min-h-12 rounded-xl border border-teal-700 px-5 font-semibold text-teal-900">Įvesti ranka</button>
      </div>
      {mode === "manual" && file && <div className="rounded-xl bg-teal-50 p-4 text-sm text-teal-950">
        <p>Pasirinktas čekis „{file.name}“ bus išsaugotas kaip pirkimo įrodymas.</p>
        <button type="button" onClick={() => { setFile(null); setSuggestions(null); if (chooserRef.current) chooserRef.current.value = ""; if (cameraRef.current) cameraRef.current.value = ""; }} className="mt-2 min-h-11 font-semibold underline focus-visible:ring-2 focus-visible:ring-teal-600">Pašalinti čekį</button>
      </div>}
      {mode === "scan" && <div className="space-y-4 rounded-2xl bg-slate-50 p-4">
        <div className="flex flex-wrap gap-3">
          <label className="inline-flex min-h-12 cursor-pointer items-center rounded-xl border border-teal-700 bg-white px-4 text-sm font-semibold text-teal-900 focus-within:ring-2 focus-within:ring-teal-600">Pasirinkite čekį<input ref={chooserRef} name="receipt" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,.heic,.heif" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setSuggestions(null); if (cameraRef.current) cameraRef.current.value = ""; }} className="sr-only" /></label>
          <label className="inline-flex min-h-12 cursor-pointer items-center rounded-xl border border-teal-700 bg-white px-4 text-sm font-semibold text-teal-900 focus-within:ring-2 focus-within:ring-teal-600">Fotografuoti čekį<input ref={cameraRef} name="receipt" type="file" accept="image/*" capture="environment" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setSuggestions(null); if (chooserRef.current) chooserRef.current.value = ""; }} className="sr-only" /></label>
        </div>
        <p className="break-all text-sm text-slate-700" role="status">{file?.name ?? "Failas nepasirinktas"}</p>
        <p className="text-xs text-slate-600">Iki išsaugojimo duomenys lieka šiame įrenginyje. Uždarius puslapį neišsaugoti pakeitimai dings.</p>
        {retryingReceipt ? <p className="text-sm text-slate-700">Čekis bus pridėtas prie jau išsaugoto pirkinio. Jo duomenis galite keisti pirkinio puslapyje.</p> : <ReceiptScanner file={file} onResult={applySuggestions} />}
        {!retryingReceipt && suggestions && <div className="space-y-3"><p className="font-semibold">Pasirinkite vieną prekę arba įrašykite ją patys.</p>
          {suggestions.products.map((product, index) => <button type="button" key={`${product.source}-${index}`} onClick={() => chooseProduct(index)} className="block min-h-11 w-full rounded-xl border border-slate-300 bg-white p-3 text-left text-sm focus-visible:ring-2 focus-visible:ring-teal-600">{product.name}{product.amountCents !== null ? ` · ${(product.amountCents / 100).toFixed(2)} EUR` : ""}{product.warning ? ` · ${product.warning}` : ""}</button>)}
        </div>}
      </div>}
    </>}
    <fieldset disabled={retryingReceipt} className="space-y-6"><legend className="sr-only">Pirkinio duomenys</legend>
    <label className="block text-sm font-semibold">Ką pirkote? <span aria-hidden="true">*</span><input name="productName" required maxLength={200} value={enableScanning ? inputValues.productName : undefined} defaultValue={enableScanning ? undefined : values?.productName ?? purchase?.product_name} onChange={enableScanning ? (event) => { setField("productName", event.target.value); if (autoPrice && !priceTouched) { setField("price", ""); setAutoPrice(false); } } : undefined} placeholder="Sony WH-1000XM6" className={field} /></label>
    <label className="block text-sm font-semibold">Pardavėjas <span aria-hidden="true">*</span><input name="sellerName" required maxLength={200} value={enableScanning ? inputValues.sellerName : undefined} defaultValue={enableScanning ? undefined : values?.sellerName ?? purchase?.seller_name} onChange={enableScanning ? (event) => setField("sellerName", event.target.value) : undefined} placeholder="Topo Centras" className={field} /></label>
    <label className="block text-sm font-semibold">Kada pirkote? <span aria-hidden="true">*</span><input name="purchaseDate" type="date" required max={todayInVilnius()} value={enableScanning ? inputValues.purchaseDate : undefined} defaultValue={enableScanning ? undefined : values?.purchaseDate ?? purchase?.purchase_date} onChange={enableScanning ? (event) => setField("purchaseDate", event.target.value) : undefined} className={field} /></label>
    <label className="block text-sm font-semibold">Kaip pirkote? <span aria-hidden="true">*</span><select name="purchaseChannel" value={channel} onChange={(event) => setChannel(event.target.value as typeof channel)} className={field}>{purchaseChannels.map((value) => <option value={value} key={value}>{channelLabels[value]}</option>)}</select></label>
    {channel === "DISTANCE" && <label className="block text-sm font-semibold">Kada gavote prekę?<input name="receivedDate" type="date" max={todayInVilnius()} value={enableScanning ? inputValues.receivedDate : undefined} defaultValue={enableScanning ? undefined : values?.receivedDate ?? purchase?.received_date ?? ""} onChange={enableScanning ? (event) => setField("receivedDate", event.target.value) : undefined} className={field} /><span className="mt-1 block text-xs font-normal text-slate-500">Jei neprisimenate, palikite tuščią.</span></label>}
    <label className="block text-sm font-semibold">Kaina <span className="font-normal">(EUR, nebūtina)</span><input name="price" inputMode="decimal" value={enableScanning ? inputValues.price : undefined} defaultValue={enableScanning ? undefined : values?.price ?? (purchase?.price_cents == null ? "" : (purchase.price_cents / 100).toFixed(2))} onChange={enableScanning ? (event) => { setField("price", event.target.value); setPriceTouched(true); setAutoPrice(false); } : undefined} placeholder="399,99" className={field} /></label>
    <label className="block text-sm font-semibold">Užsakymo / čekio numeris<input name="referenceNumber" maxLength={200} value={enableScanning ? inputValues.referenceNumber : undefined} defaultValue={enableScanning ? undefined : values?.referenceNumber ?? purchase?.reference_number ?? ""} onChange={enableScanning ? (event) => setField("referenceNumber", event.target.value) : undefined} className={field} /></label>
    <label className="block text-sm font-semibold">Pastabos<textarea name="notes" rows={4} maxLength={2000} value={enableScanning ? inputValues.notes : undefined} defaultValue={enableScanning ? undefined : values?.notes ?? purchase?.notes ?? ""} onChange={enableScanning ? (event) => setField("notes", event.target.value) : undefined} placeholder="Pirkta su 3 metų komercine garantija." className={field} /></label>
    </fieldset>
    {!(retryingReceipt && !file) && <SubmitButton label={retryingReceipt ? "Pakartoti čekio įkėlimą" : enableScanning && file ? "Išsaugoti pirkinį ir čekį" : submitLabel} />}
  </form>;
}
