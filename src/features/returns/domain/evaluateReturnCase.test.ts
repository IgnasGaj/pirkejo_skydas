import { describe, expect, it } from "vitest";
import { evaluateReturnCase } from "./evaluateReturnCase";
import { evaluateFourteenDayPeriod } from "./dateRules";
import { legalSources } from "@/legal/sources";
import { classifyPhysicalProduct, getProductClarification } from "./categories";
import type { ReturnCaseInput } from "./types";

const physical: ReturnCaseInput = {
  asOfDate: "2026-09-30", defective: "NO", buyer: "CONSUMER", seller: "PROFESSIONAL",
  purchaseChannel: "PHYSICAL_STORE", purchaseDate: "2026-09-25", productCategory: "CLOTHING_SHOES", productSubtype: "ADULT_CLOTHING_OR_SHOES",
  used: "NO", appearanceIntact: "YES", purchaseEvidence: "RECEIPT"
};

const distance: ReturnCaseInput = {
  asOfDate: "2026-09-30", defective: "NO", buyer: "CONSUMER", seller: "PROFESSIONAL",
  purchaseChannel: "DISTANCE", deliveryDate: "2026-09-25", customMade: "NO", perishable: "NO",
  sealedHygiene: "NO", otherDistanceException: "NONE", handlingLevel: "UNOPENED"
};

describe("date rules", () => {
  it("includes the fourteenth day and expires on the fifteenth", () => {
    expect(evaluateFourteenDayPeriod("2026-09-16", "2026-09-30")).toBe("WITHIN_14_DAYS");
    expect(evaluateFourteenDayPeriod("2026-09-15", "2026-09-30")).toBe("EXPIRED");
  });
  it("handles calendar boundaries and rejects impossible or future dates", () => {
    expect(evaluateFourteenDayPeriod("2026-02-28", "2026-03-14")).toBe("WITHIN_14_DAYS");
    expect(evaluateFourteenDayPeriod("2026-02-30", "2026-03-14")).toBe("INVALID_DATE");
    expect(evaluateFourteenDayPeriod("2026-10-01", "2026-09-30")).toBe("INVALID_DATE");
  });
  it.each([
    ["Saturday", "2026-09-19", "2026-10-05", "2026-10-06"],
    ["Sunday", "2026-09-20", "2026-10-05", "2026-10-06"],
    ["Lithuanian holiday", "2026-06-22", "2026-07-07", "2026-07-08"],
    ["holiday followed by weekend", "2026-12-11", "2026-12-28", "2026-12-29"],
    ["All Souls after Sunday", "2026-10-19", "2026-11-03", "2026-11-04"],
    ["Easter Monday", "2026-03-23", "2026-04-07", "2026-04-08"]
  ])("extends %s final day through the next working day", (_label, event, lastDay, followingDay) => {
    expect(evaluateFourteenDayPeriod(event, lastDay)).toBe("WITHIN_14_DAYS");
    expect(evaluateFourteenDayPeriod(event, followingDay)).toBe("EXPIRED");
  });
});

