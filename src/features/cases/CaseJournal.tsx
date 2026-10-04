"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createBrowserUuid } from "@/lib/browser-uuid";
import { todayInVilnius } from "@/lib/date";
import { useUnsavedNavigationGuard } from "@/lib/useUnsavedNavigationGuard";
import type { Row } from "@/lib/supabase/database.types";
import { CASE_RULE_VERSION, CASE_SOURCE_URL, CASE_VERIFIED_THROUGH, civilDaysBetween, responseDeadline } from "./domain";
import type { Family } from "@/features/complaints/domain";

type Case = Row<"cases">;
type Event = Row<"case_events">;
type Purchase = Row<"purchases">;
type Evidence = Row<"purchase_documents">;
type Version = Pick<Row<"complaint_versions">, "id" | "complaint_id" | "version_no" | "generated_at" | "template_version" | "source_version">;
const progressLabels: Record<string, string> = { PREPARED: "Dokumentas parengtas", AWAITING_RESPONSE: "Laukiama pardavėjo atsakymo", RESPONSE_RECORDED: "Gautas pardavėjo atsakymas", IN_SERVICE: "Prekė taisoma / tikrinama", RESOLVED: "Išspręsta", CLOSED: "Uždaryta" };
const eventLabels: Record<string, string> = { SUBMITTED: "Pateikta pardavėjui", SUBMISSION_CORRECTED: "Pateikimo datos pataisa", RECEIPT_RECORDED: "Įrašyta pardavėjo gavimo data", RECEIPT_CORRECTED: "Gavimo datos pataisa", RESPONSE_RECORDED: "Įrašytas pardavėjo atsakymas", SERVICE_STARTED: "Prekė perduota taisyti / tikrinti", SERVICE_RETURNED: "Prekė atgauta", RESOLVED: "Pažymėta išspręsta", CLOSED: "Sekimas uždarytas", REOPENED: "Sekimas atnaujintas" };
const methods = { EMAIL: "El. paštu", REGISTERED_POST: "Registruotu paštu", IN_PERSON: "Asmeniškai", VTIS: "Per VTIS", OTHER: "Kitu būdu" };
const outcomes = { ACCEPTED: "Patenkino", PARTLY_ACCEPTED: "Patenkino iš dalies", REFUSED: "Atsisakė", MORE_INFORMATION: "Paprašė papildomos informacijos", OTHER: "Kita / tarpinis atsakymas" };
const resolutions = { REPAIRED: "Pataisyta", REPLACED: "Pakeista", REFUND_RECEIVED: "Pinigai grąžinti", PRICE_REDUCTION: "Sutarta dėl kainos sumažinimo", OTHER: "Kita" };
type Kind = keyof typeof eventLabels;
type CaseEventRequest = { requestId: string; expectedRevision: number; kind: Kind; occurredOn: string; payload: Record<string, string>; evidenceId: string | null; targetEventId: string | null };

