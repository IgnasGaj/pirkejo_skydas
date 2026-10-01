import "server-only";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/supabase/server";

export function safeReturnPath(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/purchases";
  const path = value.split(/[?#]/, 1)[0];
  return path === "/purchases" || /^\/purchases\/(new|[0-9a-f-]{36}(?:\/edit)?)$/.test(path) ? path : "/purchases";
}

export async function requirePurchaseUser(returnPath: string) {
  const user = await getAuthenticatedUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(safeReturnPath(returnPath))}`);
  return user;
}
