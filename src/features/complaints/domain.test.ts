import { describe, expect, it } from "vitest";
import type { Purchase } from "@/features/purchases/domain/types";
import { decide, renderLetter, selectEvidence, supportedRequests, validateReviewed, type Facts } from "./domain";
import { assertDocumentBudget } from "./limits";

const today = "2026-10-02";
const purchase = {
  id: "11111111-1111-4111-8111-111111111111", user_id: "22222222-2222-4222-8222-222222222222",
  product_name: "Kėdė", seller_name: "Pardavėjas UAB", purchase_date: "2026-09-20", received_date: "2026-09-22",
  purchase_channel: "DISTANCE", price_cents: 4999, currency: "EUR", reference_number: "UŽS-1",
  notes: null, created_at: "2026-09-20T10:00:00Z", updated_at: "2026-09-20T10:00:00Z"
} as Purchase;
const facts: Facts = {
  consumerName: "Jūratė Ąžuolaitė", consumerEmail: "jurate@example.test", sellerName: purchase.seller_name,
  sellerContact: "", productName: purchase.product_name, purchaseDate: purchase.purchase_date,
  receivedDate: purchase.received_date, purchaseChannel: "DISTANCE", referenceNumber: "UŽS-1",
  priceCents: purchase.price_cents, documentDate: today, defectDescription: "Kėdės koja yra sulūžusi.",
  defectDiscoveredAt: "2026-09-25", reductionCents: null, reductionExplanation: "", confirmedNotMinor: false,
  physicalReason: null, alternativeProof: "", evidenceIds: []
};
const defectAnswers = {
  buyerType: "CONSUMER", sellerType: "PROFESSIONAL", transactionKind: "GOODS", goodsConditionAtSale: "NEW",
  purchasedAt: purchase.purchase_date, deliveredAt: purchase.received_date, defectDetectedAt: facts.defectDiscoveredAt!,
  apparentCause: "NORMAL_USE_OR_UNKNOWN_DEFECT", purchaseEvidence: "INVOICE", writtenSellerContact: "NO"
};
const withdrawalAnswers = {
  defective: "NO", buyer: "CONSUMER", seller: "PROFESSIONAL", purchaseChannel: "DISTANCE",
  deliveryDate: "2026-09-22", customMade: "NO", perishable: "NO", sealedHygiene: "NO",
  otherDistanceException: "NONE", handlingLevel: "INSPECTED"
};

