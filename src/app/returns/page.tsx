import { ReturnWizard } from "@/features/returns/components/ReturnWizard";
import { loadAccessiblePurchaseContext } from "@/features/purchases/data/legal-context";
import { PurchaseContextCard } from "@/features/purchases/components/PurchaseContextCard";

export default async function ReturnsPage({ searchParams }: { searchParams: Promise<{ purchaseId?: string }> }) {
  const purchase = await loadAccessiblePurchaseContext((await searchParams).purchaseId);
  return <main className="min-h-screen px-5 pb-20 pt-7 sm:px-8 sm:pt-12"><div className="mx-auto max-w-3xl">{purchase && <PurchaseContextCard purchase={purchase} />}<ReturnWizard purchaseId={purchase?.id} purchase={purchase && { purchase_date: purchase.purchase_date, received_date: purchase.received_date, purchase_channel: purchase.purchase_channel }} /></div></main>;
}
