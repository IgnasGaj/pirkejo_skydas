import { addCalendarMonths, parseCalendarDate } from "./dateRules";
import { REPAIR_EXTENSION_EFFECTIVE_DATE } from "./evaluateDefectiveProductCase";
import type { DefectiveProductCaseInput } from "./types";

export type DefectiveStep = "buyerType" | "sellerType" | "transactionKind" | "goodsConditionAtSale" | "usedAgreement" | "usedMonths" | "deliveredAt" | "defectDetectedAt" | "apparentCause" | "purchaseEvidence" | "writtenSellerContact" | "requestedRemedy" | "purchasedAt" | "claimReceivedAt" | "sellerOutcome" | "alternativeAccepted" | "hasCommercialGuarantee" | "rightToRepairCategory";

export function nextDefectiveStep(a: DefectiveProductCaseInput): DefectiveStep | null {
  if (!a.buyerType) return "buyerType";
  if (a.buyerType === "BUSINESS") return null;
  if (!a.sellerType) return "sellerType";
  if (a.sellerType !== "PROFESSIONAL") return null;
  if (!a.transactionKind) return "transactionKind";
  if (a.transactionKind !== "GOODS") return null;
  if (!a.goodsConditionAtSale) return "goodsConditionAtSale";
  if (a.goodsConditionAtSale === "UNKNOWN") return null;
  if (a.goodsConditionAtSale === "USED" && !a.usedGoodsLiabilityAgreement) return "usedAgreement";
  if (a.goodsConditionAtSale === "USED" && a.usedGoodsLiabilityAgreement?.hasShortenedTerm && a.usedGoodsLiabilityAgreement.months === undefined && !a.usedTermUnknown) return "usedMonths";
  if (!a.deliveredAt) return "deliveredAt";
  if (!parseCalendarDate(a.deliveredAt) || a.deliveredAt > a.asOfDate) return null;
  if (!a.defectDetectedAt && !a.defectTimingClass) return "defectDetectedAt";
  if (a.defectDetectedAt && (!parseCalendarDate(a.defectDetectedAt) || a.defectDetectedAt < a.deliveredAt || a.defectDetectedAt > a.asOfDate)) return null;
  const observed = a.defectDetectedAt ?? a.asOfDate;
  const months = a.goodsConditionAtSale === "USED" && a.usedGoodsLiabilityAgreement?.hasShortenedTerm ? a.usedGoodsLiabilityAgreement.months : 24;
  if (a.goodsConditionAtSale === "USED" && observed > addCalendarMonths(a.deliveredAt, 12)! && (a.usedGoodsLiabilityAgreement?.hasShortenedTerm === null || a.usedTermUnknown)) return null;
  if (months === undefined || months < 12 || months > 24) return null;
  if (observed > addCalendarMonths(a.deliveredAt, months)!) {
    if (a.hasCommercialGuarantee === undefined) return "hasCommercialGuarantee";
    if (a.hasCommercialGuarantee === true) return null;
    if (a.asOfDate < REPAIR_EXTENSION_EFFECTIVE_DATE) return null;
    if (!a.rightToRepairCategory) return "rightToRepairCategory";
    return null;
  }
  if (!a.apparentCause) return "apparentCause";
  if (a.apparentCause !== "NORMAL_USE_OR_UNKNOWN_DEFECT") return null;
  if (!a.purchaseEvidence) return "purchaseEvidence";
  if (a.purchaseEvidence === "NONE" || a.purchaseEvidence === "UNKNOWN") return null;
  if (!a.writtenSellerContact) return "writtenSellerContact";
  if (!a.sellerClaim) return "requestedRemedy";
  if (a.sellerClaim.requestedRemedy === "REPAIR" && a.deliveredAt >= REPAIR_EXTENSION_EFFECTIVE_DATE && !a.purchasedAt && !a.purchaseDateUnknown) return "purchasedAt";
  if (a.writtenSellerContact !== "YES") return null;
  if (a.sellerClaim.requestedRemedy === "UNKNOWN" || a.sellerClaim.requestedRemedy === "OTHER") return null;
  if (!a.sellerClaim.receivedAt && !a.claimReceivedUnknown) return "claimReceivedAt";
  if (a.sellerClaim.receivedAt && (!parseCalendarDate(a.sellerClaim.receivedAt) || a.sellerClaim.receivedAt < a.deliveredAt || a.sellerClaim.receivedAt > a.asOfDate)) return null;
  if (!a.sellerOutcome) return "sellerOutcome";
  if (a.sellerOutcome === "ALTERNATIVE_OFFERED" && a.alternativeAccepted === undefined) return "alternativeAccepted";
  return null;
}
