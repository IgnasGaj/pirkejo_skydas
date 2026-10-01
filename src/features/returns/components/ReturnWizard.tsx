"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, CircleHelp, ExternalLink, RotateCcw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getProductClarification, productCategories } from "../domain/categories";
import { evaluateReturnCase } from "../domain/evaluateReturnCase";
import type { DecisionResult, ReturnCaseInput } from "../domain/types";
import { legalSources } from "@/legal/sources";
import type { Purchase } from "@/features/purchases/domain/types";
import { todayInVilnius } from "@/lib/date";

type Step = "defective" | "defectClarification" | "buyer" | "seller" | "purchaseChannel" | "purchaseDate" | "deliveryDate" | "productCategory" | "productSubtype" | "used" | "appearanceIntact" | "purchaseEvidence" | "customMade" | "perishable" | "sealedHygiene" | "sealOpened" | "otherDistanceException" | "handlingLevel";

function nextStep(a: ReturnCaseInput): Step | null {
  if (!a.defective) return "defective";
  if (a.defective === "UNKNOWN") return "defectClarification";
  if (a.defective === "YES") return null;
  if (!a.buyer) return "buyer";
  if (a.buyer === "BUSINESS") return null;
  if (!a.seller) return "seller";
  if (a.seller !== "PROFESSIONAL") return null;
  if (!a.purchaseChannel) return "purchaseChannel";
  if (a.purchaseChannel === "PHYSICAL_STORE") {
    if (!a.purchaseDate) return "purchaseDate";
    const early = evaluateReturnCase(a);
    if (early.code === "PHYSICAL_RETURN_PERIOD_EXPIRED" || early.rulesTriggered.includes("INVALID_PURCHASE_DATE")) return null;
    if (!a.productCategory) return "productCategory";
    if (getProductClarification(a.productCategory) && !a.productSubtype) return "productSubtype";
    if (early.code === "SELLER_CONSENT_REQUIRED" || early.code === "CATEGORY_REVIEW_REQUIRED") return null;
    if (!a.used) return "used";
    if (a.used === "UNKNOWN") return null;
    if (!a.appearanceIntact) return "appearanceIntact";
    if (a.appearanceIntact === "UNKNOWN" || a.used === "YES" || a.appearanceIntact === "NO") return null;
    if (!a.purchaseEvidence) return "purchaseEvidence";
    return null;
  }
  if (!a.deliveryDate) return "deliveryDate";
  const early = evaluateReturnCase(a);
  if (early.rulesTriggered.includes("DISTANCE_STANDARD_PERIOD_EXPIRED") || early.rulesTriggered.includes("INVALID_DELIVERY_DATE")) return null;
  if (!a.customMade) return "customMade";
  if (a.customMade !== "NO") return null;
  if (!a.perishable) return "perishable";
  if (a.perishable !== "NO") return null;
  if (!a.sealedHygiene) return "sealedHygiene";
  if (a.sealedHygiene === "UNKNOWN") return null;
  if (a.sealedHygiene === "YES" && !a.sealOpened) return "sealOpened";
  if (a.sealedHygiene === "YES" && a.sealOpened !== "NO") return null;
  if (!a.otherDistanceException) return "otherDistanceException";
  if (a.otherDistanceException !== "NONE") return null;
  if (!a.handlingLevel) return "handlingLevel";
  return null;
}

