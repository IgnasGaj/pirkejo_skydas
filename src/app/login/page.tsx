import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { safeReturnPath } from "@/features/purchases/data/auth";
import { register, signIn } from "./actions";

const messages: Record<string, string> = {
  unavailable: "Prisijungimas šiuo metu nepasiekiamas.",
  invalid: "Įveskite el. paštą ir slaptažodį.",
  "signin-error": "Nepavyko prisijungti. Patikrinkite duomenis arba patvirtinkite el. paštą.",
  "registration-invalid": "Patikrinkite el. paštą ir slaptažodžius. Slaptažodį turi sudaryti bent 8 simboliai.",
  "registration-error": "Nepavyko sukurti paskyros. Bandykite dar kartą.",
  "confirm-error": "Patvirtinimo nuoroda nebegalioja. Bandykite registruotis dar kartą."
};

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; state?: string }> }) {
  const { next: requested, state } = await searchParams;
  const next = safeReturnPath(requested);
  if (await getAuthenticatedUser()) redirect(next);
  return <main className="mx-auto max-w-4xl px-5 py-10 sm:px-8"><Link href="/" className="font-semibold text-teal-900">← Pirkėjo Skydas</Link>
    <h1 className="mt-10 text-3xl font-bold text-slate-950">Mano pirkiniai</h1>
    {state === "check-email" ? <section className="mt-8 rounded-2xl border border-teal-200 bg-white p-6"><h2 className="text-xl font-bold">Patikrinkite el. paštą</h2><p className="mt-2 text-slate-600">Išsiuntėme paskyros patvirtinimo nuorodą.</p></section> : <>
      {state && messages[state] && <p role="alert" className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">{messages[state]}</p>}
      <div className="mt-8 grid gap-6 md:grid-cols-2"><section className="rounded-2xl border border-slate-200 bg-white p-6"><h2 className="text-xl font-bold">Prisijungti</h2><form action={signIn} className="mt-5 space-y-4"><input type="hidden" name="next" value={next} /><label className="block text-sm font-semibold">El. paštas<input name="email" type="email" autoComplete="email" required className="mt-2 w-full rounded-xl border border-slate-300 p-3" /></label><label className="block text-sm font-semibold">Slaptažodis<input name="password" type="password" autoComplete="current-password" required className="mt-2 w-full rounded-xl border border-slate-300 p-3" /></label><button className="min-h-12 w-full rounded-xl bg-teal-800 px-5 font-semibold text-white hover:bg-teal-900 focus-visible:ring-2 focus-visible:ring-teal-600">Prisijungti</button></form></section>
      <section className="rounded-2xl border border-slate-200 bg-white p-6"><h2 className="text-xl font-bold">Sukurti paskyrą</h2><form action={register} className="mt-5 space-y-4"><input type="hidden" name="next" value={next} /><label className="block text-sm font-semibold">El. paštas<input name="email" type="email" autoComplete="email" required className="mt-2 w-full rounded-xl border border-slate-300 p-3" /></label><label className="block text-sm font-semibold">Slaptažodis<input name="password" type="password" minLength={8} autoComplete="new-password" required className="mt-2 w-full rounded-xl border border-slate-300 p-3" /></label><label className="block text-sm font-semibold">Pakartokite slaptažodį<input name="confirmPassword" type="password" minLength={8} autoComplete="new-password" required className="mt-2 w-full rounded-xl border border-slate-300 p-3" /></label><button className="min-h-12 w-full rounded-xl bg-teal-800 px-5 font-semibold text-white hover:bg-teal-900 focus-visible:ring-2 focus-visible:ring-teal-600">Sukurti paskyrą</button></form></section></div></>}
  </main>;
}
