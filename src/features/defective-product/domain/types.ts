import type { LegalSourceId, PurchaseEvidence } from "@/features/returns/domain/types";

export type BuyerType = "CONSUMER" | "BUSINESS";
export type SellerType = "PROFESSIONAL" | "PRIVATE" | "UNKNOWN";
export type TransactionKind = "GOODS" | "DIGITAL_CONTENT_OR_SERVICE" | "SERVICE" | "UNKNOWN";
export type GoodsConditionAtSale = "NEW" | "USED" | "UNKNOWN";
export type DefectTimingClass = "WITHIN_FIRST_YEAR" | "AFTER_FIRST_YEAR" | "UNKNOWN";
export type ApparentCause = "NORMAL_USE_OR_UNKNOWN_DEFECT" | "ACCIDENT_OR_EXTERNAL_DAMAGE" | "UNKNOWN";
export type WrittenSellerContact = "YES" | "NO" | "UNCLEAR";
export type RequestedRemedy = "REPAIR" | "REPLACEMENT" | "PRICE_REDUCTION" | "TERMINATION_REFUND" | "OTHER" | "UNKNOWN";
export type SellerOutcome = "REPAIR_ACCEPTED" | "REPLACEMENT_ACCEPTED" | "ALTERNATIVE_OFFERED" | "REFUSED" | "NO_RESPONSE" | "REPAIR_FAILED_OR_DEFECT_RECURRED" | "REPLACEMENT_DEFECTIVE" | "RESOLVED" | "OTHER_OR_UNKNOWN";
export type SecondaryRemedyGround = "SELLER_DID_NOT_REPAIR_OR_REPLACE" | "SELLER_REFUSED_CONFORMITY_REMEDY" | "DEFECT_PERSISTS_AFTER_ATTEMPT" | "POTENTIALLY_SERIOUS_DEFECT" | "SELLER_WILL_NOT_ACT_WITHIN_REASONABLE_TIME" | "SIGNIFICANT_INCONVENIENCE" | "UNKNOWN";
export type RepairGuaranteeExtension = "APPLIES" | "DOES_NOT_APPLY_BY_PURCHASE_DATE" | "NOT_RELEVANT" | "UNKNOWN";
export type RightToRepairProductCategory = "WASHING_MACHINE_OR_WASHER_DRYER" | "DISHWASHER" | "REFRIGERATION_APPLIANCE" | "TELEVISION" | "WELDING_EQUIPMENT" | "VACUUM_CLEANER" | "SERVER_OR_DATA_STORAGE_PRODUCT" | "MOBILE_PHONE_CORDLESS_PHONE_OR_TABLET" | "TUMBLE_DRYER" | "PRODUCT_WITH_LIGHT_MEANS_OF_TRANSPORT_BATTERY" | "LOCAL_SPACE_HEATER" | "OTHER" | "UNKNOWN";

export interface DefectiveProductCaseInput {
  asOfDate: string;
  buyerType?: BuyerType;
  sellerType?: SellerType;
  transactionKind?: TransactionKind;
  goodsConditionAtSale?: GoodsConditionAtSale;
  usedGoodsLiabilityAgreement?: { hasShortenedTerm: boolean | null; months?: number };
  usedTermUnknown?: boolean;
  purchasedAt?: string;
  purchaseDateUnknown?: boolean;
  deliveredAt?: string;
  defectDetectedAt?: string;
  defectTimingClass?: DefectTimingClass;
  apparentCause?: ApparentCause;
  purchaseEvidence?: PurchaseEvidence;
  writtenSellerContact?: WrittenSellerContact;
  sellerClaim?: { receivedAt?: string; requestedRemedy: RequestedRemedy };
  claimReceivedUnknown?: boolean;
  sellerOutcome?: SellerOutcome;
  alternativeAccepted?: boolean | null;
  rightToRepairCategory?: RightToRepairProductCategory;
  hasCommercialGuarantee?: boolean | null;
}

export type DefectiveProductDecisionCode =
  | "NEEDS_MORE_INFORMATION" | "NOT_CONSUMER_PURCHASE" | "PRIVATE_SELLER" | "SELLER_STATUS_REVIEW_REQUIRED"
  | "UNSUPPORTED_TRANSACTION_TYPE" | "USED_GOODS_TERM_REVIEW_REQUIRED" | "INVALID_DATE"
  | "STATUTORY_LIABILITY_PERIOD_APPEARS_EXPIRED" | "CAUSE_REVIEW_REQUIRED" | "PURCHASE_EVIDENCE_MISSING"
  | "CONTACT_SELLER_REPAIR_OR_REPLACE" | "PRIMARY_REMEDY_FIRST" | "CLAIM_REQUIREMENT_UNCLEAR"
  | "SELLER_RESPONSE_PERIOD_RUNNING" | "SELLER_RESPONSE_OVERDUE" | "SELLER_REFUSAL_REVIEW_REQUIRED"
  | "SECONDARY_REMEDIES_MAY_BE_AVAILABLE" | "SERIOUSNESS_REVIEW_REQUIRED" | "REPAIR_DELAY_REVIEW_REQUIRED"
  | "VVTAT_ESCALATION_MAY_BE_AVAILABLE" | "COMMERCIAL_GUARANTEE_MAY_APPLY"
  | "POST_GUARANTEE_REPAIR_RIGHT_MAY_APPLY" | "RIGHT_TO_REPAIR_REVIEW_REQUIRED" | "SELLER_OFFER_ACCEPTED" | "CASE_RESOLVED";

export interface DefectiveDecisionResult {
  code: DefectiveProductDecisionCode;
  status: "ACTION_REQUIRED" | "WAITING" | "NEEDS_MORE_INFORMATION" | "REDIRECT" | "INFORMATION";
  reasonIds: string[];
  nextStepIds: string[];
  warningIds: string[];
  evidenceIds: string[];
  sourceIds: LegalSourceId[];
  rulesTriggered: string[];
  infoBlockIds: string[];
  responseDeadline?: string;
  statutoryPeriodEnd?: string;
  defectTimingClass?: DefectTimingClass;
  repairGuaranteeExtension: RepairGuaranteeExtension;
  secondaryRemedyGrounds: SecondaryRemedyGround[];
}
