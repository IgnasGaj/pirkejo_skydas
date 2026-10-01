import "server-only";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { z } from "zod";

export function safeReturnPath(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/purchases";
  const path = value.split(/[?#]/, 1)[0];
  if (path === "/purchases/new" && value.includes("?")) {
    const params = new URLSearchParams(value.slice(path.length + 1).split("#", 1)[0]);
    const draft = params.get("draft");
    const document = params.get("document");
    if ([...params.keys()].length === 2 && z.uuid().safeParse(draft).success && z.uuid().safeParse(document).success) {
      return `${path}?draft=${draft}&document=${document}`;
    }
  }
  return path === "/purchases" || /^\/purchases\/(new|[0-9a-f-]{36}(?:\/edit)?)$/.test(path) ? path : "/purchases";
}

export async function requirePurchaseUser(returnPath: string) {
  const user = await getAuthenticatedUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(safeReturnPath(returnPath))}`);
  return user;
}
