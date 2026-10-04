import { z } from "zod";
import { responseDeadline, CASE_VERIFIED_THROUGH } from "@/features/cases/domain";
import type { Row } from "@/lib/supabase/database.types";

export const VVTAT_TEMPLATE_VERSION = "2026-10-04.1";
export const VVTAT_SOURCE_VERSION = "2026-10-04";
export const VVTAT_GUIDANCE = "https://vvtat.lrv.lt/lt/kaip-pateikti-prasyma/";
export const VTIS_URL = "https://www.vtis.lt/";
export const MAX_EVIDENCE_BYTES = 50 * 1024 * 1024;
export const MAX_ARCHIVE_BYTES = 60 * 1024 * 1024;
export const MAX_HISTORY_TEXT = 120_000;

const line = (max: number) => z.string().trim().max(max).refine((value) => !/[\u0000-\u001f\u007f\u2028\u2029]/u.test(value));
const answer = z.enum(["YES", "NO", "UNKNOWN"]);
export const preparationSchema = z.strictObject({
  applicantName: line(120), applicantEmail: z.union([z.literal(""), z.email().max(254)]),
  sellerName: line(200), sellerContact: line(300), disputeSummary: z.string().trim().max(4000),
  escalationReason: z.string().trim().max(2000), requestedOutcome: z.string().trim().max(2000),
  outcomeChangedExplanation: z.string().trim().max(1000),
  routing: z.strictObject({ ownGoodsDispute: answer, professionalSeller: answer, inLithuania: answer,
    anotherBody: answer, specialJurisdiction: answer }),
  selected: z.array(z.strictObject({ id: z.uuid(), purpose: z.enum(["TRANSACTION", "SUBMISSION", "CORRESPONDENCE", "SERVICE", "OTHER"]) })).max(20)
    .refine((items) => new Set(items.map((item) => item.id)).size === items.length),
  reviewed: z.literal(true)
});
export type Preparation = z.infer<typeof preparationSchema>;
export type PackageSnapshot = {
  case: Row<"cases">; purchase: Row<"purchases">;
  complaintVersion: { id: string; versionNo: number; generatedAt: string; documentDate: string;
    snapshot: unknown; sections: unknown; plainText: string; templateVersion: string; sourceVersion: string };
  events: Array<Omit<Row<"case_events">, "result_snapshot">>;
  selected: Array<{ id: string; purpose: Preparation["selected"][number]["purpose"]; ordinal: number;
    filename: string; documentType: string; mimeType: string; sizeBytes: number; sha256: string }>;
  sourceVersion: string; ruleVersion: string | null; templateVersion: string;
};

export function checklist(input: { item: Row<"cases">; preparation: Preparation; today: string; selectedCount: number }) {
  const { item, preparation, today, selectedCount } = input;
  const missing: string[] = [];
  const review: string[] = [];
  if (!item.submitted_on) missing.push("Neįrašyta, kada kreipimasis pateiktas pardavėjui.");
  if (!item.received_on) review.push("Pardavėjo gavimo data nežinoma.");
  if (!preparation.applicantName || !preparation.applicantEmail) missing.push("Trūksta peržiūrėtų pareiškėjo kontaktų.");
  if (!preparation.sellerName) missing.push("Trūksta peržiūrėto pardavėjo pavadinimo.");
  if (!preparation.disputeSummary || !preparation.escalationReason || !preparation.requestedOutcome)
    missing.push("Užpildykite ginčo esmę, kreipimosi priežastį ir prašomą rezultatą.");
  if (!selectedCount) review.push("Nepasirinkta įrodymų failų.");
  if (item.progress === "CLOSED" || item.progress === "RESOLVED") review.push("Sekimas uždarytas arba ginčas pažymėtas išspręstu. Paketas bus istorinis.");
  if (preparation.routing.ownGoodsDispute !== "YES" || preparation.routing.professionalSeller !== "YES" ||
    preparation.routing.inLithuania !== "YES" || preparation.routing.anotherBody !== "NO" ||
    preparation.routing.specialJurisdiction !== "NO")
    review.push("Patikrinkite, ar ginčas patenka į šį vartojimo prekių maršrutą; oficialus vedlys pateikia aktualią kryptį.");
  const clock = responseDeadline({ family: item.family, submittedOn: item.submitted_on,
    receivedOn: item.received_on, substantiveResponse: item.has_substantive_response,
    today, sourceValidThrough: CASE_VERIFIED_THROUGH });
  if (item.latest_response_outcome === "REFUSED" || item.latest_response_outcome === "PARTLY_ACCEPTED") {
    review.push("Pardavėjo atsakymo pobūdis yra jūsų įrašytas faktas. Peržiūrėkite atsakymo kopiją.");
  } else if (!item.has_substantive_response) {
    if (clock.state === "UNAVAILABLE") review.push(clock.reason);
    else if (clock.state !== "EXPIRED") review.push("Atsakymo laikotarpis dar nesibaigė. Nepateikite neatsakymo kaip fakto.");
    else review.push("Patikrinkite, ar nebuvo gautas neįrašytas pardavėjo atsakymas.");
  }
  if (today > CASE_VERIFIED_THROUGH) review.push("Teisinio termino šaltinio patikros laikotarpis pasibaigęs.");
  return { missing, review, clock, state: item.family !== "DEFECTIVE_PRODUCT" ? "Šis atvejis nepalaikomas" : missing.length ? "Trūksta duomenų" : review.length ? "Reikia patikrinti" : "Parengta peržiūrai" };
}

export function safeArchiveName(index: number, filename: string) {
  const basename = filename.replace(/[\\/\u0000-\u001f\u007f]/gu, "_").replace(/^\.+/u, "_").slice(0, 100);
  return `irodymai/${String(index).padStart(2, "0")}-${basename || "failas"}`;
}

export function originalDemandFromText(text: string) {
  return text.split("\n").find((line) => line.trim().startsWith("Prašau ") && !line.includes("raštu informuoti"))?.trim()
    ?? "Pradinis reikalavimas pateiktas pridėtame dokumente.";
}

export function chronologyText(snapshot: PackageSnapshot) {
  return snapshot.events.map((event) => {
    const details = Object.entries(event.payload && typeof event.payload === "object" && !Array.isArray(event.payload) ? event.payload : {})
      .map(([key, value]) => `${key}: ${String(value)}`).join("; ");
    return `${event.revision}. ${event.occurred_on} (${event.recorded_at}) — ${event.kind}${event.target_event_id ? `; taiso įrašą ${event.target_event_id}` : ""}${details ? `; ${details}` : ""}${event.evidence_filename ? `; failas: ${event.evidence_filename}` : ""}`;
  }).join("\n");
}
