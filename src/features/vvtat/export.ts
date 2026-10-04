import "server-only";
import { createHash } from "node:crypto";
import { zipSync, strToU8 } from "fflate";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Row } from "@/lib/supabase/database.types";
import { renderComplaintPdf, renderPreparationPdf } from "@/features/complaints/pdf";
import { chronologyText, MAX_ARCHIVE_BYTES, MAX_EVIDENCE_BYTES, MAX_HISTORY_TEXT,
  safeArchiveName, VVTAT_GUIDANCE, VTIS_URL, type PackageSnapshot, type Preparation } from "./domain";
import { originalDemandFromText } from "./domain";

export class PackageExportError extends Error {}
const localDateTime = (value: string) => new Date(value).toLocaleString("lt-LT", { timeZone: "Europe/Vilnius" });

function asSnapshot(pkg: Row<"vvtat_packages">): PackageSnapshot {
  const data = pkg.snapshot as unknown as PackageSnapshot;
  if (!data || !Array.isArray(data.events) || !Array.isArray(data.selected) || !Array.isArray(data.missingItems) ||
    !Array.isArray(data.reviewItems) || !Array.isArray(data.sourceLimitations) || !data.complaintVersion || !data.case)
    throw new PackageExportError("Paketo duomenys nepasiekiami. Kreipkitės pagalbos.");
  return data;
}
function summarySections(pkg: Row<"vvtat_packages">, snapshot: PackageSnapshot) {
  const input = pkg.request_payload as unknown as Preparation;
  const history = chronologyText(snapshot);
  if (history.length > MAX_HISTORY_TEXT) throw new PackageExportError("Kreipimosi istorija per ilga. Sutrumpinkite ją prieš rengdami naują paketą.");
  const originalDemand = originalDemandFromText(snapshot.complaintVersion.plainText);
  return [
    `GINČO RENGIMO SANTRAUKA\nPaketo versija: ${pkg.version_no}\nParengta: ${localDateTime(pkg.created_at)}\nKreipimosi redakcija: ${pkg.case_revision}\nDokumento versija: ${snapshot.complaintVersion.versionNo} (${localDateTime(snapshot.complaintVersion.generatedAt)})`,
    `Pareiškėjas (naudotojo peržiūrėti duomenys): ${input.applicantName || "Nenurodyta"}\nKontaktas: ${input.applicantEmail || "Nenurodytas"}\nPardavėjas: ${input.sellerName || "Nenurodytas"}\nPardavėjo kontaktas: ${input.sellerContact || "Nenurodytas"}`,
    `Prekė: ${snapshot.purchase.product_name}\nPirkimo data: ${snapshot.purchase.purchase_date}\nPateikta pardavėjui: ${snapshot.case.submitted_on ?? "Neįrašyta"}\nPardavėjas gavo: ${snapshot.case.received_on ?? "Nežinoma"}\nPradinio dokumento reikalavimas: ${originalDemand}`,
    `Naudotojo aprašyta ginčo esmė:\n${input.disputeSummary || "Nenurodyta"}\n\nKreipimosi dėl tolesnės peržiūros priežastis:\n${input.escalationReason || "Nenurodyta"}\n\nDabar prašomas rezultatas:\n${input.requestedOutcome || "Nenurodytas"}${input.outcomeChangedExplanation ? `\nPasikeitimo paaiškinimas: ${input.outcomeChangedExplanation}` : ""}`,
    `Trūkstami duomenys: ${snapshot.missingItems.length ? snapshot.missingItems.join("; ") : "Nenustatyta"}\nPatikrinimo klausimai: ${snapshot.reviewItems.length ? snapshot.reviewItems.join("; ") : "Nenustatyta"}`,
    `Šaltinio versija: ${snapshot.sourceVersion}; taisyklės versija: ${snapshot.ruleVersion ?? "neprieinama"}; šablono versija: ${snapshot.templateVersion}. Šaltinių ribos: ${snapshot.sourceLimitations.join("; ")}. Ši santrauka yra pasirengimo medžiaga, ne oficialus prašymas. Įrašai yra naudotojo pateikti faktai; failai patys savaime neįrodo įvykių. Archyvas nebuvo pateiktas institucijai.`,
    `VISI KREIPIMOSI EIGOS ĮRAŠAI\nNurodyta įvykio data; skliausteliuose — įrašo laikas. Pataisos paliktos greta pirminių įrašų.\n${history || "Įrašų nėra."}`
  ];
}

