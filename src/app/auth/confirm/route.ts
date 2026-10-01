import { NextResponse, type NextRequest } from "next/server";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  if (!isSupabaseConfigured()) return NextResponse.redirect(new URL("/login?state=unavailable", url.origin));
  const client = await createClient();
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const result = code ? await client.auth.exchangeCodeForSession(code)
    : tokenHash && type === "email" ? await client.auth.verifyOtp({ token_hash: tokenHash, type: "email" })
    : { error: new Error("Missing confirmation token") };
  return NextResponse.redirect(new URL(result.error ? "/login?state=confirm-error" : "/purchases", url.origin));
}
