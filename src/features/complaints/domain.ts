import { z } from "zod";
import { returnCaseSchema, type ReturnCaseInput } from "@/features/returns/domain/types";
import { evaluateReturnCase } from "@/features/returns/domain/evaluateReturnCase";
import { defectiveProductCaseSchema } from "@/features/defective-product/domain/schemas";
import { evaluateDefectiveProductCase } from "@/features/defective-product/domain/evaluateDefectiveProductCase";
import type { DefectiveProductCaseInput } from "@/features/defective-product/domain/types";
import type { Purchase, PurchaseDocument } from "@/features/purchases/domain/types";
import { assertDocumentBudget, MAX_PRICE_CENTS } from "./limits";

export const TEMPLATE_VERSION = "2026-10-03.1";
export const SOURCE_VERSION = "2026-10-03";
export const familySchema = z.enum(["DEFECTIVE_PRODUCT", "DISTANCE_WITHDRAWAL", "PHYSICAL_RETURN_REQUEST"]);
export type Family = z.infer<typeof familySchema>;
export const requestSchema = z.enum(["REPAIR", "REPLACEMENT", "PRICE_REDUCTION", "TERMINATION_REFUND", "WITHDRAW", "EXCHANGE", "CONSENT_RETURN"]);
export type Request = z.infer<typeof requestSchema>;
const date = z.iso.date();
const singleLine = (max: number) => z.string().trim().max(max).refine((value) => !/[\r\n\u2028\u2029\u0000-\u001f\u007f]/u.test(value), "Vienos eilutės laukelyje negali būti eilučių lūžių ar valdymo simbolių.");
const line = (max: number) => singleLine(max).min(1);
export const factsSchema = z.object({
  consumerName: line(120), consumerEmail: z.email().max(254), sellerName: line(200),
  sellerContact: singleLine(300).default(""), productName: line(200),
  purchaseDate: date, receivedDate: date.nullable(), purchaseChannel: z.enum(["PHYSICAL_STORE", "DISTANCE"]),
  referenceNumber: singleLine(200).default(""), priceCents: z.number().int().min(0).max(MAX_PRICE_CENTS).nullable(),
  documentDate: date, defectDescription: z.string().trim().max(4000).default(""),
  defectDiscoveredAt: date.nullable(), reductionCents: z.number().int().positive().nullable(),
  reductionExplanation: z.string().trim().max(1000).default(""),
  physicalReason: z.enum(["SIZE", "SHAPE", "COLOR", "MODEL", "COMPLETENESS"]).nullable().default(null),
  confirmedNotMinor: z.boolean().default(false), alternativeProof: z.string().trim().max(500).default(""),
  evidenceIds: z.array(z.uuid()).max(12).refine((ids) => new Set(ids).size === ids.length)
});
export type Facts = z.infer<typeof factsSchema>;
export type Answers = ReturnCaseInput | DefectiveProductCaseInput;

export function decide(family: Family, raw: unknown, today: string) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const serverDated = { ...raw, asOfDate: today };
  if (family === "DEFECTIVE_PRODUCT") {
    const parsed = defectiveProductCaseSchema.safeParse(serverDated);
    if (!parsed.success) return null;
    const answers = { ...parsed.data, asOfDate: today };
    return { answers, decision: evaluateDefectiveProductCase(answers) };
  }
  const parsed = returnCaseSchema.safeParse(serverDated);
  if (!parsed.success) return null;
  const answers = { ...parsed.data, asOfDate: today };
  return { answers, decision: evaluateReturnCase(answers) };
}

