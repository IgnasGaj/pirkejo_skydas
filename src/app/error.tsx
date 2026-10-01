"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="mx-auto max-w-xl px-5 py-16"><h1 className="text-2xl font-bold">Nepavyko įkelti puslapio</h1><p className="mt-3 text-slate-600">Bandykite dar kartą.</p><button onClick={reset} className="mt-6 min-h-12 rounded-xl bg-teal-800 px-5 font-semibold text-white">Bandyti dar kartą</button></main>;
}
