"use client";

export default function PurchaseError({ reset }: { error: Error; reset: () => void }) {
  return <main className="mx-auto max-w-4xl px-5 py-10"><h1 className="text-2xl font-bold">Duomenys laikinai nepasiekiami</h1><p className="mt-3">Nepavyko įkelti pirkinio arba dokumentų istorijos. Bandykite dar kartą.</p><button type="button" onClick={reset} className="mt-5 min-h-12 rounded-xl bg-teal-800 px-5 font-semibold text-white">Bandyti dar kartą</button></main>;
}
