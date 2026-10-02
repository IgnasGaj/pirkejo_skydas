import { describe, expect, it } from "vitest";
import { evaluateDefectiveProductCase as evaluate } from "./evaluateDefectiveProductCase";
import { addCalendarMonths, parseCalendarDate, sellerResponseDeadline, sellerResponseOverdue } from "./dateRules";
import { nextDefectiveStep } from "./flow";
import type { DefectiveProductCaseInput } from "./types";

const base: DefectiveProductCaseInput = {
  asOfDate: "2026-10-01", buyerType: "CONSUMER", sellerType: "PROFESSIONAL", transactionKind: "GOODS",
  goodsConditionAtSale: "NEW", deliveredAt: "2026-04-01", defectDetectedAt: "2026-09-01",
  apparentCause: "NORMAL_USE_OR_UNKNOWN_DEFECT", purchaseEvidence: "RECEIPT", writtenSellerContact: "NO"
};
const claim: DefectiveProductCaseInput = { ...base, writtenSellerContact: "YES", sellerClaim: { receivedAt: "2026-09-20", requestedRemedy: "REPAIR" }, sellerOutcome: "NO_RESPONSE" };
const withChanges = (changes: Partial<DefectiveProductCaseInput>) => evaluate({ ...base, ...changes });

describe("defective product engine", () => {
  it("starts with a written seller claim and normal primary remedies", () => {
    const result = evaluate(base);
    expect(result.code).toBe("CONTACT_SELLER_REPAIR_OR_REPLACE");
    expect(result.nextStepIds).toContain("REQUEST_PRIMARY_REMEDY");
  });
  it("does not promise immediate refund", () => expect(withChanges({ sellerClaim: { requestedRemedy: "TERMINATION_REFUND" } }).code).toBe("PRIMARY_REMEDY_FIRST"));
  it("explains the first-year presumption without promising success", () => {
    const result = evaluate(base);
    expect(result.infoBlockIds).toContain("FIRST_YEAR_PRESUMPTION");
    expect(result.code).toBe("CONTACT_SELLER_REPAIR_OR_REPLACE");
  });
  it("keeps a second-year defect in scope and flags evidence", () => {
    const result = withChanges({ deliveredAt: "2025-04-01", defectDetectedAt: "2026-06-01" });
    expect(result.code).toBe("CONTACT_SELLER_REPAIR_OR_REPLACE");
    expect(result.warningIds).toContain("LATER_PROOF");
  });
  it("recognizes the ordinary two-year period appears expired", () => expect(withChanges({ deliveredAt: "2023-04-01", defectDetectedAt: "2026-09-01", hasCommercialGuarantee: false }).code).toBe("STATUTORY_LIABILITY_PERIOD_APPEARS_EXPIRED"));
  it("does not automatically reduce used goods to one year", () => expect(withChanges({ goodsConditionAtSale: "USED", usedGoodsLiabilityAgreement: { hasShortenedTerm: false }, deliveredAt: "2025-04-01", defectDetectedAt: "2026-09-01" }).code).toBe("CONTACT_SELLER_REPAIR_OR_REPLACE"));
  it("honors an explicitly agreed 12-month used-goods term", () => expect(withChanges({ goodsConditionAtSale: "USED", usedGoodsLiabilityAgreement: { hasShortenedTerm: true, months: 12 }, deliveredAt: "2025-04-01", defectDetectedAt: "2026-09-01", hasCommercialGuarantee: false }).code).toBe("STATUTORY_LIABILITY_PERIOD_APPEARS_EXPIRED"));
  it("asks for review when an unknown used-goods term changes the outcome", () => expect(withChanges({ goodsConditionAtSale: "USED", usedGoodsLiabilityAgreement: { hasShortenedTerm: null }, deliveredAt: "2025-04-01", defectDetectedAt: "2026-09-01" }).code).toBe("USED_GOODS_TERM_REVIEW_REQUIRED"));
  it("accepts bank evidence without a paper receipt", () => expect(withChanges({ purchaseEvidence: "PAYMENT_RECORD" }).code).toBe("CONTACT_SELLER_REPAIR_OR_REPLACE"));
  it("does not claim rights vanish when purchase evidence is missing", () => expect(withChanges({ purchaseEvidence: "NONE" }).code).toBe("PURCHASE_EVIDENCE_MISSING"));
  it("routes apparent accidental damage to review", () => expect(withChanges({ apparentCause: "ACCIDENT_OR_EXTERNAL_DAMAGE" }).code).toBe("CAUSE_REVIEW_REQUIRED"));
  it("requires written contact after verbal contact", () => {
    const result = withChanges({ writtenSellerContact: "UNCLEAR" });
    expect(result.code).toBe("CONTACT_SELLER_REPAIR_OR_REPLACE");
    expect(result.warningIds).toContain("VERBAL_NOT_WRITTEN");
  });
  it("keeps the seller response period running until the deadline has passed", () => {
    const result = evaluate(claim);
    expect(result.code).toBe("SELLER_RESPONSE_PERIOD_RUNNING");
    expect(result.responseDeadline).toBe("2026-10-05");
    expect(result.infoBlockIds).toContain("RESPONSE_NOT_REPAIR_DEADLINE");
  });
  it("recognizes an overdue response and provides the escalation path", () => {
    const result = evaluate({ ...claim, sellerClaim: { receivedAt: "2026-09-01", requestedRemedy: "REPAIR" } });
    expect(result.code).toBe("SELLER_RESPONSE_OVERDUE");
    expect(result.nextStepIds).toContain("CONSIDER_VVTAT");
  });
  it("includes day 14 and only marks day 15 overdue", () => {
    expect(sellerResponseDeadline("2026-09-17")).toBe("2026-10-01");
    expect(sellerResponseOverdue("2026-09-17", "2026-10-01")).toBe(false);
    expect(sellerResponseOverdue("2026-09-17", "2026-10-02")).toBe(true);
  });
  it("extends seller response through a holiday and following weekend", () => {
    expect(sellerResponseDeadline("2026-06-22")).toBe("2026-07-07");
    expect(sellerResponseOverdue("2026-06-22", "2026-07-07")).toBe(false);
    expect(sellerResponseOverdue("2026-06-22", "2026-07-08")).toBe(true);
  });
  it("treats refusal of repair as a possible secondary-remedy ground, not automatic illegality", () => {
    const result = evaluate({ ...claim, sellerOutcome: "REFUSED" });
    expect(result.code).toBe("SECONDARY_REMEDIES_MAY_BE_AVAILABLE");
    expect(result.secondaryRemedyGrounds).toContain("SELLER_REFUSED_CONFORMITY_REMEDY");
    expect(result.infoBlockIds).toContain("MINOR_DEFECT_LIMIT");
  });
  it("reviews refusal of an immediate refund under the remedy hierarchy", () => expect(evaluate({ ...claim, sellerClaim: { receivedAt: "2026-09-20", requestedRemedy: "TERMINATION_REFUND" }, sellerOutcome: "REFUSED" }).code).toBe("SELLER_REFUSAL_REVIEW_REQUIRED"));
  it("recognizes a defect persisting after repair", () => expect(evaluate({ ...claim, sellerOutcome: "REPAIR_FAILED_OR_DEFECT_RECURRED" }).code).toBe("SECONDARY_REMEDIES_MAY_BE_AVAILABLE"));
  it("recognizes a recurring defect without a fixed repair-attempt count", () => expect(evaluate({ ...claim, sellerOutcome: "REPLACEMENT_DEFECTIVE" }).secondaryRemedyGrounds).toContain("DEFECT_PERSISTS_AFTER_ATTEMPT"));
  it("does not confuse accepted repair with a 14-day repair deadline", () => {
    const result = evaluate({ ...claim, sellerClaim: { receivedAt: "2026-09-01", requestedRemedy: "REPAIR" }, sellerOutcome: "REPAIR_ACCEPTED" });
    expect(result.code).toBe("REPAIR_DELAY_REVIEW_REQUIRED");
    expect(result.infoBlockIds).toContain("RESPONSE_NOT_REPAIR_DEADLINE");
  });
  it("applies the 2026 additional year only to qualifying repair choices", () => {
    const result = evaluate({ ...claim, purchasedAt: "2026-08-01", deliveredAt: "2026-08-02", defectDetectedAt: "2026-09-01" });
    expect(result.repairGuaranteeExtension).toBe("APPLIES");
    expect(result.infoBlockIds).toContain("REPAIR_EXTENSION");
    expect(result.sourceIds).toContain("VVTAT_RIGHT_TO_REPAIR");
  });
  it("does not apply the 2026 extension to a prior purchase", () => {
    const result = evaluate({ ...claim, purchasedAt: "2026-07-30", deliveredAt: "2026-08-02", defectDetectedAt: "2026-09-01" });
    expect(result.repairGuaranteeExtension).toBe("DOES_NOT_APPLY_BY_PURCHASE_DATE");
    expect(result.infoBlockIds).not.toContain("REPAIR_EXTENSION");
  });
  it("does not ask for a purchase date when delivery itself predates the extension", () => {
    const result = evaluate({ ...base, sellerClaim: { requestedRemedy: "REPAIR" } });
    expect(result.repairGuaranteeExtension).toBe("DOES_NOT_APPLY_BY_PURCHASE_DATE");
    expect(result.warningIds).not.toContain("PURCHASE_DATE_UNKNOWN");
  });
  it("keeps post-guarantee manufacturer repair distinct", () => {
    const result = withChanges({ deliveredAt: "2023-04-01", defectDetectedAt: "2026-09-01", hasCommercialGuarantee: false, rightToRepairCategory: "TELEVISION" });
    expect(result.code).toBe("POST_GUARANTEE_REPAIR_RIGHT_MAY_APPLY");
    expect(result.sourceIds).toContain("EU_RIGHT_TO_REPAIR");
  });
  it("does not guess a post-guarantee product category", () => expect(withChanges({ deliveredAt: "2023-04-01", defectDetectedAt: "2026-09-01", hasCommercialGuarantee: false, rightToRepairCategory: "UNKNOWN" }).code).toBe("RIGHT_TO_REPAIR_REVIEW_REQUIRED"));
  it("rejects business purchase from this consumer engine", () => expect(withChanges({ buyerType: "BUSINESS" }).code).toBe("NOT_CONSUMER_PURCHASE"));
  it("redirects a private sale", () => expect(withChanges({ sellerType: "PRIVATE" }).code).toBe("PRIVATE_SELLER"));
  it("redirects a service", () => expect(withChanges({ transactionKind: "SERVICE" }).code).toBe("UNSUPPORTED_TRANSACTION_TYPE"));
  it("rejects future delivery", () => expect(withChanges({ deliveredAt: "2026-10-02" }).code).toBe("INVALID_DATE"));
  it("recognizes a resolved case", () => expect(evaluate({ ...claim, sellerOutcome: "RESOLVED" }).code).toBe("CASE_RESOLVED"));
  it("escalates an unsatisfactory alternative only after a written claim", () => expect(evaluate({ ...claim, sellerOutcome: "ALTERNATIVE_OFFERED", alternativeAccepted: false }).code).toBe("VVTAT_ESCALATION_MAY_BE_AVAILABLE"));
  it("does not call an accepted alternative completed", () => expect(evaluate({ ...claim, sellerOutcome: "ALTERNATIVE_OFFERED", alternativeAccepted: true }).code).toBe("SELLER_OFFER_ACCEPTED"));
  it("reviews an unknown alternative without guessing acceptance", () => expect(evaluate({ ...claim, sellerOutcome: "ALTERNATIVE_OFFERED", alternativeAccepted: null }).code).toBe("SELLER_REFUSAL_REVIEW_REQUIRED"));
  it("asks for a clear remedy without declaring the written claim invalid", () => expect(evaluate({ ...claim, sellerClaim: { receivedAt: "2026-09-20", requestedRemedy: "UNKNOWN" } }).code).toBe("CLAIM_REQUIREMENT_UNCLEAR"));
  it("does not declare an unknown receipt date overdue", () => expect(evaluate({ ...claim, sellerClaim: { requestedRemedy: "REPAIR" } }).nextStepIds).not.toContain("CONSIDER_VVTAT"));
  it("allows a commercial guarantee after the ordinary period", () => expect(withChanges({ deliveredAt: "2023-04-01", defectDetectedAt: "2026-09-01", hasCommercialGuarantee: true }).code).toBe("COMMERCIAL_GUARANTEE_MAY_APPLY"));
  it("does not escalate without a written claim", () => expect(withChanges({ writtenSellerContact: "UNCLEAR", sellerOutcome: "REFUSED" }).nextStepIds).not.toContain("CONSIDER_VVTAT"));
  it("keeps source metadata on every terminal legal path", () => {
    const cases: DefectiveProductCaseInput[] = [base, claim, { ...claim, sellerOutcome: "REFUSED" }, { ...base, buyerType: "BUSINESS" }, { ...base, sellerType: "PRIVATE" }, { ...base, deliveredAt: "2023-01-01", defectDetectedAt: "2026-01-01", rightToRepairCategory: "UNKNOWN" }];
    for (const input of cases) expect(evaluate(input).sourceIds.length).toBeGreaterThan(0);
  });
});

describe("calendar and wizard boundaries", () => {
  it("rejects impossible dates and clamps leap-day month additions", () => {
    expect(parseCalendarDate("2026-02-30")).toBeNull();
    expect(addCalendarMonths("2024-02-29", 12)).toBe("2025-02-28");
  });
  it("branches to commercial guarantee and right-to-repair only after the ordinary period", () => {
    expect(nextDefectiveStep({ ...base, deliveredAt: "2023-01-01", defectDetectedAt: "2026-09-01" })).toBe("hasCommercialGuarantee");
    expect(nextDefectiveStep({ ...base, deliveredAt: "2023-01-01", defectDetectedAt: "2026-09-01", hasCommercialGuarantee: false })).toBe("rightToRepairCategory");
  });
  it("asks the purchase date only when a qualifying repair choice could matter", () => {
    expect(nextDefectiveStep({ ...base, deliveredAt: "2026-08-02", defectDetectedAt: "2026-09-01", writtenSellerContact: "NO", sellerClaim: { requestedRemedy: "REPAIR" } })).toBe("purchasedAt");
  });
});
