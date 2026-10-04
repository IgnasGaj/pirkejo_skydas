"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Row } from "@/lib/supabase/database.types";
import { createBrowserUuid } from "@/lib/browser-uuid";
import { useUnsavedNavigationGuard } from "@/lib/useUnsavedNavigationGuard";
import { documentLabels } from "@/features/purchases/domain/types";
import { checklist, MAX_EVIDENCE_BYTES, originalDemandFromText, VVTAT_GUIDANCE, VTIS_URL, type Preparation } from "./domain";

type Evidence = Pick<Row<"purchase_documents">, "id" | "original_filename" | "document_type" | "size_bytes" | "upload_state" | "content_sha256"> & { available: boolean };
type Version = Pick<Row<"complaint_versions">, "id" | "complaint_id" | "version_no" | "generated_at" | "snapshot" | "plain_text" | "template_version" | "source_version">;
type Saved = Pick<Row<"vvtat_packages">, "id" | "version_no" | "case_revision" | "created_at">;
type Draft = Omit<Preparation, "reviewed"> & { reviewed: boolean };
const purposes: Record<Preparation["selected"][number]["purpose"], string> = {
  TRANSACTION: "Pirkimo įrodymas", SUBMISSION: "Pateikimo pardavėjui įrodymas", CORRESPONDENCE: "Susirašinėjimas",
  SERVICE: "Taisymo / tikrinimo dokumentas", OTHER: "Kita susijusi medžiaga"
};
const answers: Record<string, string> = { UNKNOWN: "Nežinau", YES: "Taip", NO: "Ne" };
const initialRouting: Preparation["routing"] = { ownGoodsDispute: "UNKNOWN", professionalSeller: "UNKNOWN",
  inLithuania: "UNKNOWN", anotherBody: "UNKNOWN", specialJurisdiction: "UNKNOWN" };
const routeQuestions: Array<[keyof Preparation["routing"], string]> = [
  ["ownGoodsDispute", "Ar tai jūsų kaip vartotojo įsigytos prekės ginčas?"],
  ["professionalSeller", "Ar pardavėjas veikė kaip verslininkas?"],
  ["inLithuania", "Ar ginčas susijęs su pardavėju Lietuvoje?"],
  ["anotherBody", "Ar dėl šio ginčo jau kreipėtės į kitą instituciją ar teismą?"],
  ["specialJurisdiction", "Ar šiam ginčui gali būti taikoma speciali ginčų institucija?"]
];
const card = "rounded-2xl border border-slate-200 bg-white p-5 sm:p-7";
const field = "mt-2 min-h-11 w-full rounded-xl border border-slate-300 px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700";

