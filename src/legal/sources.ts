import type { LegalSourceId } from "@/features/returns/domain/types";

export interface LegalSource {
  id: LegalSourceId;
  authority: "VVTAT" | "E_SEIMAS" | "EUR_LEX";
  title: string;
  url: string;
  lastVerifiedAt: string;
}

export const legalSources: Record<LegalSourceId, LegalSource> = {
  VVTAT_14_DAY_MYTHS: { id: "VVTAT_14_DAY_MYTHS", authority: "VVTAT", title: "VVTAT: mitai apie 14 dienų grąžinimo teisę", url: "https://vvtat.lrv.lt/lt/naujienos-ir-pranesimai-ziniasklaidai-377/mitai-apie-14-dienu-prekiu-grazinimo-teise-Qxg/", lastVerifiedAt: "2026-10-01" },
  VVTAT_MOBILE_PHONE: { id: "VVTAT_MOBILE_PHONE", authority: "VVTAT", title: "VVTAT: mobiliojo telefono grąžinimas", url: "https://vvtat.lrv.lt/lt/naujienos-ir-pranesimai-ziniasklaidai-377/perkate-mobiluji-telefona-gerai-ivertinkite-savo-ir-savo-artimuju-poreikius-217/", lastVerifiedAt: "2026-10-01" },
  EU_CN_SPORTS_BALL: { id: "EU_CN_SPORTS_BALL", authority: "EUR_LEX", title: "ES Kombinuotoji nomenklatūra: pripučiami sporto kamuoliai (9506 62)", url: "https://eur-lex.europa.eu/legal-content/LT/TXT/PDF/?uri=CELLAR:770bbae3-306d-11ee-9e98-01aa75ed71a1", lastVerifiedAt: "2026-10-01" },
  VVTAT_FAQ: { id: "VVTAT_FAQ", authority: "VVTAT", title: "VVTAT: dažniausiai užduodami klausimai", url: "https://vvtat.lrv.lt/lt/DUK/", lastVerifiedAt: "2026-09-30" },
  VVTAT_PURCHASE_DOCUMENT: { id: "VVTAT_PURCHASE_DOCUMENT", authority: "VVTAT", title: "VVTAT: pirkimo dokumentas", url: "https://vvtat.lrv.lt/lt/naujienos-ir-pranesimai-ziniasklaidai-377/pirkimo-dokumentas-kodel-ji-svarbu-tureti/", lastVerifiedAt: "2026-09-30" },
  LT_RETAIL_RULES: { id: "LT_RETAIL_RULES", authority: "E_SEIMAS", title: "Mažmeninės prekybos taisyklės", url: "https://e-seimas.lrs.lt/rs/actualedition/TAIS.137498/", lastVerifiedAt: "2026-10-01" },
  LT_CIVIL_CODE: { id: "LT_CIVIL_CODE", authority: "E_SEIMAS", title: "Lietuvos Respublikos civilinis kodeksas", url: "https://e-seimas.lrs.lt/portal/legalAct/lt/TAD/TAIS.107687", lastVerifiedAt: "2026-09-30" },
  EU_CRD_WITHDRAWAL: { id: "EU_CRD_WITHDRAWAL", authority: "EUR_LEX", title: "ES vartotojų teisių direktyva: atsisakymas ir išimtys", url: "https://eur-lex.europa.eu/legal-content/LT/TXT/?uri=CELEX:32011L0083", lastVerifiedAt: "2026-09-30" },
  EU_CRD_DIMINISHED_VALUE: { id: "EU_CRD_DIMINISHED_VALUE", authority: "EUR_LEX", title: "ES vartotojų teisių direktyva: prekės vertės sumažėjimas", url: "https://eur-lex.europa.eu/legal-content/LT/TXT/?uri=CELEX:32011L0083", lastVerifiedAt: "2026-09-30" }
};