const questions: Record<Exclude<Step, "productSubtype">, { title: string; hint?: string; options?: { label: string; value: string; detail?: string }[] }> = {
  defective: { title: "Ar prekė yra sugedusi arba nekokybiška?", options: [{ label: "Taip", value: "YES" }, { label: "Ne", value: "NO" }, { label: "Nežinau", value: "UNKNOWN" }] },
  defectClarification: { title: "Ar pastebėjote prekės trūkumą?", hint: "Trūkumas gali reikšti, kad prekė neveikia, yra pažeista arba neatitinka to, kas buvo pažadėta.", options: [{ label: "Prekė veikia tinkamai", value: "NO" }, { label: "Prekė turi trūkumą", value: "YES" }] },
  buyer: { title: "Kas įsigijo prekę?", options: [{ label: "Aš kaip privatus asmuo", value: "CONSUMER" }, { label: "Įmonė / individuali veikla verslo tikslais", value: "BUSINESS" }] },
  seller: { title: "Iš ko pirkote?", options: [{ label: "Parduotuvės / įmonės", value: "PROFESSIONAL" }, { label: "Privataus žmogaus", value: "PRIVATE" }, { label: "Nežinau", value: "UNKNOWN" }] },
  purchaseChannel: { title: "Kaip pirkote prekę?", hint: "Pirkiniams internetu ir fizinėse parduotuvėse taikomos skirtingos grąžinimo taisyklės.", options: [{ label: "Fizinėje parduotuvėje", value: "PHYSICAL_STORE", detail: "Pavyzdžiui, prekybos centre ar parduotuvėje." }, { label: "Internetu", value: "DISTANCE", detail: "Internetinėje parduotuvėje, programėlėje ar užsakant internetu." }] },
  purchaseDate: { title: "Kada įsigijote prekę?", hint: "Terminas paprastai skaičiuojamas nuo kitos dienos po pirkimo." },
  deliveryDate: { title: "Kada gavote prekę?", hint: "Svarbi prekės gavimo, o ne užsakymo data." },
  productCategory: { title: "Kokią prekę norite grąžinti?", options: productCategories.map(({ id, label }) => ({ label, value: id })) },
  used: { title: "Ar prekė buvo naudota?", options: [{ label: "Ne", value: "NO" }, { label: "Taip", value: "YES" }, { label: "Tik apžiūrėjau", value: "INSPECTED" }, { label: "Nežinau", value: "UNKNOWN" }] },
  appearanceIntact: { title: "Ar prekė išsaugojo prekinę išvaizdą ir nėra sugadinta?", options: [{ label: "Taip", value: "YES" }, { label: "Ne", value: "NO" }, { label: "Nežinau", value: "UNKNOWN" }] },
  purchaseEvidence: { title: "Ar turite įrodymą, kad pirkote iš šio pardavėjo?", options: [{ label: "Turiu čekį", value: "RECEIPT" }, { label: "Turiu sąskaitą faktūrą", value: "INVOICE" }, { label: "Mokėjau kortele ir turiu mokėjimo įrašą", value: "PAYMENT_RECORD" }, { label: "Turiu kitą pirkimą patvirtinantį dokumentą", value: "OTHER" }, { label: "Nieko neturiu", value: "NONE" }, { label: "Nežinau", value: "UNKNOWN" }] },
  customMade: { title: "Ar prekė buvo pagaminta arba aiškiai pritaikyta specialiai jums?", hint: "Pavyzdžiui, pagal jūsų išmatavimus arba su asmeniniu užrašu.", options: [{ label: "Taip", value: "YES" }, { label: "Ne", value: "NO" }, { label: "Nežinau", value: "UNKNOWN" }] },
  perishable: { title: "Ar prekė greitai genda arba jos galiojimo laikas labai trumpas?", options: [{ label: "Taip", value: "YES" }, { label: "Ne", value: "NO" }, { label: "Nežinau", value: "UNKNOWN" }] },
  sealedHygiene: { title: "Ar tai buvo užplombuota prekė, kurios dėl sveikatos ar higienos priežasčių negalima tinkamai grąžinti po atidarymo?", options: [{ label: "Taip", value: "YES" }, { label: "Ne", value: "NO" }, { label: "Nežinau", value: "UNKNOWN" }] },
  sealOpened: { title: "Ar apsauginė pakuotė / plomba buvo atidaryta?", options: [{ label: "Taip", value: "YES" }, { label: "Ne", value: "NO" }, { label: "Nežinau", value: "UNKNOWN" }] },
  otherDistanceException: { title: "Ar prekei gali būti taikoma kita išimtis?", hint: "Pavyzdžiui, atplėšta užplombuota programinė įranga ar pradėtas teikti skaitmeninis turinys su jūsų sutikimu.", options: [{ label: "Ne, nė viena netinka", value: "NONE" }, { label: "Atplėšiau užplombuotą laikmeną ar programinę įrangą", value: "SEALED_MEDIA_OR_SOFTWARE_OPENED" }, { label: "Pradėjau naudoti skaitmeninį turinį su sutikimu", value: "DIGITAL_CONTENT_STARTED_WITH_CONSENT" }, { label: "Gali būti kita išimtis", value: "OTHER_EXCEPTION" }, { label: "Nežinau", value: "UNKNOWN" }] },
  handlingLevel: { title: "Kaip apžiūrėjote ar naudojote prekę?", hint: "Vien pakuotės atidarymas paprastai nepanaikina atsisakymo teisės.", options: [{ label: "Neatidariau", value: "UNOPENED" }, { label: "Tik apžiūrėjau ar išbandžiau", value: "INSPECTED" }, { label: "Naudojau daugiau, nei būtina apžiūrai", value: "USED_BEYOND_INSPECTION" }, { label: "Nežinau", value: "UNKNOWN" }] }
};