const eventLabels: Record<string, string> = {
  SUBMITTED: "Pateikta pardavėjui", SUBMISSION_CORRECTED: "Pateikimo pataisa",
  RECEIPT_RECORDED: "Gavimo data įrašyta", RECEIPT_CORRECTED: "Gavimo pataisa",
  RESPONSE_RECORDED: "Pardavėjo atsakymas", SERVICE_STARTED: "Perduota taisyti ar tikrinti",
  SERVICE_RETURNED: "Prekė grąžinta", RESOLVED: "Pažymėta išspręsta",
  CLOSED: "Sekimas uždarytas", REOPENED: "Sekimas atnaujintas"
};
const detailLabels: Record<string, string> = { method: "Pateikimo būdas", receivedOn: "Pardavėjo gavimo data",
  note: "Pastaba", summary: "Atsakymo aprašymas", outcome: "Atsakymo pobūdis / rezultatas",
  reference: "Serviso numeris", promisedOn: "Žadėta data", result: "Taisymo rezultatas" };
const detailValues: Record<string, string> = { EMAIL: "El. paštu", REGISTERED_POST: "Registruotu paštu", IN_PERSON: "Asmeniškai",
  VTIS: "Per VTIS", OTHER: "Kita", ACCEPTED: "Patenkino", PARTLY_ACCEPTED: "Patenkino iš dalies",
  REFUSED: "Atsisakė", MORE_INFORMATION: "Paprašė papildomų duomenų", REPAIRED: "Pataisyta",
  REPLACED: "Pakeista", REFUND_RECEIVED: "Pinigai grąžinti", PRICE_REDUCTION: "Kaina sumažinta" };
function localizedHistory(snapshot: PackageSnapshot) {
  const eventsById = new Map(snapshot.events.map((event) => [event.id, event]));
  return snapshot.events.map((event) => {
    const payload = event.payload as Record<string, unknown>;
    const details = Object.entries(payload).map(([key, value]) => `${detailLabels[key] ?? "Papildoma informacija"}: ${detailValues[String(value)] ?? String(value)}`).join("; ");
    const original = event.target_event_id ? eventsById.get(event.target_event_id) : null;
    const correction = original ? `; pataisytas ${original.revision} įrašas (pradinė data ${original.occurred_on}, duomenys: ${Object.entries(original.payload as Record<string, unknown>).map(([key, value]) => `${detailLabels[key] ?? "Papildoma informacija"}: ${detailValues[String(value)] ?? String(value)}`).join("; ")})` : "";
    return `${event.revision}. ${event.occurred_on} (${localDateTime(event.recorded_at)}) — ${eventLabels[event.kind] ?? "Įvykis"}${correction}${details ? `; ${details}` : ""}${event.evidence_filename ? `; įrodymas: ${event.evidence_filename}` : ""}`;
  }).join("\n");
}

export async function preparationPdf(pkg: Row<"vvtat_packages">) {
  const snapshot = asSnapshot(pkg);
  const sections = summarySections(pkg, snapshot);
  sections[sections.length - 1] = `VISI KREIPIMOSI EIGOS ĮRAŠAI\nNurodyta įvykio data; skliausteliuose — įrašo laikas. Pataisos paliktos greta pirminių įrašų.\n${localizedHistory(snapshot) || "Įrašų nėra."}`;
  try { return await renderPreparationPdf(sections); }
  catch { throw new PackageExportError("Santrauka per ilga arba joje yra nepalaikomų simbolių. Peržiūrėkite įrašus."); }
}

export async function verifyPackageEvidenceMetadata(client: SupabaseClient<Database>, pkg: Row<"vvtat_packages">) {
  const snapshot = asSnapshot(pkg);
  for (const selected of snapshot.selected) {
    const { data: doc, error } = await client.from("purchase_documents").select("id,original_filename,size_bytes,content_sha256,storage_path")
      .eq("id", selected.id).eq("user_id", pkg.user_id).eq("purchase_id", pkg.purchase_id).eq("upload_state", "READY").maybeSingle();
    if (error || !doc || doc.size_bytes !== selected.sizeBytes || doc.content_sha256 !== selected.sha256 ||
      doc.original_filename !== selected.filename)
      throw new PackageExportError("Pasirinktas įrodymas pašalintas arba pasikeitė. Peržiūrėkite failus.");
    const available = await client.storage.from("purchase-evidence").info(doc.storage_path);
    if (available.error) throw new PackageExportError("Pasirinktas įrodymas laikinai nepasiekiamas. Bandykite dar kartą.");
  }
}

