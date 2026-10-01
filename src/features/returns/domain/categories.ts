import type { LegalSourceId, PhysicalReturnClassification, ProductCategory, ProductSubtype } from "./types";

export interface ProductCategoryRule {
  id: ProductCategory;
  label: string;
}

export interface ProductClarificationOption {
  id: ProductSubtype;
  label: string;
  classification: PhysicalReturnClassification;
  sourceIds: LegalSourceId[];
}

export interface ProductClarification {
  title: string;
  hint: string;
  options: ProductClarificationOption[];
}

export interface PhysicalClassification {
  legalClassification: PhysicalReturnClassification;
  sourceIds: LegalSourceId[];
  clarification?: ProductSubtype;
}

export const productCategories: ProductCategoryRule[] = [
  { id: "CLOTHING_SHOES", label: "Drabužiai / avalynė" },
  { id: "ELECTRONICS", label: "Elektronika / elektrotechnika" },
  { id: "COSMETICS_HYGIENE", label: "Kosmetika / higienos prekė" },
  { id: "UNDERWEAR", label: "Apatiniai drabužiai" },
  { id: "FURNITURE", label: "Baldai" },
  { id: "BOOKS", label: "Knygos" },
  { id: "TOYS_GAMES", label: "Žaislai / žaidimai" },
  { id: "JEWELLERY", label: "Juvelyriniai dirbiniai" },
  { id: "MEDICAL_DEVICE", label: "Medicinos priemonė / įrenginys" },
  { id: "OTHER", label: "Kita" },
  { id: "UNKNOWN", label: "Nežinau" }
];

const reviewOption: ProductClarificationOption = {
  id: "UNSURE", label: "Kitas tipas / negaliu tiksliai nustatyti",
  classification: "REQUIRES_REVIEW", sourceIds: []
};

// A selectable subtype makes a legal claim only when its source supports that precise mapping.
export const productClarifications: Partial<Record<ProductCategory, ProductClarification>> = {
  CLOTHING_SHOES: {
    title: "Kokia tai aprangos prekė?",
    hint: "Kūdikių ir kai kuriems apatiniams drabužiams taikomos atskiros taisyklės.",
    options: [
      { id: "ADULT_CLOTHING_OR_SHOES", label: "Suaugusiųjų viršutiniai drabužiai arba avalynė", classification: "STANDARD", sourceIds: ["LT_RETAIL_RULES", "VVTAT_14_DAY_MYTHS"] },
      reviewOption
    ]
  },
  ELECTRONICS: {
    title: "Koks tikslus elektronikos prekės tipas?",
    hint: "Bendras žodis „elektronika“ neįrodo teisinės prekių grupės.",
    options: [
      { id: "MOBILE_PHONE", label: "Mobilusis telefonas", classification: "SELLER_CONSENT_REQUIRED", sourceIds: ["LT_RETAIL_RULES", "VVTAT_MOBILE_PHONE"] },
      reviewOption
    ]
  },
  COSMETICS_HYGIENE: {
    title: "Koks tikslus prekės tipas?",
    hint: "Fizinės parduotuvės klasifikacija atskira nuo nuotolinio pirkimo plombos išimties.",
    options: [
      { id: "COSMETIC_PREPARATION", label: "Parfumerijos, kosmetikos ar tualetinis preparatas", classification: "SELLER_CONSENT_REQUIRED", sourceIds: ["LT_RETAIL_RULES"] },
      reviewOption
    ]
  },
  BOOKS: {
    title: "Kokio tipo tai knyga?",
    hint: "Spausdintoms knygoms taikoma atskira fizinės parduotuvės taisyklė.",
    options: [
      { id: "PRINTED_BOOK", label: "Spausdinta knyga", classification: "SELLER_CONSENT_REQUIRED", sourceIds: ["LT_RETAIL_RULES"] },
      reviewOption
    ]
  },
  TOYS_GAMES: {
    title: "Kokia tai prekė?",
    hint: "Sporto reikmenys taisyklėse atskirti nuo žaislų ir žaidimų.",
    options: [
      { id: "CHILDRENS_TOY", label: "Vaikiškas žaislas", classification: "SELLER_CONSENT_REQUIRED", sourceIds: ["LT_RETAIL_RULES"] },
      { id: "BOARD_GAME", label: "Stalo žaidimas", classification: "SELLER_CONSENT_REQUIRED", sourceIds: ["LT_RETAIL_RULES"] },
      { id: "SPORTS_BALL", label: "Paprastas pripučiamas sporto kamuolys", classification: "STANDARD", sourceIds: ["LT_RETAIL_RULES", "EU_CN_SPORTS_BALL"] },
      reviewOption
    ]
  },
  JEWELLERY: {
    title: "Iš ko pagamintas papuošalas?",
    hint: "Taisyklėse dirbtinė bižuterija aiškiai atskirta nuo tauriųjų metalų dirbinių.",
    options: [
      { id: "PRECIOUS_METAL_JEWELLERY", label: "Tauriojo metalo juvelyrinis dirbinys", classification: "SELLER_CONSENT_REQUIRED", sourceIds: ["LT_RETAIL_RULES"] },
      reviewOption
    ]
  },
  MEDICAL_DEVICE: {
    title: "Koks tikslus medicinos prekės tipas?",
    hint: "Vien apibūdinimas „medicinos priemonė“ nepakankamas teisinei grupei nustatyti.",
    options: [
      { id: "DOCUMENTED_CN_9001_9033", label: "Prekės dokumentuose nurodytas KN kodas 9001–9033", classification: "SELLER_CONSENT_REQUIRED", sourceIds: ["LT_RETAIL_RULES"] },
      reviewOption
    ]
  }
};

const directClassifications: Partial<Record<ProductCategory, PhysicalClassification>> = {
  UNDERWEAR: { legalClassification: "SELLER_CONSENT_REQUIRED", sourceIds: ["LT_RETAIL_RULES"] },
  FURNITURE: { legalClassification: "SELLER_CONSENT_REQUIRED", sourceIds: ["LT_RETAIL_RULES"] },
  // Books require confirmation that the product is a printed book.
};

export function getProductCategoryRule(category: ProductCategory): ProductCategoryRule {
  return productCategories.find((rule) => rule.id === category)!;
}

export function getProductClarification(category: ProductCategory): ProductClarification | undefined {
  return productClarifications[category];
}

export function classifyPhysicalProduct(category: ProductCategory, subtype?: ProductSubtype): PhysicalClassification {
  const clarification = productClarifications[category];
  if (clarification) {
    const option = clarification.options.find((item) => item.id === subtype);
    if (option) return { legalClassification: option.classification, sourceIds: option.sourceIds, clarification: option.id };
    return { legalClassification: "REQUIRES_REVIEW", sourceIds: [], clarification: subtype };
  }
  // A subtype from a different category is conflicting evidence, never a shortcut to a class.
  if (subtype) return { legalClassification: "REQUIRES_REVIEW", sourceIds: [], clarification: subtype };
  return directClassifications[category] ?? { legalClassification: "REQUIRES_REVIEW", sourceIds: [] };
}