function DecisionView({ decision, onBack, onRestart }: { decision: DecisionResult; onBack: () => void; onRestart: () => void }) {
  const [showSteps, setShowSteps] = useState(false);
  return <div className="animate-in fade-in space-y-6">
    <button className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-teal-900" onClick={onBack}><ArrowLeft size={18} /> Grįžti</button>
    <div className="rounded-3xl border border-teal-100 bg-white p-6 shadow-sm sm:p-9">
      <div className="mb-5 inline-flex rounded-full bg-teal-50 p-3 text-teal-800"><ShieldCheck size={24} /></div>
      <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-teal-700">Jūsų atsakymas</p>
      <h1 className="max-w-2xl text-3xl font-bold leading-tight tracking-tight text-slate-950 sm:text-4xl">{decision.title}</h1>
      <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">{decision.summary}</p>
      {decision.code === "DEFECT_FLOW_REQUIRED" && <div className="mt-6"><Button asChild><Link href="/defective-product">Tęsti sugedusios prekės patikrą <ArrowRight size={18} /></Link></Button></div>}
      {decision.nextSteps.length > 0 && decision.code === "PHYSICAL_RETURN_LIKELY_AVAILABLE" && <Button className="mt-6" onClick={() => { setShowSteps(true); document.getElementById("next-steps")?.scrollIntoView({ behavior: "smooth" }); }}>Ką daryti toliau? <ArrowRight size={18} /></Button>}
    </div>
    {decision.reasons.length > 0 && <section className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8"><h2 className="text-xl font-bold">Kodėl?</h2><ul className="mt-4 space-y-3">{decision.reasons.map(({ text }) => <li className="flex gap-3 text-sm leading-6 text-slate-700" key={text}><Check size={17} className="mt-1 shrink-0 text-teal-700" />{text}</li>)}</ul></section>}
    {decision.warnings.length > 0 && <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950">{decision.warnings.map((warning) => <p key={warning}>{warning.replace("POSSIBLE_DIMINISHED_VALUE: ", "")}</p>)}</section>}
    {decision.nextSteps.length > 0 && <section id="next-steps" className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8"><h2 className="text-xl font-bold">Ką daryti toliau?</h2><ol className="mt-4 space-y-3">{decision.nextSteps.map(({ text }, index) => <li className="flex gap-3 text-sm leading-6 text-slate-700" key={text}><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-50 text-xs font-bold text-teal-800">{index + 1}</span>{text}</li>)}</ol>{showSteps && <p className="sr-only">Tolimesni veiksmai parodyti.</p>}</section>}
    <section className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8"><h2 className="text-xl font-bold">Oficialūs šaltiniai</h2><ul className="mt-4 space-y-3">{decision.sourceIds.map((id) => <li key={id}><a href={legalSources[id].url} target="_blank" rel="noopener noreferrer" className="inline-flex items-start gap-2 text-sm font-medium leading-6 text-teal-800 underline decoration-teal-300 underline-offset-4 hover:text-teal-950">{legalSources[id].title}<ExternalLink size={15} className="mt-1 shrink-0" /></a></li>)}</ul></section>
    {process.env.NODE_ENV !== "production" && <section className="rounded-2xl bg-slate-900 p-5 font-mono text-xs leading-6 text-slate-100"><p className="font-bold text-teal-300">Development decision panel</p><p className="mt-3">Decision:<br />{decision.code}</p>{decision.classification && <><p className="mt-3">User category:<br />{decision.classification.userCategory}</p><p className="mt-3">Clarification:<br />{decision.classification.clarification ?? "NONE"}</p><p className="mt-3">Legal classification:<br />{decision.classification.legalClassification}</p></>}<p className="mt-3">Rules triggered:<br />{decision.rulesTriggered.map((rule) => <span className="block" key={rule}>{rule}</span>)}</p><p className="mt-3">Sources:<br />{decision.sourceIds.map((id) => <span className="block" key={id}>{id}</span>)}</p></section>}
    <Button variant="outline" onClick={onRestart}><RotateCcw size={17} /> Pradėti iš naujo</Button>
  </div>;
}

