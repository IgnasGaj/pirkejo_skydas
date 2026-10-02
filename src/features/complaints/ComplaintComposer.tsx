"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Row } from "@/lib/supabase/database.types";
import type { Purchase, PurchaseDocument } from "@/features/purchases/domain/types";
import { documentLabels } from "@/features/purchases/domain/types";
import { ReturnWizard } from "@/features/returns/components/ReturnWizard";
import { DefectiveProductWizard } from "@/features/defective-product/components/DefectiveProductWizard";
import type { DefectiveProductCaseInput } from "@/features/defective-product/domain/types";
import { todayInVilnius } from "@/lib/date";
import { decide, renderLetter, selectEvidence, supportedRequests, validateReviewed, type Answers, type Facts, type Family, type Request } from "./domain";
import { legalSources } from "@/legal/sources";

type Complaint = Row<"complaints">;
type Version = Row<"complaint_versions">;
const requestLabels: Record<Request, string> = {
  REPAIR: "Pataisyti prekę", REPLACEMENT: "Pakeisti prekę", PRICE_REDUCTION: "Sumažinti kainą",
  TERMINATION_REFUND: "Nutraukti sutartį ir grąžinti prekės kainą", WITHDRAW: "Atsisakyti nuotolinės sutarties",
  EXCHANGE: "Pakeisti kokybišką prekę", CONSENT_RETURN: "Paprašyti pardavėjo sutikimo grąžinti prekę"
};
const familyLabels: Record<Family, string> = {
  DEFECTIVE_PRODUCT: "Nekokybiška prekė", DISTANCE_WITHDRAWAL: "Nuotolinės sutarties atsisakymas", PHYSICAL_RETURN_REQUEST: "Prašymas dėl kokybiškos prekės"
};

