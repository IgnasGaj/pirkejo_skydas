import type { LegalSourceId } from "@/features/returns/domain/types";

export interface LegalSource {
  id: LegalSourceId;
  authority: "VVTAT" | "E_SEIMAS" | "E_TAR" | "EUR_LEX";
  title: string;
  url: string;
  lastVerifiedAt: string;
  notes?: string;
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
  EU_CRD_DIMINISHED_VALUE: { id: "EU_CRD_DIMINISHED_VALUE", authority: "EUR_LEX", title: "ES vartotojų teisių direktyva: prekės vertės sumažėjimas", url: "https://eur-lex.europa.eu/legal-content/LT/TXT/?uri=CELEX:32011L0083", lastVerifiedAt: "2026-09-30" },
  VVTAT_GUARANTEES: { id: "VVTAT_GUARANTEES", authority: "VVTAT", title: "VVTAT: vartotojų teisės ir garantijos", url: "https://vvtat.lrv.lt/lt/veiklos-sritys-54/ne-maisto-produktai-55/vartotoju-teises-ir-garantijos-714/", lastVerifiedAt: "2026-10-01", notes: "Civilinio kodekso 6.364 ir 6.364¹ straipsniai" },
  VVTAT_CLAIMS: { id: "VVTAT_CLAIMS", authority: "VVTAT", title: "VVTAT: kaip pateikti prašymą", url: "https://vvtat.lrv.lt/lt/kaip-pateikti-prasyma/", lastVerifiedAt: "2026-10-01", notes: "Vartotojų teisių apsaugos įstatymo 21 straipsnis" },
  VVTAT_RIGHT_TO_REPAIR: { id: "VVTAT_RIGHT_TO_REPAIR", authority: "VVTAT", title: "VVTAT: teisė į taisymą", url: "https://vvtat.lrv.lt/lt/teise-i-taisyma/", lastVerifiedAt: "2026-10-01" },
  EU_SALE_OF_GOODS: { id: "EU_SALE_OF_GOODS", authority: "EUR_LEX", title: "ES prekių pardavimo direktyva 2019/771", url: "https://eur-lex.europa.eu/eli/dir/2019/771/oj?eliuri=eli%3Adir%3A2019%3A771%3Aoj", lastVerifiedAt: "2026-10-01", notes: "10–14 ir 17 straipsniai; taikyti kartu su Lietuvos įgyvendinimu" },
  EU_RIGHT_TO_REPAIR: { id: "EU_RIGHT_TO_REPAIR", authority: "EUR_LEX", title: "ES teisės į taisymą direktyva 2024/1799", url: "https://eur-lex.europa.eu/eli/dir/2024/1799", lastVerifiedAt: "2026-10-01", notes: "5 ir 16 straipsniai, II priedas" },
  LT_CONSUMER_RIGHTS_ACT: { id: "LT_CONSUMER_RIGHTS_ACT", authority: "E_SEIMAS", title: "Vartotojų teisių apsaugos įstatymas", url: "https://e-seimas.lrs.lt/portal/legalAct/lt/TAD/TAIS.6020", lastVerifiedAt: "2026-10-01", notes: "21 straipsnis; kartu su VVTAT praktiniu paaiškinimu" }
};