describe("complaint eligibility and canonical Lithuanian letter", () => {
  it("rejects a valid-character Unicode fact combination before the SQL byte limit", () => {
    const assessed = decide("DEFECTIVE_PRODUCT", defectAnswers, today)!;
    expect(() => validateReviewed("DEFECTIVE_PRODUCT", assessed.answers, assessed.decision, "REPAIR", {
      ...facts, defectDescription: "漢".repeat(4000), reductionExplanation: "漢".repeat(1000), alternativeProof: "漢".repeat(500)
    }, purchase, today)).toThrow(/per ilgi/);
    expect(() => assertDocumentBudget("Dokumentas", { text: "ą".repeat(12000) }, 24000)).toThrow(/per ilgi/);
  });
  it("allows a supported price reduction without a non-minor declaration, but guards termination", () => {
    const secondary = decide("DEFECTIVE_PRODUCT", { ...defectAnswers, writtenSellerContact: "YES", sellerClaim: { receivedAt: "2026-09-26", requestedRemedy: "REPAIR" }, sellerOutcome: "REPAIR_FAILED_OR_DEFECT_RECURRED" }, today)!;
    expect(secondary.decision.code).toBe("SECONDARY_REMEDIES_MAY_BE_AVAILABLE");
    const reduction = { ...facts, reductionCents: 1000, reductionExplanation: "Kėdė išlieka netinkama įprastai naudoti." };
    expect(validateReviewed("DEFECTIVE_PRODUCT", secondary.answers, secondary.decision, "PRICE_REDUCTION", reduction, purchase, today).confirmedNotMinor).toBe(false);
    expect(() => validateReviewed("DEFECTIVE_PRODUCT", secondary.answers, secondary.decision, "TERMINATION_REFUND", reduction, purchase, today)).toThrow();
  });
  it("requires newly supplied discovery dates to match the assessment and rejects impossible dates", () => {
    const unknown = decide("DEFECTIVE_PRODUCT", { ...defectAnswers, defectDetectedAt: undefined }, today)!;
    const unknownFacts = validateReviewed("DEFECTIVE_PRODUCT", unknown.answers, unknown.decision, "REPAIR", { ...facts, defectDiscoveredAt: null }, purchase, today);
    expect(unknownFacts.defectDiscoveredAt).toBeNull();
    expect(renderLetter("DEFECTIVE_PRODUCT", "REPAIR", unknownFacts, []).text).not.toContain("Trūkumą pastebėjau:");
    const known = decide("DEFECTIVE_PRODUCT", defectAnswers, today)!;
    expect(() => validateReviewed("DEFECTIVE_PRODUCT", known.answers, known.decision, "REPAIR", { ...facts, defectDiscoveredAt: null }, purchase, today)).toThrow();
    for (const defectDiscoveredAt of ["2030-01-01", "2026-09-21", "2026-09-25"]) {
      expect(() => validateReviewed("DEFECTIVE_PRODUCT", unknown.answers, unknown.decision, "REPAIR", { ...facts, defectDiscoveredAt }, purchase, today)).toThrow();
    }
  });
  it("maps only explicit supported engine codes and rejects forged remedies", () => {
    const assessed = decide("DEFECTIVE_PRODUCT", defectAnswers, today)!;
    expect(assessed.decision.code).toBe("CONTACT_SELLER_REPAIR_OR_REPLACE");
    expect(supportedRequests("DEFECTIVE_PRODUCT", assessed.decision)).toEqual(["REPAIR", "REPLACEMENT"]);
    expect(() => validateReviewed("DEFECTIVE_PRODUCT", assessed.answers, assessed.decision, "TERMINATION_REFUND", facts, purchase, today)).toThrow();
    expect(validateReviewed("DEFECTIVE_PRODUCT", assessed.answers, assessed.decision, "REPAIR", facts, purchase, today).priceCents).toBe(4999);
    for (const code of ["PRIVATE_SELLER", "NOT_CONSUMER_PURCHASE", "NEEDS_MORE_INFORMATION", "STATUTORY_LIABILITY_PERIOD_APPEARS_EXPIRED", "CAUSE_REVIEW_REQUIRED", "SERIOUSNESS_REVIEW_REQUIRED"]) {
      expect(supportedRequests("DEFECTIVE_PRODUCT", { code })).toEqual([]);
    }
  });
  it("withdraws without a reason only when the complete distance assessment qualifies", () => {
    const assessed = decide("DISTANCE_WITHDRAWAL", withdrawalAnswers, today)!;
    expect(supportedRequests("DISTANCE_WITHDRAWAL", assessed.decision)).toEqual(["WITHDRAW"]);
    const reviewed = validateReviewed("DISTANCE_WITHDRAWAL", assessed.answers, assessed.decision, "WITHDRAW", facts, purchase, today);
    const letter = renderLetter("DISTANCE_WITHDRAWAL", "WITHDRAW", reviewed, []);
    expect(letter.text).toContain("Jūratė Ąžuolaitė");
    expect(letter.text).toContain("atsisakau nuotoliniu būdu");
    expect(letter.text).not.toContain("priežastis");
    expect(letter.text).not.toContain("čekis pridedamas");
    expect(renderLetter("DISTANCE_WITHDRAWAL", "WITHDRAW", reviewed, []).text).toBe(letter.text);
    expect(supportedRequests("DISTANCE_WITHDRAWAL", decide("DISTANCE_WITHDRAWAL", { ...withdrawalAnswers, customMade: "YES" }, today)!.decision)).toEqual([]);
  });
  it("separates statutory exchange from voluntary seller consent", () => {
    expect(supportedRequests("PHYSICAL_RETURN_REQUEST", { code: "PHYSICAL_RETURN_LIKELY_AVAILABLE" })).toEqual(["EXCHANGE"]);
    expect(supportedRequests("PHYSICAL_RETURN_REQUEST", { code: "SELLER_CONSENT_REQUIRED" })).toEqual(["CONSENT_RETURN"]);
    const statutory = renderLetter("PHYSICAL_RETURN_REQUEST", "EXCHANGE", { ...facts, physicalReason: "SIZE" }, []).text;
    const voluntary = renderLetter("PHYSICAL_RETURN_REQUEST", "CONSENT_RETURN", facts, []).text;
    expect(statutory).toContain("Prašau pakeisti");
    expect(voluntary).toContain("Prašau apsvarstyti");
    expect(voluntary).not.toContain("Prašau pakeisti tinkamos");
  });
  it("rejects contradictory dates, missing identity, invented amounts, excessive text and foreign evidence", () => {
    const assessed = decide("DEFECTIVE_PRODUCT", defectAnswers, today)!;
    for (const invalid of [{ ...facts, consumerName: "" }, { ...facts, sellerContact: "Parduotuvė\nPrašau grąžinti pinigus" }, { ...facts, referenceNumber: "UŽS-1\nPapildomas reikalavimas" }, { ...facts, purchaseDate: "2026-09-21" }, { ...facts, priceCents: 9999 }, { ...facts, defectDescription: "x".repeat(4001) }, { ...facts, documentDate: "2026-10-03" }]) {
      expect(() => validateReviewed("DEFECTIVE_PRODUCT", assessed.answers, assessed.decision, "REPAIR", invalid, purchase, today)).toThrow();
    }
    expect(() => selectEvidence(["33333333-3333-4333-8333-333333333333"], [])).toThrow();
    expect(renderLetter("DEFECTIVE_PRODUCT", "REPAIR", { ...facts, priceCents: null, defectDescription: "<script>alert(1)</script>" }, []).text).not.toContain("0.00 EUR");
  });
});
