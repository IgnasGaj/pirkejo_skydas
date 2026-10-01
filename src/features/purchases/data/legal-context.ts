import "server-only";
import { z } from "zod";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { getPurchaseById } from "./purchases";
import { resolvePurchaseContext } from "../domain/context";

export async function loadAccessiblePurchaseContext(purchaseId?: string) {
  if (!purchaseId || !z.uuid().safeParse(purchaseId).success) return null;
  const user = await getAuthenticatedUser();
  if (!user) return null;
  try {
    const client = await createClient();
    return resolvePurchaseContext(purchaseId, user.id, (id, userId) => getPurchaseById(client, userId, id));
  } catch {
    return null;
  }
}
