import { z } from "zod";

export const defectiveProductCaseSchema = z.object({
  asOfDate: z.string(),
  buyerType: z.enum(["CONSUMER", "BUSINESS"]).optional(),
  sellerType: z.enum(["PROFESSIONAL", "PRIVATE", "UNKNOWN"]).optional(),
  transactionKind: z.enum(["GOODS", "DIGITAL_CONTENT_OR_SERVICE", "SERVICE", "UNKNOWN"]).optional(),
  goodsConditionAtSale: z.enum(["NEW", "USED", "UNKNOWN"]).optional(),
  usedGoodsLiabilityAgreement: z.object({ hasShortenedTerm: z.boolean().nullable(), months: z.number().int().optional() }).optional(),
  usedTermUnknown: z.boolean().optional(),
  purchasedAt: z.string().optional(), purchaseDateUnknown: z.boolean().optional(), deliveredAt: z.string().optional(), defectDetectedAt: z.string().optional(),
  defectTimingClass: z.enum(["WITHIN_FIRST_YEAR", "AFTER_FIRST_YEAR", "UNKNOWN"]).optional(),
  apparentCause: z.enum(["NORMAL_USE_OR_UNKNOWN_DEFECT", "ACCIDENT_OR_EXTERNAL_DAMAGE", "UNKNOWN"]).optional(),
  purchaseEvidence: z.enum(["RECEIPT", "INVOICE", "PAYMENT_RECORD", "OTHER", "NONE", "UNKNOWN"]).optional(),
  writtenSellerContact: z.enum(["YES", "NO", "UNCLEAR"]).optional(),
  sellerClaim: z.object({ receivedAt: z.string().optional(), requestedRemedy: z.enum(["REPAIR", "REPLACEMENT", "PRICE_REDUCTION", "TERMINATION_REFUND", "OTHER", "UNKNOWN"]) }).optional(),
  claimReceivedUnknown: z.boolean().optional(),
  sellerOutcome: z.enum(["REPAIR_ACCEPTED", "REPLACEMENT_ACCEPTED", "ALTERNATIVE_OFFERED", "REFUSED", "NO_RESPONSE", "REPAIR_FAILED_OR_DEFECT_RECURRED", "REPLACEMENT_DEFECTIVE", "RESOLVED", "OTHER_OR_UNKNOWN"]).optional(),
  alternativeAccepted: z.boolean().nullable().optional(),
  rightToRepairCategory: z.enum(["WASHING_MACHINE_OR_WASHER_DRYER", "DISHWASHER", "REFRIGERATION_APPLIANCE", "TELEVISION", "WELDING_EQUIPMENT", "VACUUM_CLEANER", "SERVER_OR_DATA_STORAGE_PRODUCT", "MOBILE_PHONE_CORDLESS_PHONE_OR_TABLET", "TUMBLE_DRYER", "PRODUCT_WITH_LIGHT_MEANS_OF_TRANSPORT_BATTERY", "LOCAL_SPACE_HEATER", "OTHER", "UNKNOWN"]).optional(),
  hasCommercialGuarantee: z.boolean().nullable().optional()
});
