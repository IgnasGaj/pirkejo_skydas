import Link from "next/link";
import { signOut } from "@/app/login/actions";
export default function CasesLayout({ children }: { children: React.ReactNode }) {
  return <><header className="mx-auto flex max-w-5xl items-center justify-between gap-4 border-b border-slate-200 px-5 py-5 sm:px-8"><Link href="/" className="font-bold text-teal-950">Pirkėjo Skydas</Link><nav className="flex flex-wrap items-center gap-4 text-sm font-semibold"><Link href="/purchases" className="text-teal-800">Mano pirkiniai</Link><Link href="/cases" className="text-teal-800">Mano kreipimaisi</Link><form action={signOut}><button type="submit" className="text-slate-600 hover:text-slate-950">Atsijungti</button></form></nav></header>{children}</>;
}