export function ComplaintComposer({ purchase, documents, initialDraft, versions = [], initialFlow }: { purchase: Purchase; documents: PurchaseDocument[]; initialDraft?: Complaint; versions?: Version[]; initialFlow?: string }) {
  const router = useRouter();
  const [flow, setFlow] = useState<"defect" | "return" | null>(initialDraft ? null : initialFlow === "defect" ? "defect" : initialFlow === "return" ? "return" : null);
  const [family, setFamily] = useState<Family | null>(initialDraft?.family ?? null);
  const [answers, setAnswers] = useState<Answers | null>((initialDraft?.answers as Answers | undefined) ?? null);
  const [remedy, setRemedy] = useState<Request | null>((initialDraft?.remedy as Request | undefined) ?? null);
  const [facts, setFacts] = useState<Facts>(() => initialDraft ? initialDraft.facts as Facts : {
    consumerName: "", consumerEmail: "", sellerName: purchase.seller_name, sellerContact: "", productName: purchase.product_name,
    purchaseDate: purchase.purchase_date, receivedDate: purchase.received_date, purchaseChannel: purchase.purchase_channel === "UNKNOWN" ? "PHYSICAL_STORE" : purchase.purchase_channel,
    referenceNumber: purchase.reference_number ?? "", priceCents: purchase.price_cents, documentDate: todayInVilnius(),
    defectDescription: "", defectDiscoveredAt: null, reductionCents: null, reductionExplanation: "", physicalReason: null, confirmedNotMinor: false, alternativeProof: "", evidenceIds: []
  });
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saveRequestId, setSaveRequestId] = useState(() => crypto.randomUUID());
  const [generateRequestId, setGenerateRequestId] = useState(() => crypto.randomUUID());
  const [draftVersion, setDraftVersion] = useState(initialDraft?.draft_version ?? 0);
  const current = useMemo(() => family && answers ? decide(family, answers, todayInVilnius()) : null, [family, answers]);
  const choices = useMemo(() => family && current ? supportedRequests(family, current.decision) : [], [family, current]);
  const previewState = useMemo(() => {
    if (!family || !remedy || !current || !choices.includes(remedy)) return { preview: null, message: "Pasirinkite palaikomą prašymą." };
    try {
      const reviewed = validateReviewed(family, current.answers, current.decision, remedy, facts, purchase, todayInVilnius());
      const selected = selectEvidence(reviewed.evidenceIds, documents);
      return { preview: renderLetter(family, remedy, reviewed, selected), message: "" };
    } catch (failure) { return { preview: null, message: failure instanceof Error ? failure.message : "Patikrinkite duomenis." }; }
  }, [family, remedy, current, choices, facts, purchase, documents]);
  const preview = previewState.preview;
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function change<K extends keyof Facts>(key: K, value: Facts[K]) { setFacts((before) => ({ ...before, [key]: value })); setDirty(true); }
  function prepared(selectedFamily: Family, selectedAnswers: Answers) {
    setFamily(selectedFamily); setAnswers(selectedAnswers); setRemedy(null); setFacts((before) => ({ ...before, defectDiscoveredAt: selectedFamily === "DEFECTIVE_PRODUCT" ? (selectedAnswers as DefectiveProductCaseInput).defectDetectedAt ?? null : null }));
    setFlow(null); setDirty(true);
  }
  async function submit(operation: "save" | "generate" | "delete") {
    if (!family || !answers || !remedy) return;
    setBusy(true); setError(""); setStatus("");
    try {
      const response = await fetch(`/api/purchases/${purchase.id}/complaints`, {
        method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
        body: JSON.stringify({ operation, complaintId: initialDraft?.id, expectedVersion: draftVersion || undefined, requestId: operation === "generate" ? generateRequestId : saveRequestId, family, answers, facts, remedy })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Veiksmas nepavyko.");
      if (operation === "save") {
        setDirty(false); setSaveRequestId(crypto.randomUUID()); setDraftVersion(result.draft_version);
        if (!initialDraft) router.push(`/purchases/${purchase.id}/complaints/${result.id}`);
        else { setStatus("Juodraštis išsaugotas."); router.refresh(); }
      } else if (operation === "generate") {
        setGenerateRequestId(crypto.randomUUID()); setStatus("Dokumentas parengtas. Pateikite jį pardavėjui ir išsaugokite pateikimo įrodymą."); router.refresh();
      } else router.push(`/purchases/${purchase.id}`);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Veiksmas nepavyko."); }
    finally { setBusy(false); }
  }
  if (!initialDraft && !family) return <div className="space-y-6">
    <p className="text-sm text-slate-700">Pirmiausia atsakykite į teisinės patikros klausimus. Dokumentas bus rengiamas tik pagal palaikomą rezultatą.</p>
    {!flow && <div className="flex flex-wrap gap-3"><button type="button" onClick={() => setFlow("defect")} className="min-h-12 rounded-xl bg-teal-800 px-5 font-semibold text-white">Prekė turi trūkumą</button><button type="button" onClick={() => setFlow("return")} className="min-h-12 rounded-xl border border-teal-700 px-5 font-semibold text-teal-900">Noriu grąžinti kokybišką prekę</button></div>}
    {flow === "defect" && <DefectiveProductWizard purchase={purchase} onPrepare={(a) => prepared("DEFECTIVE_PRODUCT", a)} />}
    {flow === "return" && <ReturnWizard purchase={purchase} onPrepare={(a, decision) => prepared(decision.code === "DISTANCE_WITHDRAWAL_LIKELY_AVAILABLE" ? "DISTANCE_WITHDRAWAL" : "PHYSICAL_RETURN_REQUEST", a)} />}
  </div>;
  if (!family || !answers) return null;
  const inputClass = "mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700";
  return <div className="space-y-7">
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">Patikrinkite duomenis. Dokumentą pardavėjui turėsite pateikti patys. Priedus pridėkite prie laiško atskirai.</div>
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7"><h2 className="text-xl font-bold">Pirkinys ir prašymas</h2><p className="mt-3 text-sm">{familyLabels[family]} · {purchase.product_name} · {purchase.seller_name} · {purchase.purchase_date}</p><p className="mt-2 text-sm text-slate-600">Pirkinio faktus keiskite <Link className="font-semibold text-teal-800 underline" href={`/purchases/${purchase.id}/edit`}>pirkinio įraše</Link>. Po pakeitimo teisinę patikrą reikės pakartoti.</p><label className="mt-5 block text-sm font-semibold">Vienas prašymas<select className={inputClass} value={remedy ?? ""} onChange={(event) => { setRemedy(event.target.value as Request); setDirty(true); }}><option value="">Pasirinkite</option>{choices.map((item) => <option key={item} value={item}>{requestLabels[item]}</option>)}</select></label>{!choices.length && <p role="alert" className="mt-3 text-sm text-rose-800">Šis rezultatas neleidžia rengti galutinio reikalavimo. Pakartokite patikrą.</p>}</section>
    <section id="reviewed-facts" className="grid gap-5 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-2 sm:p-7"><h2 className="text-xl font-bold sm:col-span-2">Peržiūrėti duomenys</h2>
      <label className="text-sm font-semibold">Vardas ir pavardė<input className={inputClass} maxLength={120} value={facts.consumerName} onChange={(event) => change("consumerName", event.target.value)} required /></label>
      <label className="text-sm font-semibold">El. paštas<input className={inputClass} type="email" maxLength={254} value={facts.consumerEmail} onChange={(event) => change("consumerEmail", event.target.value)} required /></label>
      <label className="text-sm font-semibold sm:col-span-2">Pardavėjo kontaktas arba adresas (nebūtina)<input className={inputClass} maxLength={300} value={facts.sellerContact} onChange={(event) => change("sellerContact", event.target.value)} /></label>
      <label className="text-sm font-semibold">Dokumento data<input className={inputClass} type="date" max={todayInVilnius()} value={facts.documentDate} onChange={(event) => change("documentDate", event.target.value)} required /></label>
      <label className="text-sm font-semibold">Užsakymo / čekio numeris<input className={inputClass} maxLength={200} value={facts.referenceNumber} onChange={(event) => change("referenceNumber", event.target.value)} /></label>
      <p className="text-sm text-slate-700 sm:col-span-2">Patvirtinta prekės kaina: {facts.priceCents == null ? "nenurodyta" : `${(facts.priceCents / 100).toFixed(2)} EUR`}. Čekio bendra suma nenaudojama kaip prekės kaina.</p>
      {remedy === "EXCHANGE" && <label className="text-sm font-semibold">Kodėl norite pakeisti prekę?<select className={inputClass} value={facts.physicalReason ?? ""} onChange={(event) => change("physicalReason", event.target.value as Facts["physicalReason"] || null)}><option value="">Pasirinkite savybę</option><option value="SIZE">Dydis</option><option value="SHAPE">Forma</option><option value="COLOR">Spalva</option><option value="MODEL">Modelis</option><option value="COMPLETENESS">Komplektiškumas</option></select></label>}
      {family === "DEFECTIVE_PRODUCT" && <label className="text-sm font-semibold sm:col-span-2">Prekės trūkumo aprašymas<textarea className={`${inputClass} min-h-32 py-3`} maxLength={4000} value={facts.defectDescription} onChange={(event) => change("defectDescription", event.target.value)} required /></label>}
      {family === "DEFECTIVE_PRODUCT" && <label className="text-sm font-semibold">Trūkumo pastebėjimo data<input className={inputClass} type="date" value={facts.defectDiscoveredAt ?? ""} onChange={(event) => change("defectDiscoveredAt", event.target.value || null)} /></label>}
      {(remedy === "PRICE_REDUCTION" || remedy === "TERMINATION_REFUND") && <label className="flex items-center gap-3 text-sm font-semibold sm:col-span-2"><input type="checkbox" checked={facts.confirmedNotMinor} onChange={(event) => change("confirmedNotMinor", event.target.checked)} />Patvirtinu, kad trūkumas nėra nedidelis ir patikros faktai teisingi.</label>}
      {remedy === "PRICE_REDUCTION" && <><label className="text-sm font-semibold">Prašoma sumažinti (EUR)<input className={inputClass} type="number" min="0.01" step="0.01" value={facts.reductionCents == null ? "" : (facts.reductionCents / 100).toFixed(2)} onChange={(event) => change("reductionCents", event.target.value ? Math.round(Number(event.target.value) * 100) : null)} /></label><label className="text-sm font-semibold sm:col-span-2">Sumažinimo pagrindimas<textarea className={`${inputClass} min-h-24 py-3`} maxLength={1000} value={facts.reductionExplanation} onChange={(event) => change("reductionExplanation", event.target.value)} /></label></>}
    </section>
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7"><h2 className="text-xl font-bold">Priedai</h2><p className="mt-2 text-sm text-slate-600">Pasirinkite tik tuos failus, kuriuos pridėsite prie savo laiško. Failai lieka privačioje pirkinių saugykloje.</p>{documents.length ? <div className="mt-4 space-y-3">{documents.map((item) => <label key={item.id} className="flex min-h-11 items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm"><input type="checkbox" checked={facts.evidenceIds.includes(item.id)} onChange={(event) => change("evidenceIds", event.target.checked ? [...facts.evidenceIds, item.id] : facts.evidenceIds.filter((id) => id !== item.id))} /><span className="break-all">{documentLabels[item.document_type]} · {item.original_filename}</span></label>)}</div> : <p className="mt-4 text-sm text-amber-900">Išsaugotų įrodymų nėra. Galite nurodyti kitą turimą pirkimo įrodymą.</p>}<label className="mt-4 block text-sm font-semibold">Kitas pirkimo įrodymas (nebūtina)<textarea className={`${inputClass} min-h-20 py-3`} maxLength={500} value={facts.alternativeProof} onChange={(event) => change("alternativeProof", event.target.value)} /></label></section>
    {preview ? <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7"><h2 className="text-xl font-bold">Dokumento peržiūra</h2><p className="mt-2 text-sm text-slate-600">Tai ne pateikimo pardavėjui įrodymas. Patikrinkite visus faktus.</p><pre className="mt-5 whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-4 font-sans text-sm leading-7 text-slate-900">{preview.text}</pre></section> : <p role="status" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-950">{previewState.message}</p>}
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7"><h2 className="text-xl font-bold">Oficialūs šaltiniai</h2><ul className="mt-3 space-y-2 text-sm">{(family === "DEFECTIVE_PRODUCT" ? ["VVTAT_GUARANTEES", "VVTAT_CLAIMS", "LT_CIVIL_CODE"] : family === "DISTANCE_WITHDRAWAL" ? ["VVTAT_FAQ", "LT_CIVIL_CODE"] : ["VVTAT_GUARANTEES", "LT_RETAIL_RULES"]).map((key) => <li key={key}><a className="text-teal-800 underline" href={legalSources[key as keyof typeof legalSources].url} target="_blank" rel="noopener noreferrer">{legalSources[key as keyof typeof legalSources].title}</a></li>)}</ul></section>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-900">{error}</p>}{status && <p role="status" className="rounded-xl bg-teal-50 p-4 text-sm text-teal-950">{status}</p>}
    <div className="flex flex-wrap gap-3">{initialDraft && <a href="#reviewed-facts" className="min-h-12 content-center rounded-xl border border-slate-300 px-5 font-semibold text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700">Redaguoti juodraštį</a>}<button type="button" disabled={busy || !preview} onClick={() => submit("save")} className="min-h-12 rounded-xl border border-teal-700 px-5 font-semibold text-teal-900 disabled:opacity-50">Išsaugoti juodraštį</button>{initialDraft && <button type="button" disabled={busy || dirty || !preview} onClick={() => submit("generate")} className="min-h-12 rounded-xl bg-teal-800 px-5 font-semibold text-white disabled:opacity-50">{versions.length ? "Parengti naują versiją" : "Patvirtinti ir parengti dokumentą"}</button>}{initialDraft && <button type="button" disabled={busy} onClick={() => { if (window.confirm("Ištrinti dokumentą ir visas jo versijas?")) submit("delete"); }} className="min-h-12 rounded-xl border border-rose-300 px-5 font-semibold text-rose-800">Ištrinti dokumentą</button>}</div>
    {initialDraft && <section className="space-y-4"><h2 className="text-xl font-bold">Parengtos versijos</h2>{versions.length === 0 && <p className="text-sm text-slate-600">Dar nėra parengto dokumento.</p>}{versions.map((version) => <SavedVersion key={version.id} purchaseId={purchase.id} complaintId={initialDraft.id} version={version} />)}</section>}
  </div>;
}

function SavedVersion({ purchaseId, complaintId, version }: { purchaseId: string; complaintId: string; version: Version }) {
  const [copied, setCopied] = useState("");
  const base = `/api/purchases/${purchaseId}/complaints/${complaintId}/versions/${version.id}`;
  async function copy() { try { await navigator.clipboard.writeText(version.plain_text); setCopied("Tekstas nukopijuotas."); } catch { setCopied("Nepavyko nukopijuoti. Pažymėkite tekstą žemiau ir nukopijuokite patys."); } }
  return <article className="rounded-2xl border border-slate-200 bg-white p-5"><h3 className="font-bold">Versija {version.version_no} · {new Date(version.generated_at).toLocaleString("lt-LT")}</h3><p className="mt-2 text-sm text-slate-600">Ši versija saugo tuo metu peržiūrėtus faktus. Dabartinių teisių ji nepatvirtina.</p><div className="mt-4 flex flex-wrap gap-3"><a className="min-h-11 content-center rounded-xl bg-teal-800 px-4 text-sm font-semibold text-white" href={`${base}?format=pdf`}>Atsisiųsti PDF</a><a className="min-h-11 content-center rounded-xl border border-teal-700 px-4 text-sm font-semibold text-teal-900" href={`${base}?format=txt`}>Atsisiųsti tekstą</a><button type="button" onClick={copy} className="min-h-11 rounded-xl border border-teal-700 px-4 text-sm font-semibold text-teal-900">Kopijuoti tekstą</button></div>{copied && <p role="status" className="mt-3 text-sm">{copied}</p>}<details className="mt-4"><summary className="cursor-pointer font-semibold">Peržiūrėti dokumentą</summary><textarea readOnly aria-label={`Versijos ${version.version_no} tekstas`} value={version.plain_text} className="mt-3 min-h-80 w-full resize-y whitespace-pre-wrap rounded-xl border border-slate-300 p-3 font-sans text-sm leading-6" /></details></article>;
}
