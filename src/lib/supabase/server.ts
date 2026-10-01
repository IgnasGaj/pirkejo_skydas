import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";

export function isSupabaseConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(values) {
          try { values.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); }
          catch { /* Middleware refreshes cookies for Server Components. */ }
        }
      }
    }
  );
}

export async function getAuthenticatedUser() {
  if (!isSupabaseConfigured()) return null;
  const client = await createClient();
  const { data: { user }, error } = await client.auth.getUser();
  return error ? null : user;
}