export async function packageZip(client: SupabaseClient<Database>, pkg: Row<"vvtat_packages">) {
  const snapshot = asSnapshot(pkg);
  const summary = await preparationPdf(pkg);
  const complaintSections = snapshot.complaintVersion.sections;
  if (!Array.isArray(complaintSections) || complaintSections.some((s) => typeof s !== "string"))
    throw new PackageExportError("Pradinio dokumento turinys nepasiekiamas.");
  let complaintPdf: Uint8Array;
  try { complaintPdf = await renderComplaintPdf(complaintSections as string[]); }
  catch { throw new PackageExportError("Pradinio dokumento PDF nepavyko parengti."); }
  const files: Record<string, Uint8Array> = {
    "01-ginco-santrauka.pdf": summary,
    "02-kreipimasis-pardavejui.pdf": complaintPdf,
    "02-kreipimasis-pardavejui.txt": strToU8(snapshot.complaintVersion.plainText),
    "irodymai/": new Uint8Array()
  };
  const manifest: string[] = ["PRIEDŲ SĄRAŠAS", `Paketo versija: ${pkg.version_no}`];
  let total = 0;
  if (snapshot.selected.length > 20) throw new PackageExportError("Pasirinkta per daug failų.");
  for (const selected of snapshot.selected) {
    const { data: doc, error } = await client.from("purchase_documents").select("*")
      .eq("id", selected.id).eq("user_id", pkg.user_id).eq("purchase_id", pkg.purchase_id).eq("upload_state", "READY").maybeSingle();
    if (error || !doc || doc.size_bytes !== selected.sizeBytes || doc.content_sha256 !== selected.sha256 ||
      doc.original_filename !== selected.filename)
      throw new PackageExportError("Pasirinktas įrodymas pašalintas arba pasikeitė. Peržiūrėkite failus.");
    total += doc.size_bytes;
    if (total > MAX_EVIDENCE_BYTES) throw new PackageExportError("Pasirinkti failai viršija 50 MiB ribą.");
    const downloaded = await client.storage.from("purchase-evidence").download(doc.storage_path);
    if (downloaded.error || !downloaded.data) throw new PackageExportError("Pasirinktas įrodymas laikinai nepasiekiamas. Bandykite dar kartą.");
    if (downloaded.data.size !== selected.sizeBytes || downloaded.data.size > 15 * 1024 * 1024)
      throw new PackageExportError("Įrodymo dydis pasikeitė. Paketas neatsiųstas.");
    const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
    const hash = createHash("sha256").update(bytes).digest("hex");
    if (bytes.length !== selected.sizeBytes || hash !== selected.sha256)
      throw new PackageExportError("Įrodymo dydis arba kontrolinė suma nesutampa. Paketas neatsiųstas.");
    const name = safeArchiveName(selected.ordinal, selected.filename);
    if (files[name]) throw new PackageExportError("Pasikartojantis failo vardas archyve.");
    files[name] = bytes;
    const purpose = { TRANSACTION: "Pirkimo įrodymas", SUBMISSION: "Pateikimo pardavėjui įrodymas",
      CORRESPONDENCE: "Susirašinėjimas", SERVICE: "Taisymo / tikrinimo dokumentas", OTHER: "Kita susijusi medžiaga" }[selected.purpose];
    const related = snapshot.events.filter((event) => event.evidence_id === selected.id).map((event) => event.revision);
    manifest.push(`${selected.ordinal}. ${selected.filename.replace(/[\u0000-\u001f\u007f]/gu, " ")}\nArchyve: ${name}\nPaskirtis: ${purpose}\nSusiję eigos įrašai: ${related.join(", ") || "nenurodyta"}\nID: ${selected.id}\nDydis: ${bytes.length} baitų\nSHA-256: ${hash}`);
  }
  files["priedu-sarasas.txt"] = strToU8(manifest.join("\n\n") + "\n");
  files["pateikimo-instrukcija.txt"] = strToU8(
    `Šis dokumentų paketas yra pasirengimo medžiaga. Jis nėra oficialus prašymas ir nebuvo pateiktas VVTAT ar VTIS.\n` +
    `Patikrinkite aktualią tvarką: ${VVTAT_GUIDANCE}\nVTIS: ${VTIS_URL}\n` +
    `Oficialiame kanale patys užpildykite reikalaujamus laukus, pridėkite tinkamus dokumentus, laikykitės tapatybės ir pasirašymo nurodymų ir pateikite prašymą. Nepatikrinta, ar galima įkelti visą ZIP; prireikus rinkitės atskirus failus.\n` +
    `Trūksta: ${snapshot.missingItems.join("; ") || "nenustatyta"}.\nPatikrinkite: ${snapshot.reviewItems.join("; ") || "nenustatyta"}.\n` +
    `Šaltinių ribos: ${snapshot.sourceLimitations.join("; ")}.\n` +
    `Šaltinių versija rengimo metu: ${snapshot.sourceVersion}. Senesniame pakete pateikta informacija nėra naujas teisinių šaltinių patikrinimas.\n`
  );
  const estimated = Object.values(files).reduce((sum, bytes) => sum + bytes.length, 0);
  if (estimated > MAX_ARCHIVE_BYTES - 1_000_000) throw new PackageExportError("Paketas viršija archyvo dydžio ribą.");
  const zipped = zipSync(Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, [bytes, { level: 0 }]])));
  if (zipped.length > MAX_ARCHIVE_BYTES) throw new PackageExportError("Paketas viršija 60 MiB archyvo ribą.");
  return zipped;
}