export function CaseJournal({ item, purchase, version, events, evidence, evidenceAvailability, supersededIds, today, submissionEventId, receiptEventId, serviceStartedOn }: { item: Case; purchase: Purchase; version: Version; events: Event[]; evidence: Evidence[]; evidenceAvailability: Record<string, string>; supersededIds: string[]; today: string; submissionEventId: string | null; receiptEventId: string | null; serviceStartedOn: string | null }) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>(item.progress === "PREPARED" ? "SUBMITTED" : "RESPONSE_RECORDED");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [baseRevision, setBaseRevision] = useState(item.revision);
  const [attempt, setAttempt] = useState<CaseEventRequest | null>(null);
  const [editedAfterAttempt, setEditedAfterAttempt] = useState(false);
  const [reviewRequired, setReviewRequired] = useState<"stale" | "saved" | null>(null);
  const deleteAttempt = useRef<{ id: string; revision: number } | null>(null);
  const [receiptKnown, setReceiptKnown] = useState(false);
  const [authExpired, setAuthExpired] = useState(false);
  const { releaseGuard, resetLeaveOnEdit } = useUnsavedNavigationGuard(dirty);
  useEffect(() => {
    const refresh = () => router.refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const timer = window.setInterval(refresh, 60_000);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); window.clearInterval(timer); };
  }, [router]);
  useEffect(() => {
    if (!dirty && !attempt && !reviewRequired) setBaseRevision((current) => Math.max(current, item.revision));
  }, [item.revision, dirty, attempt, reviewRequired]);
  function edited() { resetLeaveOnEdit(); setDirty(true); if (attempt) setEditedAfterAttempt(true); setError(""); }
  const calculatedDeadline = responseDeadline({ family: item.family as Family, submittedOn: item.submitted_on, receivedOn: item.received_on, substantiveResponse: item.has_substantive_response, today, sourceValidThrough: CASE_VERIFIED_THROUGH });
  const deadline = calculatedDeadline.state !== "UNAVAILABLE" && item.family === "DEFECTIVE_PRODUCT" && item.received_on && item.deadline_rule_version !== CASE_RULE_VERSION
    ? { state: "UNAVAILABLE" as const, reason: "Termino taisyklė pasikeitė; reikia patikrinti ankstesnį skaičiavimą." }
    : calculatedDeadline;
  const closed = item.progress === "CLOSED" || item.progress === "RESOLVED";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reviewRequired || (!attempt && (serverChanged || !available.includes(activeKind)))) { setError("Kreipimosi eiga pasikeitė. Peržiūrėkite naujausius įrašus prieš tęsdami."); return; }
    if (!attempt && activeKind === "REOPENED" && !window.confirm("Atnaujinti šio kreipimosi sekimą? Ankstesnė eiga ir atsakymo termino pagrindas išliks.")) return;
    const action = activeKind;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const value = (name: string) => String(fields.get(name) ?? "").trim();
    const payload: Record<string, string> = { note: value("note") };
    if (action === "SUBMITTED" || action === "SUBMISSION_CORRECTED") payload.method = value("method");
    if (action === "SUBMITTED" && receiptKnown) payload.receivedOn = value("receivedOn");
    if (action === "RESPONSE_RECORDED") { payload.summary = value("summary"); payload.outcome = value("outcome"); }
    if (action === "SERVICE_STARTED") { payload.reference = value("reference"); if (value("promisedOn")) payload.promisedOn = value("promisedOn"); }
    if (action === "SERVICE_RETURNED") payload.result = value("result");
    if (action === "RESOLVED") payload.outcome = value("resolution");
    const targetEventId = action === "SUBMISSION_CORRECTED" ? submissionEventId : action === "RECEIPT_CORRECTED" ? receiptEventId : null;
    const identity = attempt?.requestId ?? createBrowserUuid();
    if (!identity) { setError("Šioje naršyklėje nepavyko sukurti saugios užklausos tapatybės. Bandykite saugioje naršyklėje."); return; }
    const body: CaseEventRequest = attempt ?? { requestId: identity, expectedRevision: baseRevision, kind: action, occurredOn: value("occurredOn"), payload, evidenceId: value("evidenceId") || null, targetEventId };
    if (!attempt) setAttempt(body);
    setBusy(true); setError(""); setStatus("");
    try {
      const response = await fetch(`/api/cases/${item.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Nepavyko išsaugoti.");
        if (response.status === 401) setAuthExpired(true);
        if (response.status === 409) { setReviewRequired("stale"); router.refresh(); }
        if (response.status === 400) { setAttempt(null); setEditedAfterAttempt(false); }
        return;
      }
      setAttempt(null); deleteAttempt.current = null;
      setBaseRevision(result.case.revision);
      if (editedAfterAttempt) {
        setReviewRequired("saved");
        setStatus("Ankstesnis įrašas išsaugotas. Vėliau pakeista forma išliko; peržiūrėkite naujausią eigą prieš kurdami kitą įrašą.");
      } else {
        setDirty(false); setStatus("Įrašas išsaugotas."); form.reset(); setReceiptKnown(false);
        setKind(result.case.progress === "PREPARED" ? "SUBMITTED" : result.case.progress === "CLOSED" || result.case.progress === "RESOLVED" ? "REOPENED" : "RESPONSE_RECORDED");
      }
      setEditedAfterAttempt(false);
      router.refresh();
    } catch { setError("Ryšys nutrūko. Pakartojus veiksmą bus siunčiama ta pati užklausa; jūsų įrašai išliko."); }
    finally { setBusy(false); }
  }
  function reviewLatest() {
    if (reviewRequired === "stale" && item.revision === baseRevision) { router.refresh(); return; }
    if (reviewRequired === "saved" && item.revision < baseRevision) { router.refresh(); return; }
    setBaseRevision(Math.max(item.revision, baseRevision));
    setAttempt(null);
    setEditedAfterAttempt(false);
    setReviewRequired(null);
    setStatus("Naujausia eiga peržiūrėta. Patikrinkite įvestus laukus prieš saugodami.");
    setError("");
  }
  async function removeCase() {
    if (!window.confirm("Ištrinti visą kreipimosi sekimą ir jo istoriją? Dokumentas ir bendri įrodymai išliks.")) return;
    const identity = deleteAttempt.current?.revision === item.revision ? deleteAttempt.current.id : createBrowserUuid();
    if (!identity) { setError("Šioje naršyklėje nepavyko sukurti saugios užklausos tapatybės."); return; }
    const attempt = { id: identity, revision: item.revision };
    deleteAttempt.current = attempt;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/cases/${item.id}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: attempt.id, expectedRevision: attempt.revision }), cache: "no-store" });
      if (response.ok) { setDirty(false); releaseGuard(); router.push("/cases"); router.refresh(); }
      else setError("Nepavyko ištrinti kreipimosi. Bandykite dar kartą.");
    } catch { setError("Ryšys nutrūko. Bandykite trinti dar kartą."); }
    finally { setBusy(false); }
  }
  const options: Kind[] = item.progress === "PREPARED" ? ["SUBMITTED"] : closed ? ["REOPENED"] : ["RESPONSE_RECORDED", "RECEIPT_RECORDED", "SERVICE_STARTED", "SERVICE_RETURNED", "SUBMISSION_CORRECTED", "RECEIPT_CORRECTED", "RESOLVED", "CLOSED"];
  const available = options.filter((option) => option !== "RECEIPT_RECORDED" || !item.received_on).filter((option) => option !== "RECEIPT_CORRECTED" || Boolean(item.received_on)).filter((option) => option !== "SERVICE_STARTED" || !item.service_open).filter((option) => option !== "SERVICE_RETURNED" || item.service_open);
  const serverChanged = item.revision !== baseRevision;
  const activeKind = (dirty || attempt || reviewRequired || serverChanged) ? kind : available.includes(kind) ? kind : available[0];
  const shownOptions = available.includes(activeKind) ? available : [activeKind, ...available];
  const base = `/api/purchases/${purchase.id}/complaints/${version.complaint_id}/versions/${version.id}`;
  return <div className="min-w-0"><h1 className="mt-6 break-words text-3xl font-bold">{purchase.product_name}</h1><p className="mt-2 break-words text-slate-600">Pardavėjas: {purchase.seller_name}</p>
    <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5"><h2 className="text-xl font-bold">Sekamas dokumentas</h2><p className="mt-2 text-sm">Versija {version.version_no} · parengta {new Date(version.generated_at).toLocaleString("lt-LT", { timeZone: "Europe/Vilnius" })}</p><p className="mt-1 text-xs text-slate-600">Ši dokumento versija lieka susieta su kreipimusi. Vėlesnės versijos jos nepakeičia.</p><div className="mt-4 flex flex-wrap gap-4"><a href={`${base}?format=pdf`} className="font-semibold text-teal-800 underline">Atsisiųsti PDF</a><a href={`${base}?format=txt`} className="font-semibold text-teal-800 underline">Atsisiųsti tekstą</a><Link href={`/purchases/${purchase.id}/complaints/${version.complaint_id}`} className="font-semibold text-teal-800 underline">Atidaryti dokumentą</Link></div></section>
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5"><h2 className="text-xl font-bold">Dabartinė eiga</h2><p className="mt-2 font-semibold">{progressLabels[item.progress]}</p><p className="mt-1 text-sm">{item.submitted_on ? `Pateikta ${item.submitted_on} · ${methods[item.submission_method as keyof typeof methods] ?? "Būdas nežinomas"}` : "Pateikimo data neužregistruota"}</p><p className="mt-1 text-sm">{item.received_on ? `Pagal jūsų nurodytą gavimo datą: ${item.received_on}` : "Pardavėjo gavimo data nežinoma"}</p>
      <div className="mt-4 rounded-xl bg-teal-50 p-4 text-sm text-teal-950">{closed ? "Sekimas baigtas. Ankstesnis termino pagrindas išlieka istorijoje." : deadline.state === "UNAVAILABLE" ? deadline.reason : <><p>{deadline.state === "DUE_TODAY" ? "Atsakymo terminas baigiasi šiandien" : deadline.state === "EXPIRED" ? item.has_response ? "Išsamaus atsakymo neužregistravote; patikrinkite susirašinėjimą." : "Atsakymo neužregistravote; patikrinkite susirašinėjimą." : deadline.state === "RESPONSE_RECORDED" ? "Užregistruotas turinio atsakymas." : `Iki atsakymo termino pabaigos: ${deadline.daysRemaining} d.`}</p><p className="mt-1">Atsakymo termino pabaiga: {deadline.date}. Pagal jūsų nurodytą gavimo datą. <a href={CASE_SOURCE_URL} target="_blank" rel="noopener noreferrer" className="underline">Teisės šaltinis</a></p></>}</div>
      {!closed && <p className="mt-4 text-sm text-slate-700">{!item.submitted_on ? "Kitas žingsnis: pateikite parengtą dokumentą pardavėjui ir pažymėkite tikrąją pateikimo datą." : !item.received_on ? "Kitas žingsnis: jei žinote, įrašykite pardavėjo gavimo datą ir saugokite pateikimo įrodymą." : item.service_open ? `Prekė perduota taisyti / tikrinti prieš ${serviceStartedOn ? civilDaysBetween(serviceStartedOn, today) : 0} d.${item.promised_on ? ` Pardavėjo nurodyta data: ${item.promised_on}${item.promised_on < today ? " (ji praėjo)" : ""}.` : ""}` : ["REFUSED", "PARTLY_ACCEPTED"].includes(item.latest_response_outcome ?? "") ? <>Galite susipažinti su <a className="text-teal-800 underline" href="https://vvtat.lrv.lt/lt/kaip-pateikti-prasyma/" target="_blank" rel="noopener noreferrer">oficialia ginčo pateikimo tvarka</a>. Įrašytas atsakymas yra jūsų aprašymas.</> : item.latest_response_outcome === "ACCEPTED" ? "Pardavėjas nurodė, kad sutinka. Pažymėkite išsprendimą tik gavę taisymą, pakeitimą ar pinigus." : ["MORE_INFORMATION", "OTHER"].includes(item.latest_response_outcome ?? "") ? "Užregistruotas tarpinis atsakymas. Pradinė termino data lieka galioti; saugokite susirašinėjimą." : "Sekite pardavėjo atsakymą ir saugokite susirašinėjimą."}</p>}
    </section>
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5"><h2 className="text-xl font-bold">Įrašyti įvykį</h2>{item.progress === "PREPARED" && <p className="mt-2 text-sm">Ši programa dokumento neišsiunčia. Įrašykite, kada jį pateikėte pardavėjui.</p>}
      <form onSubmit={submit} onChange={edited} noValidate={Boolean(attempt)} className="mt-5 space-y-4"><fieldset disabled={busy} className="space-y-4 disabled:opacity-70"><label className="block text-sm font-semibold">Veiksmas<select value={activeKind} disabled={Boolean(attempt || reviewRequired || item.revision < baseRevision)} onChange={(event) => { event.stopPropagation(); if (attempt || reviewRequired) return; if (dirty && !window.confirm("Pakeitus veiksmą, neįrašyti laukai bus išvalyti. Tęsti?")) return; const next = event.target.value as Kind; event.currentTarget.form?.reset(); setReceiptKnown(false); setKind(next); setDirty(false); setBaseRevision(item.revision); setEditedAfterAttempt(false); setError(""); }} className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3">{shownOptions.map((option) => <option key={option} disabled={!available.includes(option)} value={option}>{option === "SUBMITTED" ? "Pažymėti, kad pateikiau pardavėjui" : option === "RESPONSE_RECORDED" ? "Įrašyti pardavėjo atsakymą" : option === "SERVICE_STARTED" ? "Pažymėti, kad perdaviau prekę taisyti / tikrinti" : option === "SERVICE_RETURNED" ? "Prekę atgavau" : eventLabels[option]}</option>)}</select></label>
        <label className="block text-sm font-semibold">{activeKind.startsWith("RECEIPT") ? "Pardavėjo gavimo data" : activeKind === "RESPONSE_RECORDED" ? "Atsakymo data" : activeKind.startsWith("SERVICE") ? "Įvykio data" : "Data"}<input type="date" name="occurredOn" defaultValue={today} max={today} required className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-3" /></label>
        {(activeKind === "SUBMITTED" || activeKind === "SUBMISSION_CORRECTED") && <label className="block text-sm font-semibold">Pateikimo būdas<select name="method" defaultValue={item.submission_method ?? "EMAIL"} className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3">{Object.entries(methods).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>}
        {activeKind === "SUBMITTED" && <><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={receiptKnown} onChange={(event) => { setReceiptKnown(event.target.checked); edited(); }} />Žinau pardavėjo gavimo datą</label>{receiptKnown && <label className="block text-sm font-semibold">Pardavėjo gavimo data<input type="date" name="receivedOn" max={today} required className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-3" /></label>}</>}
        {activeKind === "RESPONSE_RECORDED" && <><label className="block text-sm font-semibold">Mano atsakymo aprašymas<textarea name="summary" required rows={3} className="mt-2 w-full rounded-xl border border-slate-300 p-3" /></label><label className="block text-sm font-semibold">Mano nurodytas atsakymo pobūdis<select name="outcome" className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3">{Object.entries(outcomes).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label></>}
        {activeKind === "SERVICE_STARTED" && <><label className="block text-sm font-semibold">Pardavėjo / serviso numeris (nebūtina)<input name="reference" className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-3" /></label><label className="block text-sm font-semibold">Pardavėjo nurodyta data (nebūtina)<input type="date" name="promisedOn" className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-3" /></label></>}
        {activeKind === "SERVICE_RETURNED" && <label className="block text-sm font-semibold">Trumpas rezultatas<input name="result" className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-3" /></label>}
        {activeKind === "RESOLVED" && <label className="block text-sm font-semibold">Pasiektas rezultatas<select name="resolution" className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3">{Object.entries(resolutions).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>}
        <label className="block text-sm font-semibold">Trumpa pastaba (nebūtina)<textarea name="note" rows={2} className="mt-2 w-full rounded-xl border border-slate-300 p-3" /></label>
        <label className="block text-sm font-semibold">Susijęs įrodymas (nebūtina)<select name="evidenceId" className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3"><option value="">Nepasirinkta</option>{evidence.map((doc) => <option key={doc.id} value={doc.id}>{doc.original_filename}</option>)}</select></label><p className="text-xs text-slate-600">Įrodymus įkelkite <Link href={`/purchases/${purchase.id}`} className="text-teal-800 underline">pirkinio puslapyje</Link>. Failai lieka privatūs.</p>
        {error && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950">{error}{authExpired && <> <Link href={`/login?next=${encodeURIComponent(`/cases/${item.id}`)}`} className="underline">Prisijungti</Link></>}</p>}{status && <p role="status" className="text-sm text-teal-900">{status}</p>}
        <button type="submit" disabled={busy || Boolean(reviewRequired) || (!attempt && (serverChanged || !available.includes(activeKind)))} className="min-h-12 rounded-xl bg-teal-800 px-5 font-semibold text-white disabled:opacity-50">{busy ? "Saugoma..." : attempt ? "Pakartoti tą pačią užklausą" : "Išsaugoti įrašą"}</button></fieldset>
        {attempt && !reviewRequired && <p className="text-sm text-amber-900">Ankstesnio išsaugojimo baigtis neaiški. Pakartojus bus siunčiama ta pati užklausa ir revizija.</p>}
        {dirty && serverChanged && item.revision > baseRevision && !attempt && !reviewRequired && <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950"><p>Kitas langas pakeitė kreipimosi eigą. Jūsų įvesti laukai išliko.</p><button type="button" onClick={reviewLatest} className="mt-2 min-h-12 font-semibold underline">Peržiūrėti naujausią eigą</button></div>}
        {reviewRequired && <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950"><p>Kreipimosi eiga pasikeitė. Jūsų įvesti laukai išliko. Peržiūrėkite naujausią eigą prieš tęsdami.</p><button type="button" onClick={reviewLatest} className="mt-2 min-h-12 font-semibold underline">Atnaujinti eigą ir peržiūrėti įrašą</button></div>}
      </form>
    </section>
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5"><h2 className="text-xl font-bold">Istorija</h2>{events.length === 0 ? <p className="mt-3 text-sm text-slate-600">Įrašų dar nėra.</p> : <ol className="mt-4 space-y-4">{events.map((event) => { return <li key={event.id} className="min-w-0 border-l-2 border-teal-600 pl-4"><p className="font-semibold">{eventLabels[event.kind] ?? "Įvykis"} · {event.occurred_on}{supersededIds.includes(event.id) ? " · pataisyta" : ""}</p><p className="text-xs text-slate-500">Įrašyta {new Date(event.recorded_at).toLocaleString("lt-LT", { timeZone: "Europe/Vilnius" })}{todayInVilnius(new Date(event.recorded_at)) > event.occurred_on ? " · ankstesnio įvykio įrašas" : ""}{event.target_event_id ? " · pataisytas ankstesnis įrašas" : ""}</p><CaseEventDetails event={event} />{event.evidence_id && <p className="mt-2 break-words text-sm">Įrodymas: {event.evidence_filename ?? "Failas"} · {evidenceAvailability[event.evidence_id] ?? "Laikinai nepasiekiamas"}{evidenceAvailability[event.evidence_id] === "Galimas" && <a href={`/api/purchases/${purchase.id}/documents/${event.evidence_id}/access?download=1`} className="ml-2 text-teal-800 underline">Atsisiųsti</a>}</p>}</li>; })}</ol>}</section>
    <div className="mt-8"><button type="button" onClick={removeCase} disabled={busy} className="min-h-12 rounded-xl border border-rose-300 px-5 font-semibold text-rose-800 disabled:opacity-50">Ištrinti kreipimosi sekimą</button></div>
  </div>;
}


function CaseEventDetails({ event }: { event: Event }) {
  const payload = event.payload as Record<string, unknown>;
  const detail = (label: string, key: string) => typeof payload[key] === "string" && payload[key] !== ""
    ? <p key={key} className="mt-1 break-words text-sm">{label}: {String(payload[key])}</p> : null;
  return <>
    {(event.kind === "SUBMITTED" || event.kind === "SUBMISSION_CORRECTED") && typeof payload.method === "string" &&
      <p className="mt-1 break-words text-sm">Pateikimo būdas: {methods[payload.method as keyof typeof methods] ?? "Kitas būdas"}</p>}
    {event.kind === "SUBMITTED" && detail("Pradinė pardavėjo gavimo data", "receivedOn")}
    {event.kind === "RESPONSE_RECORDED" && detail("Jūsų atsakymo aprašymas", "summary")}
    {event.kind === "SERVICE_STARTED" && <>{detail("Pardavėjo / serviso numeris", "reference")}{detail("Pardavėjo nurodyta data", "promisedOn")}</>}
    {event.kind === "SERVICE_RETURNED" && detail("Prekės atgavimo rezultatas", "result")}
    {typeof payload.outcome === "string" && <p className="mt-1 break-words text-sm">{event.kind === "RESOLVED" ? "Pasiektas rezultatas" : "Jūsų nurodytas atsakymo pobūdis"}: {outcomes[payload.outcome as keyof typeof outcomes] ?? resolutions[payload.outcome as keyof typeof resolutions] ?? "Kita"}</p>}
    {detail("Pastaba", "note")}
  </>;
}
