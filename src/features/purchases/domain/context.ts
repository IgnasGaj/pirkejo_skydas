import type { Purchase } from "./types";

export function usablePurchaseContext(purchase: Purchase | null, authenticatedUserId: string | null) {
  return purchase && authenticatedUserId && purchase.user_id === authenticatedUserId ? purchase : null;
}

export async function resolvePurchaseContext(
  purchaseId: string | undefined, authenticatedUserId: string | null,
  load: (id: string, userId: string) => Promise<Purchase | null>
) {
  if (!purchaseId || !authenticatedUserId) return null;
  return usablePurchaseContext(await load(purchaseId, authenticatedUserId), authenticatedUserId);
}