/** Only structured engine codes can open a document route. */
export function supportedRequests(family: Family, decision: { code: string; secondaryRemedyGrounds?: string[] }): Request[] {
  if (family === "DEFECTIVE_PRODUCT") {
    if (["CONTACT_SELLER_REPAIR_OR_REPLACE", "PRIMARY_REMEDY_FIRST"].includes(decision.code)) return ["REPAIR", "REPLACEMENT"];
    if (decision.code === "SECONDARY_REMEDIES_MAY_BE_AVAILABLE" && decision.secondaryRemedyGrounds?.length) return ["PRICE_REDUCTION", "TERMINATION_REFUND"];
    return [];
  }
  if (family === "DISTANCE_WITHDRAWAL") return decision.code === "DISTANCE_WITHDRAWAL_LIKELY_AVAILABLE" ? ["WITHDRAW"] : [];
  if (decision.code === "PHYSICAL_RETURN_LIKELY_AVAILABLE") return ["EXCHANGE"];
  if (decision.code === "SELLER_CONSENT_REQUIRED") return ["CONSENT_RETURN"];
  return [];
}

export function validateReviewed(family: Family, answers: Answers, decision: { code: string; secondaryRemedyGrounds?: string[] }, request: Request, raw: unknown, purchase: Purchase, today: string): Facts {
  if (purchase.purchase_channel === "UNKNOWN") throw new Error("Pirkinio įraše nurodykite, kaip pirkote prekę, ir pakartokite teisinę patikrą.");
  if (purchase.price_cents != null && purchase.price_cents > MAX_PRICE_CENTS) throw new Error("Pirkinio kaina viršija 1 000 000 EUR. Pataisykite kainą pirkinio įraše prieš rengdami dokumentą.");
  for (const [name, value] of [["prekės pavadinimas", purchase.product_name], ["pardavėjo pavadinimas", purchase.seller_name], ["užsakymo numeris", purchase.reference_number ?? ""]]) {
    if (/[\r\n\u2028\u2029\u0000-\u001f\u007f]/u.test(value)) throw new Error(`Pirkinio lauke „${name}“ yra eilučių lūžių arba valdymo simbolių. Pataisykite jį pirkinio įraše.`);
  }
  const facts = factsSchema.parse(raw);
  if (!supportedRequests(family, decision).includes(request)) throw new Error("Pasirinktas reikalavimas nepalaikomas. Pakartokite patikrą.");
  if (facts.documentDate > today || facts.documentDate < purchase.purchase_date) throw new Error("Patikrinkite dokumento datą.");
  if (facts.purchaseDate !== purchase.purchase_date || facts.purchaseChannel !== purchase.purchase_channel || facts.receivedDate !== purchase.received_date) throw new Error("Pirkinio duomenys pasikeitė. Atnaujinkite ir pakartokite patikrą.");
  if (family === "DEFECTIVE_PRODUCT") {
    const a = answers as DefectiveProductCaseInput;
    if (a.purchasedAt && a.purchasedAt !== purchase.purchase_date) throw new Error("Patikros pirkimo data nesutampa su pirkinio įrašu.");
    if (a.deliveredAt !== (purchase.received_date ?? purchase.purchase_date)) throw new Error("Patikros gavimo data nesutampa su pirkinio įrašu.");
  } else {
    const a = answers as ReturnCaseInput;
    if (a.purchaseChannel !== purchase.purchase_channel || (a.purchaseChannel === "PHYSICAL_STORE" && a.purchaseDate !== purchase.purchase_date) || (a.purchaseChannel === "DISTANCE" && a.deliveryDate !== purchase.received_date)) throw new Error("Patikros datos arba pirkimo būdas nesutampa su pirkinio įrašu.");
  }
  if (facts.productName !== purchase.product_name || facts.sellerName !== purchase.seller_name) throw new Error("Pirkinio duomenys pasikeitė. Atnaujinkite ir pakartokite patikrą.");
  if (facts.priceCents !== purchase.price_cents) throw new Error("Kainą pirmiausia patvirtinkite pirkinio įraše.");
  if (family === "DEFECTIVE_PRODUCT") {
    const a = answers as DefectiveProductCaseInput;
    if (!facts.defectDescription || facts.defectDescription.length < 10) throw new Error("Aprašykite prekės trūkumą bent 10 simbolių.");
    if (facts.defectDiscoveredAt && (facts.defectDiscoveredAt < (purchase.received_date ?? purchase.purchase_date) || facts.defectDiscoveredAt > today)) throw new Error("Trūkumo pastebėjimo data negali būti ankstesnė už prekės gavimą ar vėlesnė už šiandieną.");
    if (facts.defectDiscoveredAt !== (a.defectDetectedAt ?? null)) throw new Error("Trūkumo data nesutampa su patikra. Pakartokite patikrą.");
    if (request === "TERMINATION_REFUND" && !facts.confirmedNotMinor) throw new Error("Peržiūrėkite trūkumo reikšmingumą prieš prašydami nutraukti sutartį.");
    if (request === "TERMINATION_REFUND" && facts.priceCents == null) throw new Error("Grąžinimo sumai reikia patvirtintos prekės kainos.");
    if (request === "PRICE_REDUCTION" && (facts.priceCents == null || !facts.reductionCents || facts.reductionCents > facts.priceCents || facts.reductionExplanation.length < 10)) throw new Error("Nurodykite pagrįstą sumažinimo sumą ir paaiškinimą.");
  }
  if (family === "DISTANCE_WITHDRAWAL" && !facts.receivedDate) throw new Error("Nurodykite prekės gavimo datą.");
  if (request === "EXCHANGE" && !facts.physicalReason) throw new Error("Nurodykite, dėl kurios savybės norite pakeisti prekę.");
  const reviewed = request === "PRICE_REDUCTION" ? { ...facts, confirmedNotMinor: false } : facts;
  assertDocumentBudget("Peržiūrėti faktai", reviewed, 16000);
  return reviewed;
}

