"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { ReceiptScanner } from "./ReceiptScanner";
import type { ReceiptSuggestions } from "../domain/types";
import type { Purchase, PurchaseDocument } from "@/features/purchases/domain/types";
import type { CorrectionState } from "../data/actions";

const names = ["productName", "sellerName", "purchaseDate", "price", "referenceNumber"] as const;
type Name = typeof names[number];
const labels: Record<Name, string> = { productName: "Prekė", sellerName: "Pardavėjas", purchaseDate: "Pirkimo data", price: "Prekės kaina (EUR)", referenceNumber: "Čekio numeris" };
const fieldClass = "mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base focus-visible:ring-2 focus-visible:ring-teal-600";

function SaveButton() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className="min-h-12 rounded-xl bg-teal-800 px-5 font-semibold text-white disabled:opacity-60">{pending ? "Saugoma…" : "Pritaikyti pasirinktus pakeitimus"}</button>;
}

export function ExistingReceiptScanner({ purchase, document, action }: { purchase: Purchase; document: PurchaseDocument; action: (state: CorrectionState, form: FormData) => Promise<CorrectionState> }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [suggestions, setSuggestions] = useState<ReceiptSuggestions | null>(null);
  const [proposed, setProposed] = useState<Record<Name, string>>({ productName: "", sellerName: "", purchaseDate: "", price: "", referenceNumber: "" });
  const [state, formAction] = useActionState(action, { error: null });
  const current: Record<Name, string> = {
    productName: purchase.product_name, sellerName: purchase.seller_name, purchaseDate: purchase.purchase_date,
    price: purchase.price_cents == null ? "" : (purchase.price_cents / 100).toFixed(2), referenceNumber: purchase.reference_number ?? ""
  };

  async function load() {
    setOpen(true); setLoading(true); setError("");
    try {
      const response = await fetch(`/api/purchases/${purchase.id}/documents/${document.id}/image`, { cache: "no-store" });
      if (!response.ok) throw new Error("unavailable");
      const size = Number(response.headers.get("Content-Length"));
      if (!Number.isFinite(size) || size <= 0 || size > 15 * 1024 * 1024 || size !== document.size_bytes) throw new Error("unavailable");
      const blob = await response.blob();
      if (blob.size !== size || blob.type !== document.mime_type) throw new Error("unavailable");
      setFile(new File([blob], document.original_filename, { type: document.mime_type }));
    } catch { setError("Čekis nepasiekiamas. Atnaujinkite puslapį ir bandykite dar kartą."); }
    finally { setLoading(false); }
  }
  function onResult(result: ReceiptSuggestions) {
    setSuggestions(result);
    setProposed((previous) => ({ ...previous,
      sellerName: previous.sellerName || result.seller?.value || "",
      purchaseDate: previous.purchaseDate || result.purchaseDate?.value || "",
      referenceNumber: previous.referenceNumber || result.referenceNumber?.value || ""
    }));
  }
  return <div className="mt-4 border-t border-slate-200 pt-4">
    {!open ? <button type="button" onClick={load} className="min-h-12 rounded-xl border border-teal-700 px-4 font-semibold text-teal-900">Nuskaityti čekį</button> :
      <div className="space-y-4"><button type="button" onClick={() => { setOpen(false); setFile(null); setSuggestions(null); }} className="min-h-11 font-semibold text-teal-800 underline">Uždaryti nuskaitymą</button>
        {loading && <p role="status">Įkeliamas privatus čekis…</p>}
        {error && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm">{error}</p>}
        <ReceiptScanner file={file} onResult={onResult} />
        {suggestions && <form action={formAction} className="space-y-5 rounded-xl bg-slate-50 p-4">
          <input type="hidden" name="updatedAt" value={purchase.updated_at} />
          <p className="font-semibold">Nuskaitytus duomenis patikrinkite prieš išsaugodami. Pažymėkite tik norimus pakeitimus.</p>
          {state.error && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm">{state.error}</p>}
          {suggestions.products.length > 0 && <div><p className="text-sm font-semibold">Galimos prekės</p>{suggestions.products.map((product, index) =>
            <button type="button" key={`${product.source}-${index}`} onClick={() => setProposed((previous) => ({ ...previous, productName: product.name, price: product.amountCents == null ? previous.price : (product.amountCents / 100).toFixed(2) }))} className="mt-2 block min-h-11 w-full rounded-xl border border-slate-300 bg-white p-3 text-left text-sm">{product.name}{product.amountCents == null ? "" : ` · ${(product.amountCents / 100).toFixed(2)} EUR`}{product.warning ? ` · ${product.warning}` : ""}</button>)}</div>}
          {names.map((name) => <div key={name} className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-sm text-slate-600">Dabar: {labels[name]} — <strong>{current[name] || "Neįvesta"}</strong></p>
            <label className="mt-2 block text-sm font-semibold">Siūloma: {labels[name]}<input name={name} type={name === "purchaseDate" ? "date" : "text"} inputMode={name === "price" ? "decimal" : undefined} value={proposed[name]} onChange={(event) => setProposed((previous) => ({ ...previous, [name]: event.target.value }))} className={fieldClass} /></label>
            <label className="mt-3 flex min-h-11 items-center gap-3 text-sm font-semibold"><input type="checkbox" name="apply" value={name} className="size-5" /> Pritaikyti šį pakeitimą</label>
          </div>)}
          <SaveButton />
        </form>}
      </div>}
  </div>;
}
