"use client";

import { useState } from "react";

export function ConfirmDelete({ action, label, title, description }: { action: () => void | Promise<void>; label: string; title: string; description: string }) {
  const [open, setOpen] = useState(false);
  return <div><button type="button" onClick={() => setOpen(true)} className="min-h-12 rounded-xl border border-red-300 px-4 font-semibold text-red-800 focus-visible:ring-2 focus-visible:ring-red-600">{label}</button>
    {open && <div role="dialog" aria-modal="true" aria-labelledby="delete-title" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-5"><div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"><h2 id="delete-title" className="text-xl font-bold">{title}</h2><p className="mt-3 text-sm leading-6 text-slate-700">{description}</p><div className="mt-6 flex flex-wrap gap-3"><button type="button" onClick={() => setOpen(false)} className="min-h-12 rounded-xl border border-slate-300 px-5 font-semibold">Atšaukti</button><form action={action}><button type="submit" className="min-h-12 rounded-xl bg-red-700 px-5 font-semibold text-white">Ištrinti</button></form></div></div></div>}
  </div>;
}