export function VvtatPreparation({ item, purchase, version, packages, initialEvidence, evidenceCount, eventReferences, today }: {
  item: Row<"cases">; purchase: Pick<Row<"purchases">, "id" | "product_name" | "seller_name" | "purchase_date" | "received_date" | "purchase_channel" | "price_cents" | "updated_at" | "deletion_state">;
  version: Version; packages: Saved[]; initialEvidence: Evidence[]; evidenceCount: number; eventReferences: Record<string, number[]>; today: string;
}) {
  const router = useRouter();
  const historical = version.snapshot as { facts?: { consumerName?: string; consumerEmail?: string; sellerName?: string; sellerContact?: string }; remedy?: string; purchase?: { seller_name?: string; product_name?: string; purchase_date?: string; received_date?: string | null; purchase_channel?: string; price_cents?: number | null } };
  const originalDemand = originalDemandFromText(version.plain_text);
  const [draft, setDraft] = useState<Draft>({ applicantName: historical.facts?.consumerName ?? "", applicantEmail: historical.facts?.consumerEmail ?? "",
    sellerName: historical.facts?.sellerName ?? "", sellerContact: historical.facts?.sellerContact ?? "", disputeSummary: "", escalationReason: "",
    requestedOutcome: originalDemand, outcomeChangedExplanation: "", routing: initialRouting, selected: [], reviewed: false });
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [attempt, setAttempt] = useState<{ requestId: string; expectedRevision: number; preparation: Preparation } | null>(null);
  const [reviewRequired, setReviewRequired] = useState(false);
  const [baseRevision, setBaseRevision] = useState(item.revision);
  const [evidence, setEvidence] = useState(initialEvidence);
  const [selectedMetadata, setSelectedMetadata] = useState<Record<string, Evidence>>({});
  const [count, setCount] = useState(evidenceCount);
  const [evidencePage, setEvidencePage] = useState(1);
  const [loadingEvidence, setLoadingEvidence] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const { releaseGuard, resetLeaveOnEdit } = useUnsavedNavigationGuard(dirty);
  useEffect(() => {
    const refresh = () => router.refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const timer = window.setInterval(refresh, 60_000);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); window.clearInterval(timer); };
  }, [router]);
  useEffect(() => { if (!dirty && !attempt && !reviewRequired) setBaseRevision(item.revision); }, [item.revision, dirty, attempt, reviewRequired]);
  function edit(patch: Partial<Draft>) { resetLeaveOnEdit(); setDirty(true); setDraft((current) => ({ ...current, ...patch, reviewed: false })); setError(""); }
  const selectedBytes = draft.selected.reduce((sum, selected) => sum + (selectedMetadata[selected.id]?.size_bytes ?? 0), 0);
  const check = checklist({ item, preparation: { ...draft, reviewed: true }, today, selectedCount: draft.selected.length });
  const stale = item.revision !== baseRevision;
  async function changePage(page: number) {
    setLoadingEvidence(true);
    try {
      const response = await fetch(`/api/cases/${item.id}/vvtat/evidence?page=${page}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Failų nepavyko įkelti.");
      setEvidence(result.evidence); setCount(result.count); setEvidencePage(page);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Failų nepavyko įkelti."); }
    finally { setLoadingEvidence(false); }
  }
  function select(doc: Evidence, checked: boolean) {
    if (checked) setSelectedMetadata((current) => ({ ...current, [doc.id]: doc }));
    edit({ selected: checked ? [...draft.selected, { id: doc.id, purpose: "OTHER" }] : draft.selected.filter((entry) => entry.id !== doc.id) });
  }
  async function save() {
    if (!attempt && !draft.reviewed) { setError("Patvirtinkite galutinę peržiūrą."); return; }
    if (!attempt && (selectedBytes > MAX_EVIDENCE_BYTES || draft.selected.length > 20)) { setError("Galima pasirinkti iki 20 failų ir 50 MiB."); return; }
    if (!attempt && draft.requestedOutcome.trim() !== originalDemand.trim() && !draft.outcomeChangedExplanation.trim()) {
      setError("Paaiškinkite pasikeitusį reikalavimą."); return;
    }
    if (!attempt && (stale || reviewRequired)) { setError("Peržiūrėkite naujausią kreipimosi eigą prieš rengdami naują versiją."); return; }
    const requestId = attempt?.requestId ?? createBrowserUuid();
    if (!requestId) { setError("Nepavyko sukurti saugios užklausos tapatybės."); return; }
    const body = attempt ?? { requestId, expectedRevision: baseRevision, preparation: { ...draft, reviewed: true as const } };
    if (!attempt) setAttempt(body);
    setBusy(true); setError(""); setStatus("");
    try {
      const response = await fetch(`/api/cases/${item.id}/vvtat`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body), cache: "no-store" });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Nepavyko parengti paketo.");
        if (response.status === 409 || response.status === 401) { setReviewRequired(true); router.refresh(); }
        if (response.status === 400 || response.status === 409) setAttempt(null);
        return;
      }
      setAttempt(null); setBaseRevision(item.revision);
      if (JSON.stringify({ ...draftRef.current, reviewed: true }) === JSON.stringify(body.preparation)) { setDirty(false); releaseGuard(); }
      else { setReviewRequired(true); setStatus("Paketas išsaugotas. Vėliau įvesti pakeitimai išliko; peržiūrėkite juos prieš kurdami kitą versiją."); }
      setStatus((previous) => previous || `Parengta paketo versija ${result.package.versionNo}.`);
      router.refresh();
    } catch { setError("Ryšys nutrūko. Pakartokite išsaugotą užklausą; nauja versija nebus dubliuojama."); }
    finally { setBusy(false); }
  }
  async function download(pkg: Saved, format: "pdf" | "zip") {
    setDownloadError("");
    try {
      const response = await fetch(`/api/cases/${item.id}/vvtat/${pkg.id}?format=${format}`, { cache: "no-store" });
      if (!response.ok) throw new Error(await response.text());
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a"); link.href = url; link.download = `vvtat-paketas-v${pkg.version_no}.${format}`;
      document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (failure) { setDownloadError(failure instanceof Error ? failure.message : "Paketas parengtas, atsisiuntimas nepavyko."); }
  }
  async function remove(pkg: Saved) {
    if (!window.confirm(`Ištrinti paketo versiją ${pkg.version_no}?`)) return;
    const response = await fetch(`/api/cases/${item.id}/vvtat/${pkg.id}`, { method: "DELETE", cache: "no-store" });
    if (!response.ok) { setError(await response.text()); return; }
    router.refresh();
  }
  return <div className="mt-6 space-y-6">
    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">Šis paketas padeda parengti įrodymus. Jis nėra oficialus prašymas, nepatvirtina priimtinumo ir nėra pateikiamas automatiškai. <a className="underline" href={VVTAT_GUIDANCE} target="_blank" rel="noopener noreferrer">Oficiali VVTAT tvarka</a>.</section>
    {item.family !== "DEFECTIVE_PRODUCT" ? <section className={card}><h2 className="text-xl font-bold">Šis atvejis nepalaikomas</h2><p className="mt-2 text-sm">Paketas rengiamas tik nekokybiškos prekės kreipimuisi. Kito dokumento terminai čia netaikomi.</p></section> : <>
      <section className={card}><h2 className="text-xl font-bold">Pasirengimo patikra · {check.state}</h2><p className="mt-2 text-sm">Dokumento versija {version.version_no}, parengta {new Date(version.generated_at).toLocaleString("lt-LT")}. Reikalavimas: {originalDemand}</p><p className="mt-2 text-sm">Pateikta pardavėjui: {item.submitted_on ?? "neįrašyta"}; pardavėjas gavo: {item.received_on ?? "nežinoma"}; atsakymas: {item.latest_response_outcome ?? "neįrašytas"}.</p>
        {historical.purchase?.seller_name && historical.purchase.seller_name !== purchase.seller_name && <p className="mt-2 text-sm text-amber-900">Dabartinis pardavėjo pavadinimas skiriasi nuo dokumento versijoje išsaugoto.</p>}
        {historical.purchase?.product_name && historical.purchase.product_name !== purchase.product_name && <p className="mt-2 text-sm text-amber-900">Dabartinis prekės pavadinimas skiriasi nuo dokumento versijoje išsaugoto.</p>}
        {historical.purchase?.purchase_date && historical.purchase.purchase_date !== purchase.purchase_date && <p className="mt-2 text-sm text-amber-900">Pirkimo data pasikeitė nuo dokumento versijos.</p>}
        {historical.purchase?.received_date !== undefined && historical.purchase.received_date !== purchase.received_date && <p className="mt-2 text-sm text-amber-900">Prekės gavimo data pasikeitė nuo dokumento versijos.</p>}
        {historical.purchase?.purchase_channel && historical.purchase.purchase_channel !== purchase.purchase_channel && <p className="mt-2 text-sm text-amber-900">Pirkimo būdas pasikeitė nuo dokumento versijos.</p>}
        {historical.purchase?.price_cents !== undefined && historical.purchase.price_cents !== purchase.price_cents && <p className="mt-2 text-sm text-amber-900">Prekės kaina pasikeitė nuo dokumento versijos.</p>}
        {check.missing.length > 0 && <ul className="mt-3 list-disc pl-5 text-sm">{check.missing.map((entry) => <li key={entry}>{entry}</li>)}</ul>}
        {check.review.length > 0 && <ul className="mt-3 list-disc pl-5 text-sm text-amber-900">{check.review.map((entry) => <li key={entry}>{entry}</li>)}</ul>}
        <p className="mt-3 text-sm">Nepilną paketą galima parengti, jei aiškiai peržiūrėjote trūkstamus duomenis.</p>
        <details className="mt-3"><summary className="cursor-pointer font-semibold">Peržiūrėti tikslią pardavėjui parengto dokumento versiją</summary><pre className="mt-3 whitespace-pre-wrap break-words text-sm">{version.plain_text}</pre></details>
        <div className="mt-3 flex flex-wrap gap-4 text-sm font-semibold"><a className="text-teal-800 underline" href={`/api/purchases/${purchase.id}/complaints/${version.complaint_id}/versions/${version.id}?format=pdf`}>Atsisiųsti pradinį PDF atskirai</a><a className="text-teal-800 underline" href={`/api/purchases/${purchase.id}/complaints/${version.complaint_id}/versions/${version.id}?format=txt`}>Atsisiųsti pradinį tekstą atskirai</a></div>
      </section>
      <fieldset disabled={busy} className="space-y-6">
        <section className={card}><h2 className="text-xl font-bold">Faktai ir prašomas rezultatas</h2><div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold">Jūsų vardas ir pavardė<input className={field} maxLength={120} value={draft.applicantName} onChange={(e) => edit({ applicantName: e.target.value })} /></label>
          <label className="text-sm font-semibold">Pageidaujamas el. paštas<input className={field} type="email" maxLength={254} value={draft.applicantEmail} onChange={(e) => edit({ applicantEmail: e.target.value })} /></label>
          <label className="text-sm font-semibold">Pardavėjo pavadinimas<input className={field} maxLength={200} value={draft.sellerName} onChange={(e) => edit({ sellerName: e.target.value })} /></label>
          <label className="text-sm font-semibold">Pardavėjo kontaktas<input className={field} maxLength={300} value={draft.sellerContact} onChange={(e) => edit({ sellerContact: e.target.value })} /></label>
          <label className="text-sm font-semibold sm:col-span-2">Ginčo esmė<textarea className={`${field} min-h-28`} maxLength={4000} value={draft.disputeSummary} onChange={(e) => edit({ disputeSummary: e.target.value })} /></label>
          <label className="text-sm font-semibold sm:col-span-2">Kodėl siekiate tolesnės peržiūros?<textarea className={`${field} min-h-24`} maxLength={2000} value={draft.escalationReason} onChange={(e) => edit({ escalationReason: e.target.value })} /></label>
          <label className="text-sm font-semibold sm:col-span-2">Dabar prašomas rezultatas<textarea className={`${field} min-h-24`} maxLength={2000} value={draft.requestedOutcome} onChange={(e) => edit({ requestedOutcome: e.target.value })} /></label>
          {draft.requestedOutcome.trim() !== originalDemand.trim() && <label className="text-sm font-semibold sm:col-span-2">Paaiškinkite pasikeitusį reikalavimą<textarea className={`${field} min-h-20`} maxLength={1000} value={draft.outcomeChangedExplanation} onChange={(e) => edit({ outcomeChangedExplanation: e.target.value })} /></label>}
        </div></section>
        <section className={card}><h2 className="text-xl font-bold">Maršruto klausimai</h2><p className="mt-2 text-sm">Atsakymai yra jūsų pareiškimai. Nežinomus faktus palikite nežinomus.</p><div className="mt-4 space-y-3">{routeQuestions.map(([key, question]) => <label key={key} className="block text-sm font-semibold">{question}<select className={field} value={draft.routing[key]} onChange={(e) => edit({ routing: { ...draft.routing, [key]: e.target.value as Preparation["routing"][typeof key] } })}>{Object.entries(answers).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>)}</div></section>
        <section className={card}><h2 className="text-xl font-bold">Pasirinkti originalūs failai</h2><p className="mt-2 text-sm">Pasirinkite iki 20 failų, iš viso iki 50 MiB. Failai pridedami originaliais baitais; pažymėjimas nepatvirtina jų turinio.</p>
          <div className="mt-4 space-y-3">{evidence.map((doc) => <div key={doc.id} className="rounded-xl border border-slate-200 p-3 text-sm"><label className="flex items-start gap-3"><input type="checkbox" disabled={!doc.available || doc.upload_state !== "READY" || !doc.content_sha256} checked={draft.selected.some((entry) => entry.id === doc.id)} onChange={(e) => select(doc, e.target.checked)} /><span className="break-all">{doc.original_filename} · {documentLabels[doc.document_type]} · {doc.size_bytes} baitų · {doc.available ? "Galimas" : "Nepasiekiamas"}</span></label>{eventReferences[doc.id]?.length > 0 && <p className="ml-6 mt-1 text-slate-600">Susiję eigos įrašai: {eventReferences[doc.id].join(", ")}</p>}{doc.available && <a href={`/api/purchases/${purchase.id}/documents/${doc.id}/access?download=1`} className="ml-6 text-teal-800 underline">Atsisiųsti atskirai</a>}{draft.selected.some((entry) => entry.id === doc.id) && <select aria-label={`${doc.original_filename} paskirtis`} className={field} value={draft.selected.find((entry) => entry.id === doc.id)?.purpose} onChange={(e) => edit({ selected: draft.selected.map((entry) => entry.id === doc.id ? { ...entry, purpose: e.target.value as Preparation["selected"][number]["purpose"] } : entry) })}>{Object.entries(purposes).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>}</div>)}</div>
          <div className="mt-4 flex gap-4 text-sm"><button type="button" className="font-semibold text-teal-800 disabled:opacity-40" disabled={evidencePage === 1 || loadingEvidence} onClick={() => changePage(evidencePage - 1)}>← Ankstesni</button><span>{evidencePage} / {Math.max(1, Math.ceil(count / 50))}</span><button type="button" className="font-semibold text-teal-800 disabled:opacity-40" disabled={evidencePage * 50 >= count || loadingEvidence} onClick={() => changePage(evidencePage + 1)}>Kiti →</button></div>
          <p className="mt-2 text-sm">Pasirinkta: {draft.selected.length}; pasirinktų failų dydis: {selectedBytes} baitų. Atranka išlieka keičiant puslapius.</p>
        </section>
        <section className={card}><h2 className="text-xl font-bold">Galutinė peržiūra</h2><p className="mt-2 text-sm">Patikrinkite faktus, pradinį reikalavimą, pasirinktus failus, trūkumus ir šaltinių ribas. Parengimas nekeičia kreipimosi eigos ir nereiškia pateikimo institucijai.</p>
          {draft.selected.length > 0 && <p className="mt-2 text-sm">Pasirinkti failų ID: {draft.selected.map((entry) => entry.id).join(", ")}</p>}
          <label className="mt-4 flex gap-3 text-sm font-semibold"><input type="checkbox" checked={draft.reviewed} onChange={(e) => { resetLeaveOnEdit(); setDirty(true); setDraft((current) => ({ ...current, reviewed: e.target.checked })); }} />Peržiūrėjau santrauką, savo nurodytus faktus, pasirinktus failus ir trūkstamus duomenis.</label>
          {(stale || reviewRequired) && <div role="alert" className="mt-4 rounded-xl bg-amber-50 p-4 text-sm"><p>Kreipimosi eiga pasikeitė arba ankstesnė užklausa gali būti išsaugota. Pakartokite neaiškų bandymą arba peržiūrėkite naujausią eigą.</p><button type="button" className="mt-2 font-semibold text-teal-800" onClick={() => { if (attempt) { setError("Pirmiausia pakartokite ankstesnę užklausą, kad būtų nustatytas jos rezultatas."); return; } setBaseRevision(item.revision); setReviewRequired(false); setDraft((current) => ({ ...current, reviewed: false })); }}>Peržiūrėjau naujausią eigą</button></div>}
          {error && <p role="alert" className="mt-4 text-sm text-rose-800">{error}</p>}{status && <p role="status" className="mt-4 text-sm text-teal-800">{status}</p>}
          <button type="button" onClick={save} disabled={busy || (!draft.reviewed && !attempt)} className="mt-4 min-h-12 rounded-xl bg-teal-800 px-5 font-semibold text-white disabled:opacity-50">{attempt ? "Pakartoti tą patį išsaugojimą" : "Parengti paketo versiją"}</button>
        </section>
      </fieldset>
    </>}
    <section className={card}><h2 className="text-xl font-bold">Parengtos versijos</h2>{packages.length === 0 && <p className="mt-2 text-sm">Dar nėra parengto paketo.</p>}{packages.map((pkg) => {
      const old = pkg.case_revision !== item.revision;
      return <article key={pkg.id} className="mt-4 rounded-xl border border-slate-200 p-4"><h3 className="font-bold">Versija {pkg.version_no} · {new Date(pkg.created_at).toLocaleString("lt-LT")}</h3>{old && <p className="mt-2 text-sm text-amber-900">Kreipimosi eiga pasikeitė nuo paketo parengimo. Ši versija yra istorinė.</p>}<p className="mt-2 text-sm">Pašalintas ar pasikeitęs failas gali sustabdyti atsisiuntimą.</p><div className="mt-3 flex flex-wrap gap-3"><button type="button" onClick={() => download(pkg, "pdf")} className="min-h-11 rounded-xl border border-teal-700 px-4 font-semibold text-teal-800">Atsisiųsti santrauką PDF</button><button type="button" onClick={() => download(pkg, "zip")} className="min-h-11 rounded-xl bg-teal-800 px-4 font-semibold text-white">Atsisiųsti dokumentų paketą ZIP</button><button type="button" onClick={() => remove(pkg)} className="min-h-11 rounded-xl border border-rose-300 px-4 font-semibold text-rose-800">Ištrinti versiją</button></div></article>;
    })}{downloadError && <p role="alert" className="mt-3 text-sm text-rose-800">{downloadError}</p>}</section>
    <section className={card}><h2 className="text-xl font-bold">Pateikimas jūsų pasirinktu oficialiu kanalu</h2><p className="mt-2 text-sm">Oficialiame prašyme patys užpildykite aktualius laukus, pasirinkite priedus ir vykdykite tapatybės bei pasirašymo nurodymus. Nežinoma, ar oficialus kanalas priima visą ZIP; prireikus naudokite atskirus dokumentus. Atsisiuntimas nėra pateikimo įrodymas.</p><div className="mt-3 flex gap-5 text-sm font-semibold"><a href={VVTAT_GUIDANCE} target="_blank" rel="noopener noreferrer" className="text-teal-800 underline">VVTAT instrukcija</a><a href={VTIS_URL} target="_blank" rel="noopener noreferrer" className="text-teal-800 underline">VTIS portalas</a></div></section>
  </div>;
}
