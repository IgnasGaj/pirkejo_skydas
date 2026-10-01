import type { LegalSourceId } from "@/features/returns/domain/types";
import { addCalendarMonths, parseCalendarDate, sellerResponseDeadline, sellerResponseOverdue, validSequence } from "./dateRules";
import { isListedRepairCategory } from "./rightToRepairCategories";
import { defectiveProductCaseSchema } from "./schemas";
import type { DefectTimingClass, DefectiveDecisionResult, DefectiveProductCaseInput, DefectiveProductDecisionCode, RepairGuaranteeExtension, SecondaryRemedyGround } from "./types";

export const REPAIR_EXTENSION_EFFECTIVE_DATE = "2026-07-31";
const defaultEvidence = ["PURCHASE", "DEFECT", "CORRESPONDENCE"];
const sourcesByCode: Record<DefectiveProductDecisionCode, LegalSourceId[]> = {
  NEEDS_MORE_INFORMATION: ["VVTAT_GUARANTEES"], NOT_CONSUMER_PURCHASE: ["VVTAT_GUARANTEES"], PRIVATE_SELLER: ["VVTAT_GUARANTEES"], SELLER_STATUS_REVIEW_REQUIRED: ["VVTAT_GUARANTEES"], UNSUPPORTED_TRANSACTION_TYPE: ["EU_SALE_OF_GOODS"],
  USED_GOODS_TERM_REVIEW_REQUIRED: ["EU_SALE_OF_GOODS", "LT_CIVIL_CODE"], INVALID_DATE: ["VVTAT_GUARANTEES"], STATUTORY_LIABILITY_PERIOD_APPEARS_EXPIRED: ["VVTAT_GUARANTEES", "EU_SALE_OF_GOODS"],
  CAUSE_REVIEW_REQUIRED: ["VVTAT_GUARANTEES", "EU_SALE_OF_GOODS"], PURCHASE_EVIDENCE_MISSING: ["VVTAT_PURCHASE_DOCUMENT", "VVTAT_CLAIMS"], CONTACT_SELLER_REPAIR_OR_REPLACE: ["VVTAT_GUARANTEES", "VVTAT_CLAIMS"],
  PRIMARY_REMEDY_FIRST: ["VVTAT_GUARANTEES", "EU_SALE_OF_GOODS"], CLAIM_REQUIREMENT_UNCLEAR: ["VVTAT_CLAIMS"], SELLER_RESPONSE_PERIOD_RUNNING: ["VVTAT_CLAIMS"], SELLER_RESPONSE_OVERDUE: ["VVTAT_CLAIMS"],
  SELLER_REFUSAL_REVIEW_REQUIRED: ["VVTAT_GUARANTEES", "VVTAT_CLAIMS"], SECONDARY_REMEDIES_MAY_BE_AVAILABLE: ["VVTAT_GUARANTEES", "EU_SALE_OF_GOODS", "VVTAT_CLAIMS"],
  SERIOUSNESS_REVIEW_REQUIRED: ["VVTAT_GUARANTEES", "EU_SALE_OF_GOODS"], REPAIR_DELAY_REVIEW_REQUIRED: ["VVTAT_GUARANTEES", "EU_SALE_OF_GOODS"], VVTAT_ESCALATION_MAY_BE_AVAILABLE: ["VVTAT_CLAIMS", "VVTAT_GUARANTEES"],
  COMMERCIAL_GUARANTEE_MAY_APPLY: ["EU_SALE_OF_GOODS", "VVTAT_GUARANTEES"], POST_GUARANTEE_REPAIR_RIGHT_MAY_APPLY: ["VVTAT_RIGHT_TO_REPAIR", "EU_RIGHT_TO_REPAIR"], RIGHT_TO_REPAIR_REVIEW_REQUIRED: ["VVTAT_RIGHT_TO_REPAIR", "EU_RIGHT_TO_REPAIR"], SELLER_OFFER_ACCEPTED: ["VVTAT_CLAIMS"], CASE_RESOLVED: ["VVTAT_GUARANTEES"]
};
const statuses: Partial<Record<DefectiveProductDecisionCode, DefectiveDecisionResult["status"]>> = {
  NEEDS_MORE_INFORMATION: "NEEDS_MORE_INFORMATION", SELLER_STATUS_REVIEW_REQUIRED: "NEEDS_MORE_INFORMATION", USED_GOODS_TERM_REVIEW_REQUIRED: "NEEDS_MORE_INFORMATION", INVALID_DATE: "NEEDS_MORE_INFORMATION", CAUSE_REVIEW_REQUIRED: "NEEDS_MORE_INFORMATION", PURCHASE_EVIDENCE_MISSING: "NEEDS_MORE_INFORMATION", CLAIM_REQUIREMENT_UNCLEAR: "NEEDS_MORE_INFORMATION", SELLER_REFUSAL_REVIEW_REQUIRED: "NEEDS_MORE_INFORMATION", SERIOUSNESS_REVIEW_REQUIRED: "NEEDS_MORE_INFORMATION", REPAIR_DELAY_REVIEW_REQUIRED: "NEEDS_MORE_INFORMATION", RIGHT_TO_REPAIR_REVIEW_REQUIRED: "NEEDS_MORE_INFORMATION", SELLER_RESPONSE_PERIOD_RUNNING: "WAITING", SELLER_OFFER_ACCEPTED: "WAITING", CASE_RESOLVED: "INFORMATION", NOT_CONSUMER_PURCHASE: "REDIRECT", PRIVATE_SELLER: "REDIRECT", UNSUPPORTED_TRANSACTION_TYPE: "REDIRECT"
};
const steps: Partial<Record<DefectiveProductDecisionCode, string[]>> = {
  NEEDS_MORE_INFORMATION: ["CHECK_FACTS"], NOT_CONSUMER_PURCHASE: ["SEEK_OTHER_ADVICE"], PRIVATE_SELLER: ["CHECK_CONTRACT"], SELLER_STATUS_REVIEW_REQUIRED: ["IDENTIFY_SELLER"], UNSUPPORTED_TRANSACTION_TYPE: ["CHECK_OTHER_RULES"],
  USED_GOODS_TERM_REVIEW_REQUIRED: ["CHECK_USED_AGREEMENT"], INVALID_DATE: ["CHECK_DATES"], STATUTORY_LIABILITY_PERIOD_APPEARS_EXPIRED: ["CHECK_COMMERCIAL_OR_REPAIR"], CAUSE_REVIEW_REQUIRED: ["PRESERVE_CAUSE_EVIDENCE"], PURCHASE_EVIDENCE_MISSING: ["FIND_PURCHASE_EVIDENCE"],
  CONTACT_SELLER_REPAIR_OR_REPLACE: ["DESCRIBE_DEFECT", "REQUEST_PRIMARY_REMEDY", "SEND_WRITTEN_CLAIM", "SAVE_CLAIM"], PRIMARY_REMEDY_FIRST: ["REQUEST_PRIMARY_REMEDY", "SAVE_CLAIM"], CLAIM_REQUIREMENT_UNCLEAR: ["CLARIFY_DEMAND"],
  SELLER_RESPONSE_PERIOD_RUNNING: ["WAIT_FOR_RESPONSE", "SAVE_CLAIM"], SELLER_RESPONSE_OVERDUE: ["CONSIDER_VVTAT", "SAVE_CLAIM"], SELLER_REFUSAL_REVIEW_REQUIRED: ["REVIEW_REFUSAL"], SECONDARY_REMEDIES_MAY_BE_AVAILABLE: ["CONSIDER_SECONDARY", "SAVE_REPAIR_RECORDS", "CONSIDER_VVTAT"],
  SERIOUSNESS_REVIEW_REQUIRED: ["GET_ASSESSMENT"], REPAIR_DELAY_REVIEW_REQUIRED: ["ASK_REPAIR_TIMELINE", "SAVE_REPAIR_RECORDS"], VVTAT_ESCALATION_MAY_BE_AVAILABLE: ["CONSIDER_VVTAT"], COMMERCIAL_GUARANTEE_MAY_APPLY: ["CHECK_COMMERCIAL_TERMS"],
  POST_GUARANTEE_REPAIR_RIGHT_MAY_APPLY: ["CHECK_MANUFACTURER_REPAIR"], RIGHT_TO_REPAIR_REVIEW_REQUIRED: ["CHECK_PRODUCT_RULES"], SELLER_OFFER_ACCEPTED: ["AGREE_OFFER_DETAILS"], CASE_RESOLVED: ["SAVE_RESOLUTION"]
};
function result(code: DefectiveProductDecisionCode, extra: Partial<DefectiveDecisionResult> = {}): DefectiveDecisionResult {
  return {
    code, status: statuses[code] ?? "ACTION_REQUIRED", reasonIds: [code], nextStepIds: steps[code] ?? [], warningIds: [], evidenceIds: defaultEvidence,
    sourceIds: sourcesByCode[code], rulesTriggered: [code], infoBlockIds: [], repairGuaranteeExtension: "NOT_RELEVANT", secondaryRemedyGrounds: [], ...extra
  };
}
function repairExtension(input: DefectiveProductCaseInput, statutoryActive: boolean): RepairGuaranteeExtension {
  if (!statutoryActive || input.sellerClaim?.requestedRemedy !== "REPAIR") return "NOT_RELEVANT";
  if (input.deliveredAt && input.deliveredAt < REPAIR_EXTENSION_EFFECTIVE_DATE) return "DOES_NOT_APPLY_BY_PURCHASE_DATE";
  if (!input.purchasedAt) return "UNKNOWN";
  return input.purchasedAt >= REPAIR_EXTENSION_EFFECTIVE_DATE ? "APPLIES" : "DOES_NOT_APPLY_BY_PURCHASE_DATE";
}
/** Pure, deterministic classification. Unknown or inconsistent facts stay in review states. */
export function evaluateDefectiveProductCase(rawInput: DefectiveProductCaseInput): DefectiveDecisionResult {
  const parsed = defectiveProductCaseSchema.safeParse(rawInput);
  if (!parsed.success) return result("NEEDS_MORE_INFORMATION");
  const input = parsed.data;
  if (!parseCalendarDate(input.asOfDate)) return result("INVALID_DATE");
  if (!input.buyerType) return result("NEEDS_MORE_INFORMATION");
  if (input.buyerType === "BUSINESS") return result("NOT_CONSUMER_PURCHASE");
  if (!input.sellerType) return result("NEEDS_MORE_INFORMATION");
  if (input.sellerType === "PRIVATE") return result("PRIVATE_SELLER");
  if (input.sellerType === "UNKNOWN") return result("SELLER_STATUS_REVIEW_REQUIRED");
  if (!input.transactionKind) return result("NEEDS_MORE_INFORMATION");
  if (input.transactionKind !== "GOODS") return result("UNSUPPORTED_TRANSACTION_TYPE");
  if (!input.goodsConditionAtSale || !input.deliveredAt) return result("NEEDS_MORE_INFORMATION");
  if (!validSequence(input.deliveredAt, input.asOfDate) || (input.purchasedAt && !validSequence(input.purchasedAt, input.deliveredAt)) || (input.defectDetectedAt && (!validSequence(input.deliveredAt, input.defectDetectedAt) || !validSequence(input.defectDetectedAt, input.asOfDate)))) return result("INVALID_DATE");
  if (input.sellerClaim?.receivedAt && (!validSequence(input.deliveredAt, input.sellerClaim.receivedAt) || !validSequence(input.sellerClaim.receivedAt, input.asOfDate) || (input.defectDetectedAt && !validSequence(input.defectDetectedAt, input.sellerClaim.receivedAt)))) return result("INVALID_DATE");
  if (input.goodsConditionAtSale === "UNKNOWN") return result("USED_GOODS_TERM_REVIEW_REQUIRED");
  const observedAt = input.defectDetectedAt ?? input.asOfDate;
  const oneYearEnd = addCalendarMonths(input.deliveredAt, 12)!;
  const twoYearEnd = addCalendarMonths(input.deliveredAt, 24)!;
  let statutoryPeriodEnd = twoYearEnd;
  if (input.goodsConditionAtSale === "USED" && observedAt > oneYearEnd && observedAt <= twoYearEnd) {
    const agreement = input.usedGoodsLiabilityAgreement;
    if (!agreement || agreement.hasShortenedTerm === null || (agreement.hasShortenedTerm && agreement.months === undefined)) return result("USED_GOODS_TERM_REVIEW_REQUIRED");
  }
  if (input.goodsConditionAtSale === "USED" && input.usedGoodsLiabilityAgreement?.hasShortenedTerm) {
    const months = input.usedGoodsLiabilityAgreement.months;
    if (!months || months < 12 || months > 24) return result("USED_GOODS_TERM_REVIEW_REQUIRED");
    statutoryPeriodEnd = addCalendarMonths(input.deliveredAt, months)!;
  }
  const statutoryActive = observedAt <= statutoryPeriodEnd;
  const timing: DefectTimingClass = input.defectDetectedAt ? (input.defectDetectedAt <= oneYearEnd ? "WITHIN_FIRST_YEAR" : "AFTER_FIRST_YEAR") : (input.defectTimingClass ?? "UNKNOWN");
  const common: Partial<DefectiveDecisionResult> = {
    statutoryPeriodEnd, defectTimingClass: timing,
    warningIds: timing === "AFTER_FIRST_YEAR" ? ["LATER_PROOF"] : timing === "UNKNOWN" ? ["TIMING_UNKNOWN"] : [],
    infoBlockIds: timing === "WITHIN_FIRST_YEAR" ? ["FIRST_YEAR_PRESUMPTION"] : [],
    repairGuaranteeExtension: repairExtension(input, statutoryActive)
  };
  if (common.repairGuaranteeExtension === "APPLIES") {
    common.infoBlockIds = [...(common.infoBlockIds ?? []), "REPAIR_EXTENSION"];
    common.sourceIds = ["VVTAT_RIGHT_TO_REPAIR", "EU_RIGHT_TO_REPAIR"];
  } else if (common.repairGuaranteeExtension === "UNKNOWN") common.warningIds = [...(common.warningIds ?? []), "PURCHASE_DATE_UNKNOWN"];
  const finish = (code: DefectiveProductDecisionCode, extra: Partial<DefectiveDecisionResult> = {}) => result(code, {
    ...common, ...extra,
    sourceIds: [...new Set([...sourcesByCode[code], ...(input.writtenSellerContact === "YES" ? ["LT_CONSUMER_RIGHTS_ACT" as LegalSourceId] : []), ...(common.sourceIds ?? []), ...(extra.sourceIds ?? [])])],
    warningIds: [...(common.warningIds ?? []), ...(extra.warningIds ?? [])],
    infoBlockIds: [...(common.infoBlockIds ?? []), ...(extra.infoBlockIds ?? [])],
    rulesTriggered: ["B2C_GOODS", statutoryActive ? "STATUTORY_PERIOD_ACTIVE" : "STATUTORY_PERIOD_EXPIRED", code, ...(extra.rulesTriggered ?? [])]
  });
  if (!statutoryActive) {
    if (input.hasCommercialGuarantee === true) return finish("COMMERCIAL_GUARANTEE_MAY_APPLY");
    if (input.asOfDate < REPAIR_EXTENSION_EFFECTIVE_DATE) return finish("STATUTORY_LIABILITY_PERIOD_APPEARS_EXPIRED");
    if (input.asOfDate >= REPAIR_EXTENSION_EFFECTIVE_DATE && input.rightToRepairCategory && isListedRepairCategory(input.rightToRepairCategory)) return finish("POST_GUARANTEE_REPAIR_RIGHT_MAY_APPLY");
    if (input.rightToRepairCategory === "UNKNOWN") return finish("RIGHT_TO_REPAIR_REVIEW_REQUIRED");
    return finish("STATUTORY_LIABILITY_PERIOD_APPEARS_EXPIRED");
  }
  if (!input.apparentCause) return finish("NEEDS_MORE_INFORMATION");
  if (input.apparentCause === "ACCIDENT_OR_EXTERNAL_DAMAGE" || input.apparentCause === "UNKNOWN") return finish("CAUSE_REVIEW_REQUIRED");
  if (!input.purchaseEvidence) return finish("NEEDS_MORE_INFORMATION");
  if (input.purchaseEvidence === "NONE" || input.purchaseEvidence === "UNKNOWN") return finish("PURCHASE_EVIDENCE_MISSING");
  if (!input.writtenSellerContact) return finish("NEEDS_MORE_INFORMATION");
  if (input.writtenSellerContact !== "YES") {
    if (input.sellerClaim?.requestedRemedy === "TERMINATION_REFUND" || input.sellerClaim?.requestedRemedy === "PRICE_REDUCTION") return finish("PRIMARY_REMEDY_FIRST");
    return finish("CONTACT_SELLER_REPAIR_OR_REPLACE", { warningIds: input.writtenSellerContact === "UNCLEAR" ? ["VERBAL_NOT_WRITTEN"] : [] });
  }
  if (!input.sellerClaim || input.sellerClaim.requestedRemedy === "UNKNOWN" || input.sellerClaim.requestedRemedy === "OTHER") return finish("CLAIM_REQUIREMENT_UNCLEAR");
  if (!input.sellerOutcome) return finish("NEEDS_MORE_INFORMATION");
  if (input.sellerOutcome === "RESOLVED") return finish("CASE_RESOLVED");
  const deadline = input.sellerClaim.receivedAt ? sellerResponseDeadline(input.sellerClaim.receivedAt) ?? undefined : undefined;
  if (input.sellerOutcome === "NO_RESPONSE") {
    if (!deadline) return finish("SELLER_REFUSAL_REVIEW_REQUIRED", { warningIds: ["RECEIPT_DATE_UNKNOWN"] });
    const overdue = sellerResponseOverdue(input.sellerClaim.receivedAt!, input.asOfDate);
    return finish(overdue ? "SELLER_RESPONSE_OVERDUE" : "SELLER_RESPONSE_PERIOD_RUNNING", { responseDeadline: deadline, rulesTriggered: [overdue ? "WRITTEN_RESPONSE_OVERDUE" : "WRITTEN_RESPONSE_RUNNING"], infoBlockIds: ["RESPONSE_NOT_REPAIR_DEADLINE"] });
  }
  if (input.sellerOutcome === "REPAIR_FAILED_OR_DEFECT_RECURRED" || input.sellerOutcome === "REPLACEMENT_DEFECTIVE") return finish("SECONDARY_REMEDIES_MAY_BE_AVAILABLE", { secondaryRemedyGrounds: ["DEFECT_PERSISTS_AFTER_ATTEMPT"], evidenceIds: [...defaultEvidence, "REPAIR_RECORDS", "SELLER_RESPONSE"], infoBlockIds: ["MINOR_DEFECT_LIMIT", "VVTAT"] });
  if (input.sellerOutcome === "REFUSED") {
    if (input.sellerClaim.requestedRemedy === "REPAIR" || input.sellerClaim.requestedRemedy === "REPLACEMENT") return finish("SECONDARY_REMEDIES_MAY_BE_AVAILABLE", { secondaryRemedyGrounds: ["SELLER_REFUSED_CONFORMITY_REMEDY"], evidenceIds: [...defaultEvidence, "SELLER_RESPONSE"], infoBlockIds: ["MINOR_DEFECT_LIMIT", "VVTAT"] });
    return finish("SELLER_REFUSAL_REVIEW_REQUIRED", { warningIds: ["REFUND_NOT_AUTOMATIC"], infoBlockIds: ["VVTAT"] });
  }
  if (input.sellerOutcome === "REPAIR_ACCEPTED" || input.sellerOutcome === "REPLACEMENT_ACCEPTED") return finish("REPAIR_DELAY_REVIEW_REQUIRED", { status: "WAITING", infoBlockIds: ["REPAIR_REASONABLE_TIME", "RESPONSE_NOT_REPAIR_DEADLINE"], evidenceIds: [...defaultEvidence, "REPAIR_RECORDS"] });
  if (input.sellerOutcome === "ALTERNATIVE_OFFERED") {
    if (input.alternativeAccepted === true) return finish("SELLER_OFFER_ACCEPTED");
    if (input.alternativeAccepted === false) return finish("VVTAT_ESCALATION_MAY_BE_AVAILABLE", { infoBlockIds: ["VVTAT"], evidenceIds: [...defaultEvidence, "SELLER_RESPONSE"] });
    return finish("SELLER_REFUSAL_REVIEW_REQUIRED");
  }
  return finish("SELLER_REFUSAL_REVIEW_REQUIRED");
}