describe("return decision engine", () => {
  it("keeps distance withdrawal available on the adjusted final day", () => {
    expect(evaluateReturnCase({ ...distance, deliveryDate: "2026-09-19", asOfDate: "2026-10-05" }).code).toBe("DISTANCE_WITHDRAWAL_LIKELY_AVAILABLE");
    expect(evaluateReturnCase({ ...distance, deliveryDate: "2026-09-19", asOfDate: "2026-10-06" }).code).toBe("SPECIAL_REVIEW_REQUIRED");
  });
  it("uses the Lithuanian next-working-day rule for physical returns", () => {
    expect(evaluateReturnCase({ ...physical, purchaseDate: "2026-06-22", asOfDate: "2026-07-07" }).code).toBe("PHYSICAL_RETURN_LIKELY_AVAILABLE");
    expect(evaluateReturnCase({ ...physical, purchaseDate: "2026-06-22", asOfDate: "2026-07-08" }).code).toBe("PHYSICAL_RETURN_PERIOD_EXPIRED");
  });
  it("finds likely eligibility for a standard physical-store item on day 5", () => {
    expect(evaluateReturnCase(physical).code).toBe("PHYSICAL_RETURN_LIKELY_AVAILABLE");
  });
  it("requires clarification before classifying broad electronics", () => {
    const result = evaluateReturnCase({ ...physical, productCategory: "ELECTRONICS", productSubtype: undefined });
    expect(result.code).toBe("CATEGORY_REVIEW_REQUIRED");
    expect(result.classification?.legalClassification).toBe("REQUIRES_REVIEW");
  });
  it("requires seller consent for a verified mobile phone subtype", () => {
    const result = evaluateReturnCase({ ...physical, productCategory: "ELECTRONICS", productSubtype: "MOBILE_PHONE" });
    expect(result.code).toBe("SELLER_CONSENT_REQUIRED");
    expect(result.classification?.sourceIds).toContain("VVTAT_MOBILE_PHONE");
    expect(result.rulesTriggered).toContain("CATEGORY_CLARIFICATION_MOBILE_PHONE");
  });
  it("recognizes an expired physical-store period", () => {
    expect(evaluateReturnCase({ ...physical, purchaseDate: "2026-09-10" }).code).toBe("PHYSICAL_RETURN_PERIOD_EXPIRED");
  });
  it("flags physical-store use or damage", () => {
    expect(evaluateReturnCase({ ...physical, used: "YES" }).code).toBe("PHYSICAL_CONDITION_NOT_MET");
    expect(evaluateReturnCase({ ...physical, appearanceIntact: "NO" }).code).toBe("PHYSICAL_CONDITION_NOT_MET");
  });
  it("accepts an invoice without a paper receipt", () => {
    expect(evaluateReturnCase({ ...physical, purchaseEvidence: "INVOICE" }).code).toBe("PHYSICAL_RETURN_LIKELY_AVAILABLE");
  });
  it("asks for evidence without claiming rights are lost", () => {
    const result = evaluateReturnCase({ ...physical, purchaseEvidence: "NONE" });
    expect(result.code).toBe("PURCHASE_EVIDENCE_MISSING");
    expect(result.summary).toContain("Čekis nėra vienintelis");
  });
  it("finds likely withdrawal for an ordinary distance item received 5 days ago", () => {
    expect(evaluateReturnCase(distance).code).toBe("DISTANCE_WITHDRAWAL_LIKELY_AVAILABLE");
  });
  it("applies a sealed hygiene exception only after opening the seal", () => {
    expect(evaluateReturnCase({ ...distance, sealedHygiene: "YES", sealOpened: "YES" }).code).toBe("DISTANCE_EXCEPTION_APPLIES");
    expect(evaluateReturnCase({ ...distance, sealedHygiene: "YES", sealOpened: "NO" }).code).toBe("DISTANCE_WITHDRAWAL_LIKELY_AVAILABLE");
  });
  it("applies the custom-made exception", () => {
    expect(evaluateReturnCase({ ...distance, customMade: "YES" }).code).toBe("DISTANCE_EXCEPTION_APPLIES");
  });
  it("does not reject a distance item opened only for inspection", () => {
    expect(evaluateReturnCase({ ...distance, handlingLevel: "INSPECTED" }).code).toBe("DISTANCE_WITHDRAWAL_LIKELY_AVAILABLE");
  });
  it("warns of possible diminished value without rejecting withdrawal", () => {
    const result = evaluateReturnCase({ ...distance, handlingLevel: "USED_BEYOND_INSPECTION" });
    expect(result.code).toBe("DISTANCE_WITHDRAWAL_LIKELY_AVAILABLE");
    expect(result.warnings.join(" ")).toContain("POSSIBLE_DIMINISHED_VALUE");
  });
  it("redirects defective products", () => {
    expect(evaluateReturnCase({ ...physical, defective: "YES" }).code).toBe("DEFECT_FLOW_REQUIRED");
  });
  it("redirects business purchases", () => {
    expect(evaluateReturnCase({ ...physical, buyer: "BUSINESS" }).code).toBe("NOT_CONSUMER_PURCHASE");
  });
  it("redirects purchases from private sellers", () => {
    expect(evaluateReturnCase({ ...physical, seller: "PRIVATE" }).code).toBe("PRIVATE_SELLER");
  });
  it("does not guess an unknown or mixed category", () => {
    for (const productCategory of ["UNKNOWN", "OTHER", "TOYS_GAMES"] as const) {
      const result = evaluateReturnCase({ ...physical, productCategory, productSubtype: undefined });
      expect(result.code).toBe("CATEGORY_REVIEW_REQUIRED");
      expect(result.summary).toContain("Tikslų prekės tipą");
    }
  });
  it("routes a verified ordinary sports ball through standard physical-store rules", () => {
    const result = evaluateReturnCase({ ...physical, productCategory: "TOYS_GAMES", productSubtype: "SPORTS_BALL" });
    expect(result.code).toBe("PHYSICAL_RETURN_LIKELY_AVAILABLE");
    expect(result.classification?.sourceIds).toEqual(["LT_RETAIL_RULES", "EU_CN_SPORTS_BALL"]);
  });
  it("provides reusable clarification data for every ambiguous named category", () => {
    for (const category of ["ELECTRONICS", "COSMETICS_HYGIENE", "MEDICAL_DEVICE", "TOYS_GAMES"] as const) {
      const clarification = getProductClarification(category);
      expect(clarification?.options.length).toBeGreaterThan(1);
      expect(classifyPhysicalProduct(category).legalClassification).toBe("REQUIRES_REVIEW");
    }
    for (const category of ["OTHER", "UNKNOWN"] as const) {
      expect(classifyPhysicalProduct(category).legalClassification).toBe("REQUIRES_REVIEW");
    }
  });
  it("requires documented tariff classification for a medical-device consent result", () => {
    const result = evaluateReturnCase({ ...physical, productCategory: "MEDICAL_DEVICE", productSubtype: "DOCUMENTED_CN_9001_9033" });
    expect(result.code).toBe("SELLER_CONSENT_REQUIRED");
    expect(result.classification?.sourceIds).toContain("LT_RETAIL_RULES");
  });
  it("does not assume broad clothing or books use the standard or exception class", () => {
    expect(evaluateReturnCase({ ...physical, productSubtype: undefined }).code).toBe("CATEGORY_REVIEW_REQUIRED");
    expect(evaluateReturnCase({ ...physical, productCategory: "BOOKS", productSubtype: undefined }).code).toBe("CATEGORY_REVIEW_REQUIRED");
    expect(evaluateReturnCase({ ...physical, productCategory: "BOOKS", productSubtype: "PRINTED_BOOK" }).code).toBe("SELLER_CONSENT_REQUIRED");
  });
  it("does not accept a subtype from another category", () => {
    const result = evaluateReturnCase({ ...physical, productCategory: "ELECTRONICS", productSubtype: "CHILDRENS_TOY" });
    expect(result.code).toBe("CATEGORY_REVIEW_REQUIRED");
  });
  it("does not classify broad cosmetics or medical products from the UI label", () => {
    for (const productCategory of ["COSMETICS_HYGIENE", "MEDICAL_DEVICE"] as const) {
      expect(evaluateReturnCase({ ...physical, productCategory, productSubtype: undefined }).code).toBe("CATEGORY_REVIEW_REQUIRED");
    }
    expect(evaluateReturnCase({ ...physical, productCategory: "COSMETICS_HYGIENE", productSubtype: "COSMETIC_PREPARATION" }).code).toBe("SELLER_CONSENT_REQUIRED");
  });
  it("keeps distance hygiene facts separate from physical-store classification", () => {
    const broad = { ...distance, productCategory: "COSMETICS_HYGIENE" as const };
    expect(evaluateReturnCase(broad).code).toBe("DISTANCE_WITHDRAWAL_LIKELY_AVAILABLE");
    expect(evaluateReturnCase({ ...broad, sealedHygiene: "YES", sealOpened: "NO" }).code).toBe("DISTANCE_WITHDRAWAL_LIKELY_AVAILABLE");
    expect(evaluateReturnCase({ ...broad, sealedHygiene: "YES", sealOpened: "YES" }).code).toBe("DISTANCE_EXCEPTION_APPLIES");
    expect(evaluateReturnCase({ ...broad, sealedHygiene: "UNKNOWN" }).code).toBe("SPECIAL_REVIEW_REQUIRED");
  });
  it("routes fact-specific distance exceptions to special review", () => {
    for (const otherDistanceException of ["OTHER_EXCEPTION", "SEALED_MEDIA_OR_SOFTWARE_OPENED", "DIGITAL_CONTENT_STARTED_WITH_CONSENT"] as const) {
      expect(evaluateReturnCase({ ...distance, otherDistanceException }).code).toBe("SPECIAL_REVIEW_REQUIRED");
    }
  });
  it("sends expired distance purchases for special review", () => {
    const result = evaluateReturnCase({ ...distance, deliveryDate: "2026-09-10" });
    expect(result.code).toBe("SPECIAL_REVIEW_REQUIRED");
    expect(result.rulesTriggered).toContain("DISTANCE_STANDARD_PERIOD_EXPIRED");
  });
  it("treats unknown exception facts as uncertainty", () => {
    expect(evaluateReturnCase({ ...distance, customMade: "UNKNOWN" }).status).toBe("NEEDS_MORE_INFORMATION");
    expect(evaluateReturnCase({ ...distance, sealedHygiene: "YES", sealOpened: "UNKNOWN" }).status).toBe("NEEDS_MORE_INFORMATION");
  });
  it("attaches official sources to every decision", () => {
    for (const input of [physical, distance, { ...physical, defective: "YES" as const }, { ...distance, customMade: "YES" as const }]) {
      const result = evaluateReturnCase(input);
      expect(result.sourceIds.length).toBeGreaterThan(0);
      for (const id of result.sourceIds) expect(legalSources[id].url).toMatch(/^https:\/\//);
    }
  });
});
