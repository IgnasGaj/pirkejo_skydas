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
  LT_CIVIL_CODE: { id: "LT_CIVIL_CODE", authority: "E_TAR", title: "Lietuvos Respublikos civilinis kodeksas", url: "https://www.e-tar.lt/rs/actualedition/TAR.8A39C83848CB/eMNCPopNFw/format/ISO_PDF/", lastVerifiedAt: "2026-10-04", notes: "1.118, 1.121 ir 1.122 straipsniai; suvestinė redakcija 2026-09-27–2026-12-08" },
  EU_CRD_WITHDRAWAL: { id: "EU_CRD_WITHDRAWAL", authority: "EUR_LEX", title: "ES vartotojų teisių direktyva: atsisakymas ir išimtys", url: "https://eur-lex.europa.eu/legal-content/LT/TXT/?uri=CELEX:32011L0083", lastVerifiedAt: "2026-09-30" },
  EU_CRD_DIMINISHED_VALUE: { id: "EU_CRD_DIMINISHED_VALUE", authority: "EUR_LEX", title: "ES vartotojų teisių direktyva: prekės vertės sumažėjimas", url: "https://eur-lex.europa.eu/legal-content/LT/TXT/?uri=CELEX:32011L0083", lastVerifiedAt: "2026-09-30" },
  VVTAT_GUARANTEES: { id: "VVTAT_GUARANTEES", authority: "VVTAT", title: "VVTAT: vartotojų teisės ir garantijos", url: "https://vvtat.lrv.lt/lt/veiklos-sritys-54/ne-maisto-produktai-55/vartotoju-teises-ir-garantijos-714/", lastVerifiedAt: "2026-10-01", notes: "Civilinio kodekso 6.364 ir 6.364¹ straipsniai" },
  VVTAT_CLAIMS: { id: "VVTAT_CLAIMS", authority: "VVTAT", title: "VVTAT: kaip pateikti prašymą", url: "https://vvtat.lrv.lt/lt/kaip-pateikti-prasyma/", lastVerifiedAt: "2026-10-04", notes: "Vartotojų teisių apsaugos įstatymo 21 straipsnis; skaičiavimo pradžia nuo gavimo" },
  VVTAT_RIGHT_TO_REPAIR: { id: "VVTAT_RIGHT_TO_REPAIR", authority: "VVTAT", title: "VVTAT: teisė į taisymą", url: "https://vvtat.lrv.lt/lt/teise-i-taisyma/", lastVerifiedAt: "2026-10-01" },
  EU_SALE_OF_GOODS: { id: "EU_SALE_OF_GOODS", authority: "EUR_LEX", title: "ES prekių pardavimo direktyva 2019/771", url: "https://eur-lex.europa.eu/eli/dir/2019/771/oj?eliuri=eli%3Adir%3A2019%3A771%3Aoj", lastVerifiedAt: "2026-10-01", notes: "10–14 ir 17 straipsniai; taikyti kartu su Lietuvos įgyvendinimu" },
  EU_RIGHT_TO_REPAIR: { id: "EU_RIGHT_TO_REPAIR", authority: "EUR_LEX", title: "ES teisės į taisymą direktyva 2024/1799", url: "https://eur-lex.europa.eu/eli/dir/2024/1799", lastVerifiedAt: "2026-10-01", notes: "5 ir 16 straipsniai, II priedas" },
  LT_CONSUMER_RIGHTS_ACT: { id: "LT_CONSUMER_RIGHTS_ACT", authority: "E_TAR", title: "Vartotojų teisių apsaugos įstatymas", url: "https://www.e-tar.lt/rs/actualedition/TAR.D790096B17EE/gjHLCcpfdw/format/ISO_PDF/", lastVerifiedAt: "2026-10-04", notes: "21 straipsnio 1–3 dalys; suvestinė redakcija nuo 2026-07-31" }
};

export const caseTrackingSources = {
  sellerResponse: { url: "https://www.e-tar.lt/rs/actualedition/TAR.D790096B17EE/gjHLCcpfdw/format/ISO_PDF/", sections: "Vartotojų teisių apsaugos įstatymo 21 straipsnio 1–3 dalys", effectiveFrom: "2026-07-31", effectiveTo: null, verifiedAt: "2026-10-04" },
  civilTerm: { url: "https://www.e-tar.lt/rs/actualedition/TAR.8A39C83848CB/eMNCPopNFw/format/ISO_PDF/", sections: "Civilinio kodekso 1.118, 1.121 ir 1.122 straipsniai", effectiveFrom: "2026-09-27", effectiveTo: "2026-12-08", verifiedAt: "2026-10-04" },
  holidays: { url: "https://www.e-tar.lt/rs/actualedition/f6d686707e7011e6b969d7ae07280e89/jlrUauipfr/format/ISO_PDF/", sections: "Darbo kodekso 123 straipsnio 1 dalis", effectiveFrom: "2026-06-07", effectiveTo: "2026-10-31", verifiedAt: "2026-10-04" },
  guidance: { url: "https://vvtat.lrv.lt/lt/kaip-pateikti-prasyma/", sections: "Pirmiausia raštu kreipkitės į pardavėją", effectiveFrom: null, effectiveTo: null, verifiedAt: "2026-10-04" }
} as const;
