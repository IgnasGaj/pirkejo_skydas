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
import { createBrowserUuid } from "@/lib/browser-uuid";
import { decide, renderLetter, selectEvidence, supportedRequests, validateReviewed, type Answers, type Facts, type Family, type Request } from "./domain";
import { legalSources } from "@/legal/sources";
import { createCaseAction } from "@/features/cases/actions";
import { useUnsavedNavigationGuard } from "@/lib/useUnsavedNavigationGuard";

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
export function ComplaintComposer({ purchase, documents, initialDraft, versions = [], initialFlow, attachmentAvailability = {}, caseByVersion = {} }: { purchase: Purchase; documents: PurchaseDocument[]; initialDraft?: Complaint; versions?: Version[]; initialFlow?: string; attachmentAvailability?: Record<string, string>; caseByVersion?: Record<string, string> }) {
  const router = useRouter();
  const [flow, setFlow] = useState<"defect" | "return" | null>(initialDraft ? null : initialFlow === "defect" ? "defect" : initialFlow === "return" ? "return" : null);
  const [family, setFamily] = useState<Family | null>(initialDraft?.family ?? null);
  const [answers, setAnswers] = useState<Answers | null>((initialDraft?.answers as Answers | undefined) ?? null);
  const [remedy, setRemedy] = useState<Request | null>((initialDraft?.remedy as Request | undefined) ?? null);
  const legacyReductionDeclaration = initialDraft?.remedy === "PRICE_REDUCTION" && Boolean((initialDraft.facts as Facts).confirmedNotMinor);
  const [facts, setFacts] = useState<Facts>(() => initialDraft ? { ...(initialDraft.facts as Facts), confirmedNotMinor: initialDraft.remedy === "PRICE_REDUCTION" ? false : (initialDraft.facts as Facts).confirmedNotMinor } : {
    consumerName: "", consumerEmail: "", sellerName: purchase.seller_name, sellerContact: "", productName: purchase.product_name,
    purchaseDate: purchase.purchase_date, receivedDate: purchase.received_date, purchaseChannel: purchase.purchase_channel === "UNKNOWN" ? "PHYSICAL_STORE" : purchase.purchase_channel,
    referenceNumber: purchase.reference_number ?? "", priceCents: purchase.price_cents, documentDate: todayInVilnius(),
    defectDescription: "", defectDiscoveredAt: null, reductionCents: null, reductionExplanation: "", physicalReason: null, confirmedNotMinor: false, alternativeProof: "", evidenceIds: []
  });
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [localRevision, setLocalRevision] = useState(legacyReductionDeclaration ? 1 : 0);
  const [savedRevision, setSavedRevision] = useState(0);
  const dirty = localRevision !== savedRevision;
  const [legacyNeedsSave, setLegacyNeedsSave] = useState(Boolean(legacyReductionDeclaration));
  // Allocate after hydration so server and browser render the same initial markup.
  const [saveRequestId, setSaveRequestId] = useState<string | null>(null);
  const [generateRequestId, setGenerateRequestId] = useState<string | null>(null);
  const [uuidReady, setUuidReady] = useState(false);
  const [draftVersion, setDraftVersion] = useState(initialDraft?.draft_version ?? 0);
  const [boundPurchaseVersion, setBoundPurchaseVersion] = useState(initialDraft?.purchase_updated_at ?? purchase.updated_at);
  const [reassessed, setReassessed] = useState(false);
  const [recoveredDraft, setRecoveredDraft] = useState<{ id: string; draft_version: number } | null>(null);
  const [remoteDraft, setRemoteDraft] = useState<Complaint | null>(null);
  const [reviewRecovery, setReviewRecovery] = useState(false);
  const [today, setToday] = useState(todayInVilnius);
  const { releaseGuard, resetLeaveOnEdit } = useUnsavedNavigationGuard(dirty);
  function markEdited() { resetLeaveOnEdit(); setLocalRevision((revision) => revision + 1); }
  const purchaseChanged = Boolean(initialDraft && boundPurchaseVersion !== purchase.updated_at);
  const discoveryChanged = family === "DEFECTIVE_PRODUCT" && facts.defectDiscoveredAt !== ((answers as DefectiveProductCaseInput | null)?.defectDetectedAt ?? null);
  const needsReassessment = (purchaseChanged && !reassessed) || discoveryChanged;
  const current = useMemo(() => family && answers ? decide(family, answers, today) : null, [family, answers, today]);
  const choices = useMemo(() => family && current ? supportedRequests(family, current.decision) : [], [family, current]);
  const previewState = useMemo(() => {
    if (!family || !remedy || !current || !choices.includes(remedy)) return { preview: null, message: "Pasirinkite palaikomą prašymą." };
    try {
      const reviewed = validateReviewed(family, current.answers, current.decision, remedy, facts, purchase, today);
      const selected = selectEvidence(reviewed.evidenceIds, documents);
      return { preview: renderLetter(family, remedy, reviewed, selected, current.decision), message: "" };
    } catch (failure) { return { preview: null, message: failure instanceof Error ? failure.message : "Patikrinkite duomenis." }; }
  }, [family, remedy, current, choices, facts, purchase, documents, today]);
  const preview = previewState.preview;
  useEffect(() => {
    setSaveRequestId(createBrowserUuid());
    setGenerateRequestId(createBrowserUuid());
    setUuidReady(true);
  }, []);
  useEffect(() => {
    const update = () => setToday(todayInVilnius());
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    const timer = window.setInterval(update, 60_000);
    return () => { window.removeEventListener("focus", update); document.removeEventListener("visibilitychange", update); window.clearInterval(timer); };
  }, []);
  function adoptDraft(draft: Complaint) {
    setFamily(draft.family); setAnswers(draft.answers as Answers); setRemedy(draft.remedy as Request);
    setFacts(draft.facts as Facts); setDraftVersion(draft.draft_version); setBoundPurchaseVersion(draft.purchase_updated_at);
    setLocalRevision(0); setSavedRevision(0); setRemoteDraft(null); setReviewRecovery(false); setReassessed(false); setError("");
    setSaveRequestId(createBrowserUuid());
  }
  useEffect(() => {
    if (!initialDraft || initialDraft.draft_version <= draftVersion) return;
    if (dirty) { setRemoteDraft(initialDraft); setReviewRecovery(true); }
    else adoptDraft(initialDraft);
    // The saved version is the revision boundary; local edits stay untouched.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDraft?.id, initialDraft?.draft_version]);
  async function loadLatest() {
    const id = recoveredDraft?.id ?? initialDraft?.id;
    if (!id) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/purchases/${purchase.id}/complaints?complaintId=${id}`, { cache: "no-store" });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.draft) throw new Error(result?.error ?? "Nepavyko įkelti juodraščio. Bandykite dar kartą.");
      setRemoteDraft(result.draft); setError("");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Nepavyko įkelti juodraščio."); }
    finally { setBusy(false); }
  }
  function change<K extends keyof Facts>(key: K, value: Facts[K]) { setFacts((before) => ({ ...before, [key]: value })); markEdited(); }
  function prepared(selectedFamily: Family, selectedAnswers: Answers) {
    setFamily(selectedFamily); setAnswers(selectedAnswers); setRemedy(null); setFacts((before) => ({ ...before,
      sellerName: purchase.seller_name, productName: purchase.product_name, purchaseDate: purchase.purchase_date,
      receivedDate: purchase.received_date, purchaseChannel: purchase.purchase_channel === "UNKNOWN" ? "PHYSICAL_STORE" : purchase.purchase_channel,
      priceCents: purchase.price_cents, referenceNumber: purchase.reference_number ?? "", documentDate: todayInVilnius(),
      reductionCents: before.priceCents === purchase.price_cents ? before.reductionCents : null,
      confirmedNotMinor: false,
      defectDiscoveredAt: selectedFamily === "DEFECTIVE_PRODUCT" ? (selectedAnswers as DefectiveProductCaseInput).defectDetectedAt ?? null : null
    }));
    setFlow(null); setReassessed(true); markEdited();
  }
  async function submit(operation: "save" | "generate" | "delete") {
    if (operation !== "delete" && (!family || !answers || !remedy)) return;
    const activeId = recoveredDraft?.id ?? initialDraft?.id;
    if (operation === "delete" && !activeId) return;
    const requestId = operation === "generate" ? generateRequestId : saveRequestId;
    if (!requestId) { setError("Šioje naršyklėje negalima saugiai sukurti naujos užklausos. Nukopijuokite įvestus duomenis ir bandykite atnaujintoje naršyklėje."); return; }
    setBusy(true); setError(""); setStatus("");
    try {
      const response = await fetch(`/api/purchases/${purchase.id}/complaints`, {
        method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
        body: JSON.stringify({ operation, complaintId: activeId, expectedVersion: draftVersion || undefined,
          rebind: operation === "save" && Boolean(initialDraft && boundPurchaseVersion !== purchase.updated_at && reassessed),
          requestId, family, answers, facts, remedy })
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        if (result?.code === "CREATION_CHANGED" && result.id) { setRecoveredDraft({ id: result.id, draft_version: result.draft_version }); setReviewRecovery(true); }
        if (result?.code === "STALE_REVISION") { setReviewRecovery(true); void loadLatest(); }
        throw new Error(result?.error ?? "Serveris negrąžino suprantamo atsakymo. Įvesti duomenys išliko; bandykite dar kartą.");
      }
      if (!result) throw new Error("Serveris negrąžino suprantamo atsakymo. Įvesti duomenys išliko; bandykite dar kartą.");
      if (operation === "save") {
        setSavedRevision(localRevision); setLegacyNeedsSave(false); setSaveRequestId(createBrowserUuid()); setDraftVersion(result.draft_version); setBoundPurchaseVersion(purchase.updated_at); setReassessed(false); setReviewRecovery(false);
        if (!initialDraft) { releaseGuard(); router.replace(`/purchases/${purchase.id}/complaints/${result.id}`); }
        else { setStatus("Juodraštis išsaugotas."); router.refresh(); }
      } else if (operation === "generate") {
        setGenerateRequestId(createBrowserUuid()); setStatus("Dokumentas parengtas. Pateikite jį pardavėjui ir išsaugokite pateikimo įrodymą."); router.refresh();
      } else { releaseGuard(); router.replace(`/purchases/${purchase.id}`); }
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
  return <fieldset disabled={busy} className="space-y-7">
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">Patikrinkite duomenis. Dokumentą pardavėjui turėsite pateikti patys. Priedus pridėkite prie laiško atskirai.</div>
    {uuidReady && (!saveRequestId || (initialDraft && !generateRequestId)) && <p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-950">Šioje naršyklėje negalima saugiai sukurti naujos užklausos. Nukopijuokite įvestus duomenis ir bandykite atnaujintoje naršyklėje.</p>}
    {legacyNeedsSave && <p role="status" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-950">Kainos sumažinimui nebereikia patvirtinti, kad trūkumas nėra nedidelis. Peržiūrėkite ir išsaugokite atnaujintą juodraštį prieš rengdami dokumentą.</p>}
    {reviewRecovery && <section role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm"><p>Išsaugotas juodraštis skiriasi nuo šiuo metu įvestų duomenų. Jūsų įrašai išliko. Įkelkite išsaugotą versiją ir pasirinkite, ką daryti.</p><button type="button" onClick={loadLatest} className="mt-3 min-h-11 rounded-xl border border-teal-700 px-4 font-semibold">Įkelti išsaugotą versiją</button>{remoteDraft && <div className="mt-3 space-y-2"><p>Išsaugota versija {remoteDraft.draft_version}: {(remoteDraft.facts as Facts).consumerName}. Peržiūrėkite pakeitimus prieš tęsdami.</p><button type="button" onClick={() => adoptDraft(remoteDraft)} className="mr-3 min-h-11 rounded-xl border border-teal-700 px-4 font-semibold">Naudoti išsaugotą versiją</button><button type="button" onClick={() => { setRecoveredDraft({ id: remoteDraft.id, draft_version: remoteDraft.draft_version }); setDraftVersion(remoteDraft.draft_version); setBoundPurchaseVersion(remoteDraft.purchase_updated_at); setSaveRequestId(createBrowserUuid()); setReviewRecovery(false); setRemoteDraft(null); markEdited(); setStatus("Pakeitimai paruošti. Peržiūrėkite dokumentą ir išsaugokite."); }} className="min-h-11 rounded-xl bg-teal-800 px-4 font-semibold text-white">Pritaikyti mano pakeitimus</button></div>}</section>}
    {(initialDraft || purchaseChanged || discoveryChanged) && <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5"><h2 className="font-bold">{purchaseChanged ? "Pirkinys pasikeitė" : discoveryChanged ? "Trūkumo data pasikeitė" : "Teisinė patikra"}</h2><p className="mt-2 text-sm">Pakartokite teisinę patikrą ir patvirtinkite atnaujintus duomenis. Ankstesnės dokumento versijos išliks.</p>{!flow && <button type="button" className="mt-3 min-h-12 rounded-xl bg-teal-800 px-5 font-semibold text-white" onClick={() => { setReassessed(false); setFlow(family === "DEFECTIVE_PRODUCT" ? "defect" : "return"); }}>Pakartoti teisinę patikrą</button>}{flow === "defect" && <DefectiveProductWizard purchase={purchase} onPrepare={(a) => prepared("DEFECTIVE_PRODUCT", a)} />}{flow === "return" && <ReturnWizard purchase={purchase} onPrepare={(a, decision) => prepared(decision.code === "DISTANCE_WITHDRAWAL_LIKELY_AVAILABLE" ? "DISTANCE_WITHDRAWAL" : "PHYSICAL_RETURN_REQUEST", a)} />}</section>}
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7"><h2 className="text-xl font-bold">Pirkinys ir prašymas</h2><p className="mt-3 text-sm">{familyLabels[family]} · {purchase.product_name} · {purchase.seller_name} · {purchase.purchase_date}</p><p className="mt-2 text-sm text-slate-600">Pirkinio faktus keiskite <Link className="font-semibold text-teal-800 underline" href={`/purchases/${purchase.id}/edit`}>pirkinio įraše</Link>. Po pakeitimo teisinę patikrą reikės pakartoti.</p><label className="mt-5 block text-sm font-semibold">Vienas prašymas<select className={inputClass} value={remedy ?? ""} onChange={(event) => { const selected = event.target.value as Request; setRemedy(selected); if (selected !== "TERMINATION_REFUND") setFacts((before) => ({ ...before, confirmedNotMinor: false })); markEdited(); }}><option value="">Pasirinkite</option>{choices.map((item) => <option key={item} value={item}>{requestLabels[item]}</option>)}</select></label>{!choices.length && <p role="alert" className="mt-3 text-sm text-rose-800">Šis rezultatas neleidžia rengti galutinio reikalavimo. Pakartokite patikrą.</p>}</section>
    <section id="reviewed-facts" className="grid gap-5 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-2 sm:p-7"><h2 className="text-xl font-bold sm:col-span-2">Peržiūrėti duomenys</h2>
      <label className="text-sm font-semibold">Vardas ir pavardė<input className={inputClass} maxLength={120} value={facts.consumerName} onChange={(event) => change("consumerName", event.target.value)} required /></label>
      <label className="text-sm font-semibold">El. paštas<input className={inputClass} type="email" maxLength={254} value={facts.consumerEmail} onChange={(event) => change("consumerEmail", event.target.value)} required /></label>
      <label className="text-sm font-semibold sm:col-span-2">Pardavėjo kontaktas arba adresas (nebūtina)<input className={inputClass} maxLength={300} value={facts.sellerContact} onChange={(event) => change("sellerContact", event.target.value)} /></label>
      <label className="text-sm font-semibold">Dokumento data<input className={inputClass} type="date" max={todayInVilnius()} value={facts.documentDate} onChange={(event) => change("documentDate", event.target.value)} required /></label>
      <label className="text-sm font-semibold">Užsakymo / čekio numeris<input className={inputClass} maxLength={200} value={facts.referenceNumber} onChange={(event) => change("referenceNumber", event.target.value)} /></label>
      <p className="text-sm text-slate-700 sm:col-span-2">Patvirtinta prekės kaina: {facts.priceCents == null ? "nenurodyta" : `${(facts.priceCents / 100).toFixed(2)} EUR`}. Čekio bendra suma nenaudojama kaip prekės kaina.</p>
      {remedy === "EXCHANGE" && <label className="text-sm font-semibold">Kodėl norite pakeisti prekę?<select className={inputClass} value={facts.physicalReason ?? ""} onChange={(event) => change("physicalReason", event.target.value as Facts["physicalReason"] || null)}><option value="">Pasirinkite savybę</option><option value="SIZE">Dydis</option><option value="SHAPE">Forma</option><option value="COLOR">Spalva</option><option value="MODEL">Modelis</option><option value="COMPLETENESS">Komplektiškumas</option></select></label>}
      {family === "DEFECTIVE_PRODUCT" && <label className="text-sm font-semibold sm:col-span-2">Prekės trūkumo aprašymas<textarea className={`${inputClass} min-h-32 py-3`} maxLength={4000} value={facts.defectDescription} onChange={(event) => change("defectDescription", event.target.value)} required /></label>}
      {family === "DEFECTIVE_PRODUCT" && <label className="text-sm font-semibold">Trūkumo pastebėjimo data<input className={inputClass} type="date" min={purchase.received_date ?? purchase.purchase_date} max={todayInVilnius()} value={facts.defectDiscoveredAt ?? ""} onChange={(event) => change("defectDiscoveredAt", event.target.value || null)} /></label>}
      {family === "DEFECTIVE_PRODUCT" && facts.defectDiscoveredAt !== ((answers as DefectiveProductCaseInput).defectDetectedAt ?? null) && <p role="status" className="text-sm text-amber-900 sm:col-span-2">Pakeistą trūkumo datą patvirtinkite pakartodami teisinę patikrą.</p>}
      {remedy === "TERMINATION_REFUND" && <label className="flex items-center gap-3 text-sm font-semibold sm:col-span-2"><input type="checkbox" checked={facts.confirmedNotMinor} onChange={(event) => change("confirmedNotMinor", event.target.checked)} />Mano žiniomis, trūkumas nėra nedidelis. Dėl trūkumo reikšmingumo ginčo atveju įrodinėjimo pareiga tenka pardavėjui.</label>}
      {remedy === "PRICE_REDUCTION" && <><label className="text-sm font-semibold">Prašoma sumažinti (EUR)<input className={inputClass} type="number" min="0.01" step="0.01" value={facts.reductionCents == null ? "" : (facts.reductionCents / 100).toFixed(2)} onChange={(event) => change("reductionCents", event.target.value ? Math.round(Number(event.target.value) * 100) : null)} /></label><label className="text-sm font-semibold sm:col-span-2">Sumažinimo pagrindimas<textarea className={`${inputClass} min-h-24 py-3`} maxLength={1000} value={facts.reductionExplanation} onChange={(event) => change("reductionExplanation", event.target.value)} /></label></>}
    </section>
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7"><h2 className="text-xl font-bold">Priedai</h2><p className="mt-2 text-sm text-slate-600">Pasirinkite tik tuos failus, kuriuos pridėsite prie savo laiško. Failai lieka privačioje pirkinių saugykloje.</p>{documents.length ? <div className="mt-4 space-y-3">{documents.map((item) => <label key={item.id} className="flex min-h-11 items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm"><input type="checkbox" checked={facts.evidenceIds.includes(item.id)} onChange={(event) => change("evidenceIds", event.target.checked ? [...facts.evidenceIds, item.id] : facts.evidenceIds.filter((id) => id !== item.id))} /><span className="break-all">{documentLabels[item.document_type]} · {item.original_filename}</span></label>)}</div> : <p className="mt-4 text-sm text-amber-900">Išsaugotų įrodymų nėra. Galite nurodyti kitą turimą pirkimo įrodymą.</p>}<label className="mt-4 block text-sm font-semibold">Kitas pirkimo įrodymas (nebūtina)<textarea className={`${inputClass} min-h-20 py-3`} maxLength={500} value={facts.alternativeProof} onChange={(event) => change("alternativeProof", event.target.value)} /></label></section>
    {preview ? <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7"><h2 className="text-xl font-bold">Dokumento peržiūra</h2><p className="mt-2 text-sm text-slate-600">Tai ne pateikimo pardavėjui įrodymas. Patikrinkite visus faktus.</p><pre className="mt-5 whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-4 font-sans text-sm leading-7 text-slate-900">{preview.text}</pre></section> : <p role="status" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-950">{previewState.message}</p>}
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7"><h2 className="text-xl font-bold">Oficialūs šaltiniai</h2><ul className="mt-3 space-y-2 text-sm">{(family === "DEFECTIVE_PRODUCT" ? ["VVTAT_GUARANTEES", "VVTAT_CLAIMS", "LT_CIVIL_CODE"] : family === "DISTANCE_WITHDRAWAL" ? ["VVTAT_FAQ", "LT_CIVIL_CODE"] : ["VVTAT_GUARANTEES", "LT_RETAIL_RULES"]).map((key) => <li key={key}><a className="text-teal-800 underline" href={legalSources[key as keyof typeof legalSources].url} target="_blank" rel="noopener noreferrer">{legalSources[key as keyof typeof legalSources].title}</a></li>)}</ul></section>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-900">{error}</p>}{status && <p role="status" className="rounded-xl bg-teal-50 p-4 text-sm text-teal-950">{status}</p>}
    <div className="flex flex-wrap gap-3">{initialDraft && <a href="#reviewed-facts" className="min-h-12 content-center rounded-xl border border-slate-300 px-5 font-semibold text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700">Redaguoti juodraštį</a>}<button type="button" disabled={busy || reviewRecovery || !saveRequestId || needsReassessment || !preview} onClick={() => submit("save")} className="min-h-12 rounded-xl border border-teal-700 px-5 font-semibold text-teal-900 disabled:opacity-50">Išsaugoti juodraštį</button>{initialDraft && <button type="button" disabled={busy || !generateRequestId || needsReassessment || dirty || !preview} onClick={() => submit("generate")} className="min-h-12 rounded-xl bg-teal-800 px-5 font-semibold text-white disabled:opacity-50">{versions.length ? "Parengti naują versiją" : "Patvirtinti ir parengti dokumentą"}</button>}{initialDraft && <button type="button" disabled={busy || !saveRequestId} onClick={() => { if (window.confirm("Ištrinti dokumentą ir visas jo versijas?")) submit("delete"); }} className="min-h-12 rounded-xl border border-rose-300 px-5 font-semibold text-rose-800">Ištrinti dokumentą</button>}</div>
    {initialDraft && <section className="space-y-4"><h2 className="text-xl font-bold">Parengtos versijos</h2>{versions.length === 0 && <p className="text-sm text-slate-600">Dar nėra parengto dokumento. Pirmiausia parenkite dokumentą.</p>}{versions.map((version) => <SavedVersion key={version.id} purchaseId={purchase.id} complaintId={initialDraft.id} version={version} attachmentAvailability={attachmentAvailability} caseId={caseByVersion[version.id]} />)}</section>}
  </fieldset>;
}

function SavedVersion({ purchaseId, complaintId, version, attachmentAvailability, caseId }: { purchaseId: string; complaintId: string; version: Version; attachmentAvailability: Record<string, string>; caseId?: string }) {
  const [copied, setCopied] = useState("");
  const historicalEvidence = (version.snapshot as { evidence?: Array<{ id?: string; original_filename?: string }> }).evidence;
  const base = `/api/purchases/${purchaseId}/complaints/${complaintId}/versions/${version.id}`;
  async function copy() { try { await navigator.clipboard.writeText(version.plain_text); setCopied("Tekstas nukopijuotas."); } catch { setCopied("Nepavyko nukopijuoti. Pažymėkite tekstą žemiau ir nukopijuokite patys."); } }
  return <article className="rounded-2xl border border-slate-200 bg-white p-5"><h3 className="font-bold">Versija {version.version_no} · {new Date(version.generated_at).toLocaleString("lt-LT")}</h3><p className="mt-2 text-sm text-slate-600">Ši versija saugo tuo metu peržiūrėtus faktus. Dabartinių teisių ji nepatvirtina.</p>{Array.isArray(historicalEvidence) && historicalEvidence.length > 0 && <div className="mt-3 text-sm"><p className="font-semibold">Dabartinė priedų būsena:</p><ul>{historicalEvidence.map((item) => <li key={item.id} className="break-all">{item.original_filename}: {item.id ? attachmentAvailability[item.id] ?? "Laikinai nepasiekiamas" : "Laikinai nepasiekiamas"}</li>)}</ul></div>}<div className="mt-4 flex flex-wrap gap-3"><a className="min-h-11 content-center rounded-xl bg-teal-800 px-4 text-sm font-semibold text-white" href={`${base}?format=pdf`}>Atsisiųsti PDF</a><a className="min-h-11 content-center rounded-xl border border-teal-700 px-4 text-sm font-semibold text-teal-900" href={`${base}?format=txt`}>Atsisiųsti tekstą</a><button type="button" onClick={copy} className="min-h-11 rounded-xl border border-teal-700 px-4 text-sm font-semibold text-teal-900">Kopijuoti tekstą</button>{caseId ? <Link href={`/cases/${caseId}`} className="min-h-11 content-center rounded-xl border border-teal-700 px-4 text-sm font-semibold text-teal-900">Atidaryti kreipimąsi</Link> : <form action={createCaseAction.bind(null, version.id)}><button type="submit" className="min-h-11 rounded-xl border border-teal-700 px-4 text-sm font-semibold text-teal-900">Sekti kreipimąsi</button></form>}</div>{copied && <p role="status" className="mt-3 text-sm">{copied}</p>}<details className="mt-4"><summary className="cursor-pointer font-semibold">Peržiūrėti dokumentą</summary><textarea readOnly aria-label={`Versijos ${version.version_no} tekstas`} value={version.plain_text} className="mt-3 min-h-80 w-full resize-y whitespace-pre-wrap rounded-xl border border-slate-300 p-3 font-sans text-sm leading-6" /></details></article>;
}
