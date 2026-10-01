"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, CircleHelp, ExternalLink, RotateCcw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { legalSources } from "@/legal/sources";
import { evidenceCopy, infoCopy, resultCopy, stepCopy, warningCopy } from "../content/lt";
import { questions } from "../content/questions.lt";
import { evaluateDefectiveProductCase } from "../domain/evaluateDefectiveProductCase";
import { nextDefectiveStep, type DefectiveStep } from "../domain/flow";
import type { DefectiveDecisionResult, DefectiveProductCaseInput, RequestedRemedy } from "../domain/types";
import type { Purchase } from "@/features/purchases/domain/types";

function localToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
function displayDate(date: string): string {
  const [year, month, day] = date.split("-");
  return `${year}-${month}-${day}`;
}
function DecisionView({ decision, onBack, onRestart }: { decision: DefectiveDecisionResult; onBack: () => void; onRestart: () => void }) {
  const copy = resultCopy[decision.code];
  return <div className="space-y-5">
    <button type="button" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-teal-900" onClick={onBack}><ArrowLeft size={18} /> Grįžti</button>
    <section className="rounded-3xl border border-teal-100 bg-white p-6 shadow-sm sm:p-9">
      <div className="mb-5 inline-flex rounded-full bg-teal-50 p-3 text-teal-800"><ShieldCheck size={24} /></div>
      <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-teal-700">Pagal pateiktą informaciją</p>
      <h1 className="text-3xl font-bold leading-tight tracking-tight text-slate-950 sm:text-4xl">{copy.title}</h1>
      <p className="mt-4 text-base leading-7 text-slate-700">{copy.summary}</p>
      {decision.responseDeadline && <p className="mt-5 rounded-xl bg-teal-50 p-4 text-sm font-semibold text-teal-950">Atsakymo terminas: iki {displayDate(decision.responseDeadline)} imtinai.</p>}
      {decision.code === "CONTACT_SELLER_REPAIR_OR_REPLACE" && <Button className="mt-6" disabled aria-disabled="true">Paruošti pretenziją — netrukus</Button>}
      {(["SELLER_RESPONSE_OVERDUE", "VVTAT_ESCALATION_MAY_BE_AVAILABLE", "SECONDARY_REMEDIES_MAY_BE_AVAILABLE"] as string[]).includes(decision.code) && <a href={legalSources.VVTAT_CLAIMS.url} target="_blank" rel="noopener noreferrer" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-teal-800 px-4 py-3 text-sm font-semibold text-white hover:bg-teal-900">Kaip kreiptis į VVTAT <ExternalLink size={16} /></a>}
    </section>
    {decision.reasonIds.length > 0 && <section className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8"><h2 className="text-xl font-bold text-slate-950">Kodėl?</h2><p className="mt-3 text-sm leading-6 text-slate-700">{decision.statutoryPeriodEnd && decision.code !== "STATUTORY_LIABILITY_PERIOD_APPEARS_EXPIRED" ? `Įprastas pardavėjo atsakomybės laikotarpis pagal pateiktus duomenis baigiasi ${displayDate(decision.statutoryPeriodEnd)}.` : "Vertinimas remiasi jūsų atsakymais ir toliau nurodytais oficialiais šaltiniais."}</p></section>}
    {decision.infoBlockIds.map((id) => <section key={id} className="rounded-2xl border border-teal-100 bg-teal-50 p-5 sm:p-6"><h2 className="text-base font-bold text-teal-950">{infoCopy[id]?.title}</h2><p className="mt-2 text-sm leading-6 text-teal-950">{infoCopy[id]?.text}</p></section>)}
    {decision.warningIds.length > 0 && <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5"><h2 className="font-bold text-amber-950">Atkreipkite dėmesį</h2><div className="mt-2 space-y-2 text-sm leading-6 text-amber-950">{decision.warningIds.map((id) => <p key={id}>{warningCopy[id]}</p>)}</div></section>}
    {decision.nextStepIds.length > 0 && <section className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8"><h2 className="text-xl font-bold text-slate-950">Ką daryti dabar?</h2><ol className="mt-4 space-y-3">{decision.nextStepIds.map((id, index) => <li key={id} className="flex gap-3 text-sm leading-6 text-slate-700"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-50 text-xs font-bold text-teal-800">{index + 1}</span>{stepCopy[id]}</li>)}</ol></section>}
    {decision.evidenceIds.length > 0 && <section className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8"><h2 className="text-xl font-bold text-slate-950">Ką verta išsaugoti?</h2><p className="mt-2 text-sm text-slate-600">Šie dokumentai gali padėti įrodyti aplinkybes; ne visi būtini kiekvienoje situacijoje.</p><ul className="mt-4 space-y-2">{decision.evidenceIds.map((id) => <li className="flex gap-3 text-sm leading-6 text-slate-700" key={id}><Check size={17} className="mt-1 shrink-0 text-teal-700" />{evidenceCopy[id]}</li>)}</ul></section>}
    <section className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8"><h2 className="text-xl font-bold text-slate-950">Oficialūs šaltiniai</h2><ul className="mt-4 space-y-3">{decision.sourceIds.map((id) => <li key={id}><a href={legalSources[id].url} target="_blank" rel="noopener noreferrer" className="inline-flex items-start gap-2 text-sm font-medium leading-6 text-teal-800 underline decoration-teal-300 underline-offset-4 hover:text-teal-950">{legalSources[id].title}<ExternalLink size={15} className="mt-1 shrink-0" /></a></li>)}</ul></section>
    {process.env.NODE_ENV !== "production" && <section className="rounded-2xl bg-slate-900 p-5 font-mono text-xs leading-6 text-slate-100"><p className="font-bold text-teal-300">Sprendimo patikra</p><p className="mt-2">{decision.code}</p><p className="mt-2">Taisyklės: {decision.rulesTriggered.join(", ")}</p><p className="mt-2">Šaltiniai: {decision.sourceIds.join(", ")}</p></section>}
    <Button variant="outline" onClick={onRestart}><RotateCcw size={17} /> Pradėti iš naujo</Button>
  </div>;
}

export function DefectiveProductWizard({ purchase = null }: { purchase?: Pick<Purchase, "purchase_date" | "received_date" | "purchase_channel"> | null }) {
  const [answers, setAnswers] = useState<DefectiveProductCaseInput>(() => ({ asOfDate: localToday() }));
  const [history, setHistory] = useState<DefectiveProductCaseInput[]>([]);
  const [draft, setDraft] = useState("");
  const step = nextDefectiveStep(answers);
  const decision = step === null ? evaluateDefectiveProductCase(answers) : null;
  useEffect(() => {
    if (step === "deliveredAt" && purchase?.purchase_channel === "DISTANCE" && purchase.received_date && purchase.received_date <= answers.asOfDate) setDraft(purchase.received_date);
    else if (step === "purchasedAt" && purchase?.purchase_date && purchase.purchase_date <= answers.asOfDate) setDraft(purchase.purchase_date);
  }, [step, purchase, answers.asOfDate]);
  function save(next: DefectiveProductCaseInput) { setHistory((items) => [...items, answers]); setAnswers(next); setDraft(""); }
  function choose(current: DefectiveStep, value: string) {
    const next = { ...answers };
    if (current === "usedAgreement") next.usedGoodsLiabilityAgreement = { hasShortenedTerm: value === "UNKNOWN" ? null : value === "YES" };
    else if (current === "requestedRemedy") next.sellerClaim = { requestedRemedy: value as RequestedRemedy };
    else if (current === "hasCommercialGuarantee") next.hasCommercialGuarantee = value === "UNKNOWN" ? null : value === "YES";
    else if (current === "alternativeAccepted") next.alternativeAccepted = value === "UNKNOWN" ? null : value === "YES";
    else if (current === "defectDetectedAt") next.defectTimingClass = "UNKNOWN";
    else if (current === "purchasedAt") next.purchaseDateUnknown = true;
    else if (current === "claimReceivedAt") next.claimReceivedUnknown = true;
    else if (current === "usedMonths") next.usedTermUnknown = true;
    else Object.assign(next, { [current]: value });
    save(next);
  }
  function submitDate(current: DefectiveStep) {
    if (!draft) return;
    const next = { ...answers };
    if (current === "claimReceivedAt") next.sellerClaim = { ...answers.sellerClaim!, receivedAt: draft };
    else if (current === "usedMonths") next.usedGoodsLiabilityAgreement = { hasShortenedTerm: true, months: Number(draft) };
    else Object.assign(next, { [current]: draft });
    save(next);
  }
  function back() { const previous = history.at(-1); if (previous) { setAnswers(previous); setHistory((items) => items.slice(0, -1)); setDraft(""); } }
  function restart() { setAnswers({ asOfDate: localToday() }); setHistory([]); setDraft(""); }
  if (decision) return <DecisionView decision={decision} onBack={back} onRestart={restart} />;
  if (!step) return null;
  const question = step === "requestedRemedy" && answers.writtenSellerContact === "YES" ? { ...questions[step], title: "Ko prašėte pardavėjo?" } : questions[step];
  const numeric = step === "usedMonths";
  const date = ["deliveredAt", "defectDetectedAt", "purchasedAt", "claimReceivedAt"].includes(step);
  const unknownAllowed = ["usedMonths", "defectDetectedAt", "purchasedAt", "claimReceivedAt"].includes(step);
  const progress = Math.min(95, Math.round(history.length / 15 * 100));
  return <div className="mx-auto max-w-xl">
    <div className="mb-8 flex items-center justify-between"><button type="button" onClick={back} disabled={!history.length} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-teal-900 disabled:opacity-40"><ArrowLeft size={18} /> Grįžti</button><Link href="/" className="text-sm font-semibold text-teal-900">Pirkėjo Skydas</Link></div>
    <div className="mb-9"><div className="mb-3 flex items-center justify-between text-xs font-bold uppercase tracking-[0.16em] text-slate-500"><span>{history.length + 1} žingsnis</span><span>Jūsų situacija</span></div><div className="h-1.5 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-label="Patikros eiga" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><div className="h-full rounded-full bg-teal-700 transition-all" style={{ width: `${progress}%` }} /></div></div>
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-9"><div className="mb-5 inline-flex rounded-full bg-amber-50 p-3 text-amber-700"><CircleHelp size={24} /></div><h1 className="text-3xl font-bold leading-tight tracking-tight text-slate-950">{question.title}</h1>{question.hint && <p className="mt-4 text-sm leading-6 text-slate-600">{question.hint}</p>}
      {question.options ? <div className="mt-8 space-y-3">{question.options.map(({ value, label }) => <button type="button" key={value} onClick={() => choose(step, value)} className="group flex min-h-14 w-full items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-left transition hover:border-teal-600 hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"><span className="text-sm font-semibold text-slate-900">{label}</span><ArrowRight size={17} className="shrink-0 text-slate-400 group-hover:text-teal-700" /></button>)}</div> : <form className="mt-8" onSubmit={(event) => { event.preventDefault(); submitDate(step); }}><label className="mb-2 block text-sm font-semibold text-slate-700" htmlFor="defective-answer">{numeric ? "Mėnesių skaičius" : "Data"}</label><input id="defective-answer" type={numeric ? "number" : "date"} min={numeric ? 12 : step === "purchasedAt" ? undefined : step === "defectDetectedAt" || step === "claimReceivedAt" ? answers.deliveredAt : undefined} max={numeric ? 24 : step === "purchasedAt" ? answers.deliveredAt : answers.asOfDate} required value={draft} onChange={(event) => setDraft(event.target.value)} className="min-h-13 w-full rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600" /><Button type="submit" className="mt-5 w-full">Toliau <ArrowRight size={17} /></Button></form>}
      {unknownAllowed && <button type="button" onClick={() => choose(step, "UNKNOWN")} className="mt-5 text-sm font-semibold text-teal-800 underline underline-offset-4">Nežinau</button>}
    </div><p className="mt-6 text-center text-xs leading-5 text-slate-500">Atsakymas sudaromas pagal jūsų pateiktą informaciją ir oficialius šaltinius.</p>
  </div>;
}
