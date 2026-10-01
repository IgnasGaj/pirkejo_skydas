"use client";

import { useState } from "react";
import type { Purchase } from "../domain/types";
import { channelLabels, purchaseChannels } from "../domain/types";
import { todayInVilnius } from "../domain/validation";

const field = "mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600";

export function PurchaseForm({ action, purchase, submitLabel }: { action: (form: FormData) => void | Promise<void>; purchase?: Purchase; submitLabel: string }) {
  const [channel, setChannel] = useState(purchase?.purchase_channel ?? "UNKNOWN");
  return <form action={action} className="space-y-6 rounded-3xl border border-slate-200 bg-white p-6 sm:p-8">
    <label className="block text-sm font-semibold">Ką pirkote? <span aria-hidden="true">*</span><input name="productName" required maxLength={200} defaultValue={purchase?.product_name} placeholder="Sony WH-1000XM6" className={field} /></label>
    <label className="block text-sm font-semibold">Pardavėjas <span aria-hidden="true">*</span><input name="sellerName" required maxLength={200} defaultValue={purchase?.seller_name} placeholder="Topo Centras" className={field} /></label>
    <label className="block text-sm font-semibold">Kada pirkote? <span aria-hidden="true">*</span><input name="purchaseDate" type="date" required max={todayInVilnius()} defaultValue={purchase?.purchase_date} className={field} /></label>
    <label className="block text-sm font-semibold">Kaip pirkote? <span aria-hidden="true">*</span><select name="purchaseChannel" value={channel} onChange={(event) => setChannel(event.target.value as typeof channel)} className={field}>{purchaseChannels.map((value) => <option value={value} key={value}>{channelLabels[value]}</option>)}</select></label>
    {channel === "DISTANCE" && <label className="block text-sm font-semibold">Kada gavote prekę?<input name="receivedDate" type="date" min={undefined} max={todayInVilnius()} defaultValue={purchase?.received_date ?? ""} className={field} /><span className="mt-1 block text-xs font-normal text-slate-500">Jei neprisimenate, palikite tuščią.</span></label>}
    <label className="block text-sm font-semibold">Kaina <span className="font-normal">(EUR, nebūtina)</span><input name="price" inputMode="decimal" defaultValue={purchase?.price_cents == null ? "" : (purchase.price_cents / 100).toFixed(2)} placeholder="399,99" className={field} /></label>
    <label className="block text-sm font-semibold">Užsakymo / čekio numeris<input name="referenceNumber" maxLength={200} defaultValue={purchase?.reference_number ?? ""} className={field} /></label>
    <label className="block text-sm font-semibold">Pastabos<textarea name="notes" rows={4} maxLength={2000} defaultValue={purchase?.notes ?? ""} placeholder="Pirkta su 3 metų komercine garantija." className={field} /></label>
    <button type="submit" className="min-h-12 w-full rounded-xl bg-teal-800 px-5 font-semibold text-white hover:bg-teal-900 focus-visible:ring-2 focus-visible:ring-teal-600 sm:w-auto">{submitLabel}</button>
  </form>;
}
