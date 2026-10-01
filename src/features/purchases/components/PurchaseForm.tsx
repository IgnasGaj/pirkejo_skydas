"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type { Purchase } from "../domain/types";
import type { PurchaseFormState } from "../data/actions";
import { channelLabels, purchaseChannels } from "../domain/types";
import { todayInVilnius } from "@/lib/date";

const field = "mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className="min-h-12 w-full rounded-xl bg-teal-800 px-5 font-semibold text-white hover:bg-teal-900 focus-visible:ring-2 focus-visible:ring-teal-600 disabled:opacity-60 sm:w-auto">{pending ? "Saugoma…" : label}</button>;
}

export function PurchaseForm({ action, purchase, submitLabel }: { action: (state: PurchaseFormState, form: FormData) => Promise<PurchaseFormState>; purchase?: Purchase; submitLabel: string }) {
  const [channel, setChannel] = useState(purchase?.purchase_channel ?? "UNKNOWN");
  const [state, formAction] = useActionState(action, { error: null });
  const values = state.values;
  return <form key={state.attempt ?? 0} action={formAction} className="space-y-6 rounded-3xl border border-slate-200 bg-white p-6 sm:p-8">
    {state.error && <p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-950">{state.error}</p>}
    <label className="block text-sm font-semibold">Ką pirkote? <span aria-hidden="true">*</span><input name="productName" required maxLength={200} defaultValue={values?.productName ?? purchase?.product_name} placeholder="Sony WH-1000XM6" className={field} /></label>
    <label className="block text-sm font-semibold">Pardavėjas <span aria-hidden="true">*</span><input name="sellerName" required maxLength={200} defaultValue={values?.sellerName ?? purchase?.seller_name} placeholder="Topo Centras" className={field} /></label>
    <label className="block text-sm font-semibold">Kada pirkote? <span aria-hidden="true">*</span><input name="purchaseDate" type="date" required max={todayInVilnius()} defaultValue={values?.purchaseDate ?? purchase?.purchase_date} className={field} /></label>
    <label className="block text-sm font-semibold">Kaip pirkote? <span aria-hidden="true">*</span><select name="purchaseChannel" value={channel} onChange={(event) => setChannel(event.target.value as typeof channel)} className={field}>{purchaseChannels.map((value) => <option value={value} key={value}>{channelLabels[value]}</option>)}</select></label>
    {channel === "DISTANCE" && <label className="block text-sm font-semibold">Kada gavote prekę?<input name="receivedDate" type="date" min={undefined} max={todayInVilnius()} defaultValue={values?.receivedDate ?? purchase?.received_date ?? ""} className={field} /><span className="mt-1 block text-xs font-normal text-slate-500">Jei neprisimenate, palikite tuščią.</span></label>}
    <label className="block text-sm font-semibold">Kaina <span className="font-normal">(EUR, nebūtina)</span><input name="price" inputMode="decimal" defaultValue={values?.price ?? (purchase?.price_cents == null ? "" : (purchase.price_cents / 100).toFixed(2))} placeholder="399,99" className={field} /></label>
    <label className="block text-sm font-semibold">Užsakymo / čekio numeris<input name="referenceNumber" maxLength={200} defaultValue={values?.referenceNumber ?? purchase?.reference_number ?? ""} className={field} /></label>
    <label className="block text-sm font-semibold">Pastabos<textarea name="notes" rows={4} maxLength={2000} defaultValue={values?.notes ?? purchase?.notes ?? ""} placeholder="Pirkta su 3 metų komercine garantija." className={field} /></label>
    <SubmitButton label={submitLabel} />
  </form>;
}
