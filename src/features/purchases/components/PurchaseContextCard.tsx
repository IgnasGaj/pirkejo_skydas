import type { Purchase } from "../domain/types";

export function PurchaseContextCard({ purchase }: { purchase: Purchase }) {
  return <aside className="mx-auto mb-8 max-w-xl rounded-2xl border border-teal-200 bg-teal-50 p-5"><p className="font-bold text-teal-950">{purchase.product_name}</p><p className="mt-1 text-sm text-teal-900">{purchase.seller_name} · {purchase.purchase_date}</p><p className="mt-3 text-xs font-semibold text-teal-800">Naudojamas išsaugotas pirkinys</p></aside>;
}
