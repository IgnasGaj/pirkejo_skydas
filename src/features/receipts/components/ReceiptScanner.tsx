"use client";

import { useEffect, useRef, useState } from "react";
import { todayInVilnius } from "@/lib/date";
import { ReceiptOcrSession, scanFallback, scanTypes } from "../client/ocr";
import { parseReceiptText } from "../domain/parseReceiptText";
import type { ReceiptSuggestions } from "../domain/types";

const statusText: Record<string, string> = {
  "loading tesseract core": "Ruošiamas atpažinimas", "loading language traineddata": "Įkeliamos kalbos",
  "initializing tesseract": "Ruošiamas tekstas", "recognizing text": "Atpažįstamas tekstas"
};

export function ReceiptScanner({ file, onResult }: { file: File | null; onResult: (result: ReceiptSuggestions) => void }) {
  const session = useRef<ReceiptOcrSession | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [stage, setStage] = useState<"idle" | "preparing" | "reading" | "review" | "failed" | "cancelled">("idle");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<ReceiptSuggestions | null>(null);
  const [confidence, setConfidence] = useState<number | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const runId = useRef(0);
  if (!session.current) session.current = new ReceiptOcrSession();

  useEffect(() => {
    runId.current++;
    session.current?.cancel();
    setStage("idle"); setProgress(0); setResult(null); setConfidence(null); setMessage("");
    if (!file || !scanTypes.includes(file.type)) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => () => session.current?.cancel(), []);
  useEffect(() => { if (stage === "failed") errorRef.current?.focus(); }, [stage]);

  async function start() {
    if (!file) return;
    const run = ++runId.current;
    setStage("preparing"); setProgress(0); setMessage("Ruošiamas nuskaitymas"); setResult(null);
    try {
      const output = await session.current!.scan(file, ({ status, progress }) => {
        if (run !== runId.current) return;
        setStage(status === "recognizing text" ? "reading" : "preparing");
        setMessage(statusText[status] ?? "Ruošiamas nuskaitymas");
        setProgress(Math.round(progress * 100));
      });
      if (run !== runId.current) return;
      const parsed = parseReceiptText(output.text, todayInVilnius());
      setResult(parsed); setConfidence(output.confidence); setStage("review"); onResult(parsed);
    } catch (error) {
      if (run !== runId.current) return;
      const reason = error instanceof Error ? error.message : "";
      if (reason === "cancelled") { setStage("cancelled"); return; }
      setStage("failed");
      setMessage(reason === "too-many-pixels" ? "Nuotrauka per didelė nuskaitymui (daugiau nei 20 megapikselių). Galite įvesti duomenis ranka." :
        reason === "timeout" ? "Nuskaitymas viršijo 90 sekundžių. Bandykite dar kartą arba įveskite duomenis ranka." :
        "Nepavyko nuskaityti nuotraukos. Bandykite dar kartą arba įveskite duomenis ranka.");
    }
  }
  if (!file) return null;
  if (!scanTypes.includes(file.type)) return <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-950">{scanFallback}</p>;
  return <section className="space-y-4" aria-label="Čekio nuskaitymas">
    {preview && <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={preview} alt="Pasirinkto čekio peržiūra" className="max-h-80 w-full object-contain" />
    </div>}
    <div className="flex flex-wrap gap-3">
      <button type="button" onClick={start} disabled={stage === "preparing" || stage === "reading"} className="min-h-12 rounded-xl bg-teal-800 px-5 font-semibold text-white disabled:opacity-60">Nuskaityti</button>
      {(stage === "preparing" || stage === "reading") && <button type="button" onClick={() => { runId.current++; session.current?.cancel(); setStage("cancelled"); }} className="min-h-12 rounded-xl border border-slate-400 px-5 font-semibold">Atšaukti</button>}
    </div>
    {(stage === "preparing" || stage === "reading") && <div role="status" aria-live="polite"><p>{message} {progress > 0 ? `${progress} %` : ""}</p><progress max="100" value={progress} className="w-full" aria-label="Nuskaitymo eiga" /></div>}
    {stage === "failed" && <p role="alert" ref={errorRef} tabIndex={-1} className="rounded-xl bg-amber-50 p-4 text-sm text-amber-950">{message}</p>}
    {stage === "cancelled" && <p role="status">Nuskaitymas atšauktas. Duomenis galite įvesti ranka.</p>}
    {result && <div className="space-y-3"><p className="font-semibold">Nuskaitytus duomenis patikrinkite prieš išsaugodami.</p>
      {confidence !== null && <p className="text-xs text-slate-600">Teksto atpažinimo tikrumas: {Math.round(confidence)} %. Atskirų laukų tikrumas nenustatomas.</p>}
      {result.warnings.map((warning, index) => <p key={index} className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">{warning}</p>)}
      {result.receiptTotal && <p>Bendra čekio suma: <strong>{(result.receiptTotal.value / 100).toFixed(2)} EUR</strong></p>}
      <details className="rounded-xl border border-slate-200 p-3"><summary className="cursor-pointer font-semibold">Nuskaitytas tekstas</summary><pre className="mt-3 whitespace-pre-wrap break-words text-xs">{result.rawText}</pre></details>
    </div>}
  </section>;
}