export function ReturnWizard({ purchase = null }: { purchase?: Pick<Purchase, "purchase_date" | "received_date" | "purchase_channel"> | null }) {
  const [answers, setAnswers] = useState<ReturnCaseInput>(() => ({ asOfDate: todayInVilnius() }));
  const [history, setHistory] = useState<ReturnCaseInput[]>([]);
  const [dateDraft, setDateDraft] = useState("");
  const step = nextStep(answers);
  const decision = step === null ? evaluateReturnCase(answers) : null;

  useEffect(() => {
    if (step === "purchaseDate" && purchase?.purchase_date && purchase.purchase_date <= answers.asOfDate) setDateDraft(purchase.purchase_date);
    else if (step === "deliveryDate" && purchase?.purchase_channel === "DISTANCE" && purchase.received_date && purchase.received_date <= answers.asOfDate) setDateDraft(purchase.received_date);
  }, [step, purchase, answers.asOfDate]);

  function choose(key: Step, value: string) {
    setHistory((previous) => [...previous, answers]);
    setAnswers((previous) => ({ ...previous, [key === "defectClarification" ? "defective" : key]: value }));
    setDateDraft("");
  }
  function back() {
    const previous = history.at(-1);
    if (!previous) return;
    setAnswers(previous);
    setHistory((items) => items.slice(0, -1));
    setDateDraft("");
  }
  function restart() { setAnswers({ asOfDate: todayInVilnius() }); setHistory([]); setDateDraft(""); }

  if (decision) return <DecisionView decision={decision} onBack={back} onRestart={restart} />;
  if (!step) return null;
  const clarification = step === "productSubtype" && answers.productCategory ? getProductClarification(answers.productCategory) : undefined;
  const question: { title: string; hint?: string; options?: { label: string; value: string; detail?: string }[] } = clarification
    ? { title: clarification.title, hint: clarification.hint, options: clarification.options.map(({ id, label }) => ({ value: id, label })) }
    : questions[step as Exclude<Step, "productSubtype">];
  const estimatedTotal = answers.purchaseChannel === "DISTANCE" ? 11 : 9;
  const progress = Math.min(95, Math.round((history.length / estimatedTotal) * 100));

  return <div className="mx-auto max-w-xl">
    <div className="mb-8 flex items-center justify-between"><button onClick={history.length ? back : undefined} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-teal-900" disabled={!history.length} aria-label="Grįžti"><ArrowLeft size={18} /> Grįžti</button><Link href="/" className="text-sm font-semibold text-teal-900">Pirkėjo Skydas</Link></div>
    <div className="mb-9"><div className="mb-3 flex items-center justify-between text-xs font-bold uppercase tracking-[0.16em] text-slate-500"><span>{history.length + 1} žingsnis</span><span>Jūsų situacija</span></div><div className="h-1.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-teal-700 transition-all" style={{ width: `${progress}%` }} /></div></div>
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-9"><div className="mb-5 inline-flex rounded-full bg-amber-50 p-3 text-amber-700"><CircleHelp size={24} /></div><h1 className="text-3xl font-bold leading-tight tracking-tight text-slate-950">{question.title}</h1>{question.hint && <p className="mt-4 text-sm leading-6 text-slate-600">{question.hint}</p>}
      {question.options ? <div className="mt-8 space-y-3">{question.options.map(({ label, value, detail }) => <button key={value} onClick={() => choose(step, value)} className="group flex min-h-14 w-full items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-left transition hover:border-teal-600 hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"><span><span className="block text-sm font-semibold text-slate-900">{label}</span>{detail && <span className="mt-1 block text-xs leading-5 text-slate-500">{detail}</span>}</span><ArrowRight size={17} className="shrink-0 text-slate-400 group-hover:text-teal-700" /></button>)}</div> : <form className="mt-8" onSubmit={(event) => { event.preventDefault(); if (dateDraft) choose(step, dateDraft); }}><label className="mb-2 block text-sm font-semibold text-slate-700" htmlFor="date-answer">Data</label><input id="date-answer" type="date" value={dateDraft} max={answers.asOfDate} required onChange={(event) => setDateDraft(event.target.value)} className="min-h-13 w-full rounded-xl border border-slate-300 bg-white px-4 text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600" /><Button type="submit" className="mt-5 w-full">Toliau <ArrowRight size={17} /></Button></form>}
    </div>
    <p className="mt-6 text-center text-xs leading-5 text-slate-500">Atsakymas sudaromas pagal jūsų pateiktą informaciją ir oficialius šaltinius.</p>
  </div>;
}
