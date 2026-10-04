"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePurchaseUser } from "@/features/purchases/data/auth";

export async function createCaseAction(versionId: string) {
  if (!z.uuid().safeParse(versionId).success) redirect("/purchases");
  const user = await requirePurchaseUser("/purchases");
  const client = await createClient();
  const { data: version, error: readError } = await client.from("complaint_versions").select("id,purchase_id").eq("id", versionId).eq("user_id", user.id).maybeSingle();
  if (readError) throw new Error("Nepavyko patikrinti dokumento versijos.");
  if (!version) redirect("/purchases");
  const { data, error } = await client.rpc("create_tracked_case", { p_version_id: versionId, p_request_id: crypto.randomUUID() });
  if (error) throw new Error("Nepavyko pradėti kreipimosi sekimo. Bandykite dar kartą.");
  revalidatePath("/cases");
  redirect(`/cases/${data.id}`);
}
