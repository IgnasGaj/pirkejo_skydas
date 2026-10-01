"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { loginSchema, registrationSchema } from "@/features/purchases/domain/validation";
import { safeReturnPath } from "@/features/purchases/data/auth";

function destination(formData: FormData) { return safeReturnPath(String(formData.get("next") ?? "")); }
function loginUrl(next: string, state: string) { return `/login?next=${encodeURIComponent(next)}&state=${state}`; }

export async function signIn(formData: FormData) {
  const next = destination(formData);
  if (!isSupabaseConfigured()) redirect(loginUrl(next, "unavailable"));
  const input = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!input.success) redirect(loginUrl(next, "invalid"));
  const client = await createClient();
  const { error } = await client.auth.signInWithPassword(input.data);
  if (error) redirect(loginUrl(next, "signin-error"));
  redirect(next);
}

export async function register(formData: FormData) {
  const next = destination(formData);
  if (!isSupabaseConfigured()) redirect(loginUrl(next, "unavailable"));
  const input = registrationSchema.safeParse({
    email: formData.get("email"), password: formData.get("password"), confirmPassword: formData.get("confirmPassword")
  });
  if (!input.success) redirect(loginUrl(next, "registration-invalid"));
  const origin = (await headers()).get("origin") ?? "http://localhost:3000";
  const client = await createClient();
  const { data, error } = await client.auth.signUp({
    email: input.data.email, password: input.data.password,
    options: { emailRedirectTo: new URL("/auth/confirm", origin).toString() }
  });
  if (error) redirect(loginUrl(next, "registration-error"));
  if (!data.session) redirect(loginUrl(next, "check-email"));
  redirect(next);
}

export async function signOut() {
  if (isSupabaseConfigured()) {
    const client = await createClient();
    await client.auth.signOut();
  }
  redirect("/");
}
