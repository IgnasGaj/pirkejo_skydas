import { classifyPhysicalProduct, getProductCategoryRule, getProductClarification } from "./categories";
import { evaluateFourteenDayPeriod } from "./dateRules";
import { returnCaseSchema, type DecisionResult, type LegalSourceId, type ReturnCaseInput } from "./types";

type ResultFields = Omit<DecisionResult, "reasons" | "nextSteps" | "warnings" | "sourceIds" | "rulesTriggered"> & {
  reasons?: string[];
  nextSteps?: string[];
  warnings?: string[];
  sourceIds: LegalSourceId[];
  rulesTriggered: string[];
};

function result(fields: ResultFields): DecisionResult {
  return {
    ...fields,
    reasons: (fields.reasons ?? []).map((text) => ({ text })),
    nextSteps: (fields.nextSteps ?? []).map((text) => ({ text })),
    warnings: fields.warnings ?? []
  };
}

function needMore(summary: string, rulesTriggered: string[], sourceIds: LegalSourceId[]): DecisionResult {
  return result({ code: "NEEDS_MORE_INFORMATION", status: "NEEDS_MORE_INFORMATION", title: "Reikia dar šiek tiek informacijos", summary, sourceIds, rulesTriggered });
}

/** Pure, deterministic rule engine. Dates and all answers come from the caller. */
export function evaluateReturnCase(input: ReturnCaseInput): DecisionResult {
  const parsed = returnCaseSchema.safeParse(input);
  if (!parsed.success) return needMore("Patikrinkite pateiktus atsakymus.", ["INVALID_INPUT"], ["VVTAT_FAQ"]);
  const answers = parsed.data;

  if (answers.defective === "YES") return result({
    code: "DEFECT_FLOW_REQUIRED", status: "REDIRECT",
    title: "Tai nėra paprastas prekės grąžinimas",
    summary: "Jeigu prekė sugedo, neveikia taip, kaip turėtų, arba turi kitų trūkumų, taikomos nekokybiškos prekės taisyklės.",
    nextSteps: ["Eiti į „Prekė sugedo“"], sourceIds: ["LT_CIVIL_CODE", "VVTAT_FAQ"], rulesTriggered: ["DEFECTIVE_PRODUCT"]
  });
  if (answers.defective !== "NO") return needMore("Patikslinkite, ar prekė turi trūkumą.", ["DEFECT_STATUS_UNKNOWN"], ["VVTAT_FAQ"]);

  if (answers.buyer === "BUSINESS") return result({
    code: "NOT_CONSUMER_PURCHASE", status: "REDIRECT",
    title: "Ši situacija nepatenka į įprastą vartotojų teisių apsaugą",
    summary: "Pirkėjo Skydas šiuo metu skirtas fizinių asmenų pirkiniams, įsigytiems asmeniniams, o ne verslo poreikiams.",
    sourceIds: ["LT_CIVIL_CODE"], rulesTriggered: ["BUSINESS_PURCHASE"]
  });
  if (!answers.buyer) return needMore("Nurodykite, kas įsigijo prekę.", ["BUYER_UNKNOWN"], ["LT_CIVIL_CODE"]);

  if (answers.seller === "PRIVATE") return result({
    code: "PRIVATE_SELLER", status: "REDIRECT", title: "Pirkote iš privataus žmogaus",
    summary: "Pirkėjo Skydas kol kas vertina pirkinius iš profesionalių pardavėjų. Vartotojams skirtų grąžinimo taisyklių šiam pirkiniui automatiškai netaikome.",
    sourceIds: ["LT_CIVIL_CODE", "VVTAT_FAQ"], rulesTriggered: ["PRIVATE_SELLER"]
  });
  if (answers.seller !== "PROFESSIONAL") return needMore("Patikslinkite, ar pardavėjas yra įmonė arba parduotuvė.", ["SELLER_UNKNOWN"], ["LT_CIVIL_CODE"]);

  if (answers.purchaseChannel === "PHYSICAL_STORE") {
    if (!answers.purchaseDate) return needMore("Nurodykite pirkimo datą.", ["PURCHASE_DATE_MISSING"], ["VVTAT_14_DAY_MYTHS"]);
    const period = evaluateFourteenDayPeriod(answers.purchaseDate, answers.asOfDate);
    if (period === "INVALID_DATE") return needMore("Pirkimo data neteisinga arba yra ateityje.", ["INVALID_PURCHASE_DATE"], ["VVTAT_14_DAY_MYTHS"]);
    if (period === "EXPIRED") return result({
      code: "PHYSICAL_RETURN_PERIOD_EXPIRED", status: "LIKELY_NOT_ELIGIBLE",
      title: "Įprastas 14 dienų terminas jau pasibaigė",
      summary: "Pardavėjas gali taikyti palankesnes savo taisykles, tačiau Pirkėjo Skydas negali automatiškai teigti, kad pardavėjas privalo priimti tinkamos kokybės prekę atgal.",
      reasons: ["Nuo pirkimo praėjo daugiau kaip 14 dienų."],
      nextSteps: ["Paklauskite pardavėjo apie jo grąžinimo politiką."],
      sourceIds: ["VVTAT_14_DAY_MYTHS", "LT_RETAIL_RULES"], rulesTriggered: ["PHYSICAL_B2C", "AFTER_14_DAYS"]
    });
    if (!answers.productCategory) return needMore("Pasirinkite prekės kategoriją.", ["CATEGORY_MISSING"], ["LT_RETAIL_RULES"]);
    const category = getProductCategoryRule(answers.productCategory);
    const physicalClassification = classifyPhysicalProduct(answers.productCategory, answers.productSubtype);
    const subtypeLabel = getProductClarification(answers.productCategory)?.options.find((option) => option.id === physicalClassification.clarification)?.label;
    const classification = {
      userCategory: answers.productCategory,
      clarification: physicalClassification.clarification,
      legalClassification: physicalClassification.legalClassification,
      sourceIds: physicalClassification.sourceIds
    };
    const physicalResult = (fields: ResultFields): DecisionResult => ({
      ...result({
        ...fields,
        sourceIds: [...new Set([...fields.sourceIds, ...physicalClassification.sourceIds])],
        rulesTriggered: [
          ...fields.rulesTriggered,
          `USER_CATEGORY_${answers.productCategory}`,
          ...(physicalClassification.clarification ? [`CATEGORY_CLARIFICATION_${physicalClassification.clarification}`] : []),
          `LEGAL_CLASSIFICATION_${physicalClassification.legalClassification}`
        ]
      }),
      classification
    });
    if (physicalClassification.legalClassification === "REQUIRES_REVIEW") return physicalResult({
      code: "CATEGORY_REVIEW_REQUIRED", status: "NEEDS_MORE_INFORMATION",
      title: "Reikia patikslinti prekės kategoriją",
      summary: "Tikslų prekės tipą reikia nustatyti prieš pateikiant patikimą atsakymą. Vien iš šio pasirinkimo teisinės prekių grupės nustatyti negalime.",
      nextSteps: ["Patikrinkite tikslią prekės rūšį ir paklauskite pardavėjo."],
      sourceIds: ["LT_RETAIL_RULES", "VVTAT_14_DAY_MYTHS"], rulesTriggered: ["PHYSICAL_B2C", "WITHIN_14_DAYS", "CATEGORY_REVIEW"]
    });
    if (physicalClassification.legalClassification === "SELLER_CONSENT_REQUIRED") return physicalResult({
      code: "SELLER_CONSENT_REQUIRED", status: "SELLER_CONSENT",
      title: "Pardavėjas neprivalo automatiškai priimti šios kokybiškos prekės",
      summary: "Nustatytas prekės tipas patenka tarp prekių, kurių tinkamos kokybės grąžinimas fizinėje parduotuvėje priklauso nuo pardavėjo sutikimo.",
      reasons: [`Prekė: ${subtypeLabel ?? category.label}.`],
      nextSteps: ["Vis tiek galite paklausti pardavėjo — kai kurios parduotuvės taiko palankesnes taisykles."],
      sourceIds: ["LT_RETAIL_RULES", "VVTAT_14_DAY_MYTHS"], rulesTriggered: ["PHYSICAL_B2C", "WITHIN_14_DAYS", "SELLER_CONSENT_CATEGORY"]
    });
    if (!answers.used || !answers.appearanceIntact || answers.used === "UNKNOWN" || answers.appearanceIntact === "UNKNOWN") return physicalResult({ code: "NEEDS_MORE_INFORMATION", status: "NEEDS_MORE_INFORMATION", title: "Reikia dar šiek tiek informacijos", summary: "Patikslinkite, ar prekė naudota ir ar išsaugojo prekinę išvaizdą.", sourceIds: ["LT_RETAIL_RULES"], rulesTriggered: ["PHYSICAL_CONDITION_UNKNOWN"] });
    if (answers.used === "YES" || answers.appearanceIntact === "NO") return physicalResult({
      code: "PHYSICAL_CONDITION_NOT_MET", status: "LIKELY_NOT_ELIGIBLE",
      title: "Pardavėjas gali turėti pagrindą nepriimti prekės",
      summary: "Įprastam kokybiškos prekės grąžinimui fizinėje parduotuvėje paprastai reikia, kad prekė būtų nenaudota, nesugadinta ir išsaugojusi prekinę išvaizdą.",
      nextSteps: ["Vis tiek galite paklausti pardavėjo apie palankesnes jo taisykles."],
      sourceIds: ["LT_RETAIL_RULES", "VVTAT_FAQ"], rulesTriggered: ["PHYSICAL_B2C", "WITHIN_14_DAYS", "CONDITION_NOT_MET"]
    });
    if (!answers.purchaseEvidence || answers.purchaseEvidence === "UNKNOWN") return physicalResult({ code: "NEEDS_MORE_INFORMATION", status: "NEEDS_MORE_INFORMATION", title: "Reikia dar šiek tiek informacijos", summary: "Patikslinkite, kokį pirkimo įrodymą turite.", sourceIds: ["VVTAT_PURCHASE_DOCUMENT"], rulesTriggered: ["EVIDENCE_UNKNOWN"] });
    if (answers.purchaseEvidence === "NONE") return physicalResult({
      code: "PURCHASE_EVIDENCE_MISSING", status: "NEEDS_MORE_INFORMATION",
      title: "Pirmiausia reikėtų rasti pirkimą patvirtinančių įrodymų",
      summary: "Čekis nėra vienintelis galimas įrodymas. Gali padėti sąskaita, banko ar kortelės įrašas arba kitas pirkimo dokumentas.",
      nextSteps: ["Patikrinkite el. paštą, banko išrašą arba paprašykite pardavėjo dokumento kopijos."],
      sourceIds: ["VVTAT_PURCHASE_DOCUMENT", "LT_RETAIL_RULES"], rulesTriggered: ["PHYSICAL_B2C", "WITHIN_14_DAYS", "EVIDENCE_MISSING"]
    });
    return physicalResult({
      code: "PHYSICAL_RETURN_LIKELY_AVAILABLE", status: "LIKELY_ELIGIBLE",
      title: "Pagal pateiktą informaciją galite turėti teisę grąžinti arba pakeisti prekę",
      summary: "Įprasta 14 dienų kokybiškos prekės grąžinimo tvarka gali būti taikoma. Galutinį sprendimą lemia konkrečios aplinkybės.",
      reasons: ["Prekė pirkta fizinėje parduotuvėje.", "Nepraėjo įprastas 14 dienų laikotarpis.", "Prekė nepatenka į pasirinktą išimčių kategoriją.", "Pagal pateiktus atsakymus prekė nėra naudota ar sugadinta.", "Turite pirkimą patvirtinančių įrodymų."],
      nextSteps: ["Kreipkitės į pardavėją.", "Turėkite pirkimą patvirtinančius įrodymus.", "Pasiimkite prekę ir komplektaciją.", "Jei pardavėjas atsisako — išsaugokite jo atsakymą."],
      warnings: ["Pardavėjas gali turėti papildomą palankesnę grąžinimo politiką."],
      sourceIds: ["LT_RETAIL_RULES", "VVTAT_14_DAY_MYTHS", "VVTAT_PURCHASE_DOCUMENT"],
      rulesTriggered: ["PHYSICAL_B2C", "WITHIN_14_DAYS", "STANDARD_CATEGORY", "CONDITION_MET", "EVIDENCE_PRESENT"]
    });
  }

  if (answers.purchaseChannel === "DISTANCE") {
    if (!answers.deliveryDate) return needMore("Nurodykite, kada fiziškai gavote prekę.", ["DELIVERY_DATE_MISSING"], ["EU_CRD_WITHDRAWAL"]);
    const period = evaluateFourteenDayPeriod(answers.deliveryDate, answers.asOfDate);
    if (period === "INVALID_DATE") return needMore("Gavimo data neteisinga arba yra ateityje.", ["INVALID_DELIVERY_DATE"], ["EU_CRD_WITHDRAWAL"]);
    if (period === "EXPIRED") return result({
      code: "SPECIAL_REVIEW_REQUIRED", status: "NEEDS_MORE_INFORMATION",
      title: "Įprastas 14 dienų atsisakymo terminas pasibaigė",
      summary: "Tačiau tam tikromis aplinkybėmis gali būti taikomos papildomos taisyklės, pavyzdžiui, jei apie atsisakymo teisę nebuvote tinkamai informuoti.",
      nextSteps: ["Patikrinkite pardavėjo suteiktą informaciją apie sutarties atsisakymą."],
      sourceIds: ["LT_CIVIL_CODE", "EU_CRD_WITHDRAWAL"], rulesTriggered: ["DISTANCE_B2C", "DISTANCE_STANDARD_PERIOD_EXPIRED", "SPECIAL_REVIEW_REQUIRED"]
    });
    if (answers.customMade === "YES" || answers.perishable === "YES" || (answers.sealedHygiene === "YES" && answers.sealOpened === "YES")) {
      const exception = answers.customMade === "YES" ? "CUSTOM_MADE" : answers.perishable === "YES" ? "PERISHABLE" : "SEALED_HYGIENE_OPENED";
      return result({
        code: "DISTANCE_EXCEPTION_APPLIES", status: "LIKELY_NOT_ELIGIBLE",
        title: "Šiam pirkiniui gali būti taikoma atsisakymo teisės išimtis",
        summary: "Pagal pateiktus atsakymus nustatyta išimtis iš įprastos nuotolinės sutarties atsisakymo tvarkos. Konkrečias aplinkybes verta patikrinti su pardavėju.",
        reasons: [exception === "CUSTOM_MADE" ? "Prekė pagaminta arba aiškiai pritaikyta specialiai jums." : exception === "PERISHABLE" ? "Prekė greitai genda arba jos galiojimo laikas labai trumpas." : "Sveikatos ar higienos sumetimais negrąžintinos užplombuotos prekės plomba buvo atidaryta."],
        nextSteps: ["Patikrinkite užsakymo sąlygas ir kreipkitės į pardavėją dėl konkrečios prekės."],
        sourceIds: ["EU_CRD_WITHDRAWAL", "LT_CIVIL_CODE"], rulesTriggered: ["DISTANCE_B2C", "WITHIN_14_DAYS", exception]
      });
    }
    if (answers.customMade !== "NO" || answers.perishable !== "NO" || answers.sealedHygiene === "UNKNOWN" || !answers.sealedHygiene || (answers.sealedHygiene === "YES" && answers.sealOpened !== "NO") || !answers.otherDistanceException || answers.otherDistanceException === "UNKNOWN" || answers.otherDistanceException === "OTHER_EXCEPTION" || answers.otherDistanceException === "SEALED_MEDIA_OR_SOFTWARE_OPENED" || answers.otherDistanceException === "DIGITAL_CONTENT_STARTED_WITH_CONSENT") {
      return result({
        code: "SPECIAL_REVIEW_REQUIRED", status: "NEEDS_MORE_INFORMATION",
        title: "Reikia patikslinti galimą išimtį",
        summary: "Nuotolinės sutarties atsisakymo išimtys priklauso nuo tikslių prekės ir pirkimo aplinkybių. Negalime jų atspėti.",
        nextSteps: ["Patikrinkite prekės rūšį, plombą ir pardavėjo pateiktas sąlygas."],
        sourceIds: ["EU_CRD_WITHDRAWAL", "LT_CIVIL_CODE"], rulesTriggered: ["DISTANCE_B2C", "WITHIN_14_DAYS", "EXCEPTION_UNKNOWN"]
      });
    }
    if (!answers.handlingLevel || answers.handlingLevel === "UNKNOWN") return needMore("Patikslinkite, kaip apžiūrėjote ar naudojote prekę.", ["HANDLING_UNKNOWN"], ["EU_CRD_DIMINISHED_VALUE"]);
    const diminished = answers.handlingLevel === "USED_BEYOND_INSPECTION";
    return result({
      code: "DISTANCE_WITHDRAWAL_LIKELY_AVAILABLE", status: "LIKELY_ELIGIBLE",
      title: diminished ? "Prekę vis tiek gali būti įmanoma grąžinti, tačiau gali kilti klausimas dėl jos vertės sumažėjimo" : "Pagal pateiktą informaciją jums greičiausiai taikoma teisė atsisakyti nuotolinės sutarties",
      summary: "Įprasta nuotolinės sutarties atsisakymo tvarka gali būti taikoma pagal jūsų atsakymus.",
      reasons: ["Pirkote nuotoliniu būdu.", "Prekę gavote per įprastą 14 dienų laikotarpį.", "Atsakymai nenustatė taikomos išimties."],
      nextSteps: ["Informuokite pardavėją apie sprendimą atsisakyti sutarties iki termino pabaigos.", "Išsaugokite įrodymą, kada pranešimą išsiuntėte.", "Grąžinkite prekę pagal pardavėjo pateiktą procesą.", "Išsaugokite siuntimo dokumentus."],
      warnings: diminished ? ["POSSIBLE_DIMINISHED_VALUE: naudojimas daugiau, nei būtina apžiūrai, gali lemti atsakomybę už sumažėjusią prekės vertę."] : [],
      sourceIds: ["EU_CRD_WITHDRAWAL", "LT_CIVIL_CODE", "EU_CRD_DIMINISHED_VALUE"],
      rulesTriggered: ["DISTANCE_B2C", "WITHIN_14_DAYS", "NO_EXCEPTION_FOUND", ...(diminished ? ["POSSIBLE_DIMINISHED_VALUE"] : [])]
    });
  }
  return needMore("Pasirinkite, kaip pirkote prekę.", ["PURCHASE_CHANNEL_MISSING"], ["VVTAT_14_DAY_MYTHS"]);
}
