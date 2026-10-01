import { z } from "zod";

export const returnCaseSchema = z.object({
  asOfDate: z.string(),
  defective: z.enum(["YES", "NO", "UNKNOWN"]).optional(),
  buyer: z.enum(["CONSUMER", "BUSINESS"]).optional(),
  seller: z.enum(["PROFESSIONAL", "PRIVATE", "UNKNOWN"]).optional(),
  purchaseChannel: z.enum(["PHYSICAL_STORE", "DISTANCE"]).optional(),
  purchaseDate: z.string().optional(),
  deliveryDate: z.string().optional(),
  productCategory: z.enum([
    "CLOTHING_SHOES", "ELECTRONICS", "COSMETICS_HYGIENE", "UNDERWEAR",
    "FURNITURE", "BOOKS", "TOYS_GAMES", "JEWELLERY", "MEDICAL_DEVICE",
    "OTHER", "UNKNOWN"
  ]).optional(),
  productSubtype: z.enum([
    "ADULT_CLOTHING_OR_SHOES", "MOBILE_PHONE", "COSMETIC_PREPARATION",
    "CHILDRENS_TOY", "BOARD_GAME", "SPORTS_BALL", "DOCUMENTED_CN_9001_9033",
    "PRECIOUS_METAL_JEWELLERY", "PRINTED_BOOK", "UNSURE"
  ]).optional(),
  used: z.enum(["NO", "YES", "INSPECTED", "UNKNOWN"]).optional(),
  appearanceIntact: z.enum(["YES", "NO", "UNKNOWN"]).optional(),
  purchaseEvidence: z.enum(["RECEIPT", "INVOICE", "PAYMENT_RECORD", "OTHER", "NONE", "UNKNOWN"]).optional(),
  customMade: z.enum(["YES", "NO", "UNKNOWN"]).optional(),
  perishable: z.enum(["YES", "NO", "UNKNOWN"]).optional(),
  sealedHygiene: z.enum(["YES", "NO", "UNKNOWN"]).optional(),
  sealOpened: z.enum(["YES", "NO", "UNKNOWN"]).optional(),
  otherDistanceException: z.enum(["SEALED_MEDIA_OR_SOFTWARE_OPENED", "DIGITAL_CONTENT_STARTED_WITH_CONSENT", "OTHER_EXCEPTION", "NONE", "UNKNOWN"]).optional(),
  handlingLevel: z.enum(["UNOPENED", "INSPECTED", "USED_BEYOND_INSPECTION", "UNKNOWN"]).optional()
});

export type ReturnCaseInput = z.infer<typeof returnCaseSchema>;
export type ProductCategory = NonNullable<ReturnCaseInput["productCategory"]>;
export type ProductSubtype = NonNullable<ReturnCaseInput["productSubtype"]>;
export type PhysicalReturnClassification = "STANDARD" | "SELLER_CONSENT_REQUIRED" | "REQUIRES_REVIEW";
export type PurchaseChannel = NonNullable<ReturnCaseInput["purchaseChannel"]>;
export type PurchaseEvidence = NonNullable<ReturnCaseInput["purchaseEvidence"]>;
export type HandlingLevel = NonNullable<ReturnCaseInput["handlingLevel"]>;
export type DistanceReturnException =
  | "CUSTOM_MADE" | "PERISHABLE" | "SEALED_HYGIENE_OPENED"
  | "SEALED_MEDIA_OR_SOFTWARE_OPENED" | "DIGITAL_CONTENT_STARTED_WITH_CONSENT"
  | "OTHER_EXCEPTION" | "NONE" | "UNKNOWN";

export type DecisionCode =
  | "DEFECT_FLOW_REQUIRED" | "NOT_CONSUMER_PURCHASE" | "PRIVATE_SELLER"
  | "PHYSICAL_RETURN_PERIOD_EXPIRED" | "SELLER_CONSENT_REQUIRED"
  | "CATEGORY_REVIEW_REQUIRED" | "PHYSICAL_CONDITION_NOT_MET"
  | "PURCHASE_EVIDENCE_MISSING" | "PHYSICAL_RETURN_LIKELY_AVAILABLE"
  | "DISTANCE_STANDARD_PERIOD_EXPIRED" | "SPECIAL_REVIEW_REQUIRED"
  | "DISTANCE_EXCEPTION_APPLIES" | "DISTANCE_WITHDRAWAL_LIKELY_AVAILABLE"
  | "NEEDS_MORE_INFORMATION";

export type LegalSourceId =
  | "VVTAT_14_DAY_MYTHS" | "VVTAT_FAQ" | "VVTAT_PURCHASE_DOCUMENT"
  | "LT_RETAIL_RULES" | "LT_CIVIL_CODE" | "EU_CRD_WITHDRAWAL" | "EU_CRD_DIMINISHED_VALUE"
  | "VVTAT_MOBILE_PHONE" | "EU_CN_SPORTS_BALL"
  | "VVTAT_GUARANTEES" | "VVTAT_CLAIMS" | "VVTAT_RIGHT_TO_REPAIR"
  | "EU_SALE_OF_GOODS" | "EU_RIGHT_TO_REPAIR" | "LT_CONSUMER_RIGHTS_ACT";

export interface DecisionReason { text: string }
export interface NextStep { text: string }

export interface DecisionResult {
  code: DecisionCode;
  status: "LIKELY_ELIGIBLE" | "LIKELY_NOT_ELIGIBLE" | "SELLER_CONSENT" | "NEEDS_MORE_INFORMATION" | "REDIRECT";
  title: string;
  summary: string;
  reasons: DecisionReason[];
  nextSteps: NextStep[];
  warnings: string[];
  sourceIds: LegalSourceId[];
  rulesTriggered: string[];
  classification?: {
    userCategory: ProductCategory;
    clarification?: ProductSubtype;
    legalClassification: PhysicalReturnClassification;
    sourceIds: LegalSourceId[];
  };
}