export type EvidenceSnapshot = Pick<PurchaseDocument, "id" | "original_filename" | "document_type">;
export function selectEvidence(ids: string[], documents: PurchaseDocument[]): EvidenceSnapshot[] {
  return ids.map((id) => {
    const document = documents.find((item) => item.id === id && item.upload_state === "READY");
    if (!document) throw new Error("Pasirinktas priedas nepasiekiamas. Peržiūrėkite priedus iš naujo.");
    return { id, original_filename: document.original_filename, document_type: document.document_type };
  });
}

export function renderLetter(family: Family, request: Request, facts: Facts, evidence: EvidenceSnapshot[], decision?: { code: string; secondaryRemedyGrounds?: string[] }) {
  const money = (cents: number) => `${(cents / 100).toFixed(2)} EUR`;
  const quoted = (value: string) => value.replace(/\r\n?/g, "\n").split("\n").map((line) => `  ${line}`).join("\n");
  const title = family === "DISTANCE_WITHDRAWAL" ? "PRANEŠIMAS APIE NUOTOLINĖS SUTARTIES ATSISAKYMĄ" : family === "DEFECTIVE_PRODUCT" ? "PRETENZIJA DĖL NEKOKYBIŠKOS PREKĖS" : "PRAŠYMAS DĖL PREKĖS KEITIMO AR GRĄŽINIMO";
  const sections = [
    `${facts.documentDate}\nPardavėjui: ${facts.sellerName}${facts.sellerContact ? `\nKontaktas: ${facts.sellerContact}` : ""}\nVartotojas: ${facts.consumerName}\nEl. paštas: ${facts.consumerEmail}`,
    title,
    `Prekė: ${facts.productName}\nPirkimo data: ${facts.purchaseDate}\nPirkimo būdas: ${facts.purchaseChannel === "DISTANCE" ? "nuotoliniu būdu" : "fizinėje parduotuvėje"}${facts.receivedDate ? `\nPrekės gavimo data: ${facts.receivedDate}` : ""}${facts.referenceNumber ? `\nUžsakymo / čekio numeris: ${facts.referenceNumber}` : ""}${facts.priceCents == null ? "" : `\nPatvirtinta prekės kaina: ${money(facts.priceCents)}`}`
  ];
  if (family === "DEFECTIVE_PRODUCT") {
    sections.push(`Mano aprašytas prekės trūkumas:\n${quoted(facts.defectDescription)}${facts.defectDiscoveredAt ? `\nTrūkumą pastebėjau: ${facts.defectDiscoveredAt}` : ""}`);
    if (request === "PRICE_REDUCTION" || request === "TERMINATION_REFUND") {
      const grounds: Record<string, string> = {
        SELLER_DID_NOT_REPAIR_OR_REPLACE: "pardavėjas prekės nepataisė arba nepakeitė",
        SELLER_REFUSED_CONFORMITY_REMEDY: "pardavėjas atsisakė taisyti arba pakeisti prekę",
        DEFECT_PERSISTS_AFTER_ATTEMPT: "trūkumas išliko arba atsirado pakartotinai po bandymo pašalinti neatitiktį",
        POTENTIALLY_SERIOUS_DEFECT: "nurodytas galimai esminis prekės trūkumas",
        SELLER_WILL_NOT_ACT_WITHIN_REASONABLE_TIME: "pardavėjas nurodė, kad per protingą laiką prekės netaisys arba nekeis",
        SIGNIFICANT_INCONVENIENCE: "taisymas arba keitimas sukeltų didelių nepatogumų"
      };
      const reviewedGrounds = decision?.secondaryRemedyGrounds?.map((ground) => grounds[ground]).filter(Boolean) ?? [];
      if (reviewedGrounds.length) sections.push(`Pagal mano pateiktus patikros duomenis: ${reviewedGrounds.join("; ")}.`);
    }
    const clause: Record<string, string> = {
      REPAIR: "Prašau neatlygintinai pataisyti prekę.", REPLACEMENT: "Prašau pakeisti prekę tinkamos kokybės preke.",
      PRICE_REDUCTION: `Prašau sumažinti prekės kainą ${money(facts.reductionCents!)}. Mano pagrindimas:\n${quoted(facts.reductionExplanation)}`,
      TERMINATION_REFUND: `Prašau nutraukti pirkimo–pardavimo sutartį ir grąžinti už šią prekę sumokėtą ${money(facts.priceCents!)} sumą.`
    };
    sections.push(clause[request]);
    sections.push("Prašau raštu informuoti apie sprendimą. Jei su reikalavimu nesutinkate, prašau pateikti motyvuotą rašytinį atsakymą pagal Vartotojų teisių apsaugos įstatymo 21 straipsnį.");
  } else if (family === "DISTANCE_WITHDRAWAL") {
    sections.push("Pranešu, kad atsisakau nuotoliniu būdu sudarytos šios prekės pirkimo–pardavimo sutarties. Prašau patvirtinti, kaip grąžinti prekę, ir grąžinti pagal teisės aktus grąžintinas sumas.");
  } else if (request === "CONSENT_RETURN") {
    sections.push("Prašau apsvarstyti galimybę priimti šią tinkamos kokybės prekę atgal pardavėjo sutikimu ir informuoti apie taikomas sąlygas.");
  } else {
    const reasons = { SIZE: "dydis", SHAPE: "forma", COLOR: "spalva", MODEL: "modelis", COMPLETENESS: "komplektiškumas" };
    sections.push(`Prekė manęs netenkina dėl šios savybės: ${reasons[facts.physicalReason!]}. Prašau pakeisti ją analogiška kitokios atitinkamos savybės preke. Prašau informuoti, kokia keitimo tvarka taikoma.`);
  }
  if (evidence.length) sections.push(`Priedai (pridėti atskirai):\n${evidence.map((item, index) => `${index + 1}. ${item.original_filename.replace(/[\r\n\u2028\u2029\u0000-\u001f\u007f]/gu, " ")}`).join("\n")}`);
  else if (facts.alternativeProof) sections.push(`Mano nurodytas kitas pirkimo įrodymas:\n${quoted(facts.alternativeProof)}`);
  sections.push(`Pagarbiai\n${facts.consumerName}`);
  return { sections, text: sections.join("\n\n") + "\n", title };
}
