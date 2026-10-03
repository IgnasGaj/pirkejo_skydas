export const complaintSourceVersion = "2026-10-03";
export const complaintSources = {
  secondaryRemedyClarification: {
    title: "VVTAT vartotojų teisės ir garantijos; Direktyva (ES) 2019/771",
    url: "https://vvtat.lrv.lt/lt/veiklos-sritys-54/ne-maisto-produktai-55/vartotoju-teises-ir-garantijos-714/",
    supportingUrl: "https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=CELEX:02019L0771-20260731",
    sections: "CK 6.364¹ ir 6.364³ paaiškinimas; direktyvos 13 straipsnio 4–5 dalys",
    verifiedAt: "2026-10-03", effectiveFrom: "2026-07-31", effectiveTo: null,
    rule: "Esant patvirtintam antrinio reikalavimo pagrindui, nedidelis trūkumas savaime neužkerta kelio proporcingam kainos sumažinimui; nedidelio trūkumo išimtis taikoma sutarties nutraukimui, o jo mažumą įrodo pardavėjas."
  },
  defectRemedies: {
    title: "Lietuvos Respublikos civilinis kodeksas (suvestinė redakcija)",
    url: "https://www.e-tar.lt/rs/actualedition/TAR.8A39C83848CB/eMNCPopNFw/format/ISO_PDF/",
    sections: "6.364, 6.364¹ 1–5 dalys, 6.364², 6.364³",
    verifiedAt: "2026-10-02", effectiveFrom: "2026-09-27", effectiveTo: "2026-12-08",
    rule: "Pirmaeiliai taisymo arba keitimo reikalavimai; sąlyginis proporcingas kainos sumažinimas arba sutarties nutraukimas."
  },
  withdrawal: {
    title: "Lietuvos Respublikos civilinis kodeksas (suvestinė redakcija)",
    url: "https://www.e-tar.lt/rs/actualedition/TAR.8A39C83848CB/eMNCPopNFw/format/ISO_PDF/",
    sections: "6.228¹⁰ 1–8 dalys; 6.228¹¹ 1–8 dalys",
    verifiedAt: "2026-10-02", effectiveFrom: "2026-09-27", effectiveTo: "2026-12-08",
    rule: "Kvalifikuotos nuotolinės prekės sutarties galima atsisakyti aiškiu pareiškimu, paprastai per 14 dienų nuo gavimo, su išimtimis."
  },
  physical: {
    title: "Lietuvos Respublikos civilinis kodeksas (suvestinė redakcija)",
    url: "https://www.e-tar.lt/rs/actualedition/TAR.8A39C83848CB/eMNCPopNFw/format/ISO_PDF/",
    sections: "6.362 1–4 dalys",
    verifiedAt: "2026-10-02", effectiveFrom: "2026-09-27", effectiveTo: "2026-12-08",
    rule: "Įprastas kokybiškos ne maisto prekės keitimas per 14 dienų; pinigų grąžinimas tik kai nėra tinkamo pakeitimo."
  },
  retailExceptions: {
    title: "Mažmeninės prekybos taisyklės (suvestinė redakcija)",
    url: "https://www.e-tar.lt/rs/actualedition/TAR.5810831B52F5/pVvOYwHJGJ/format/ISO_PDF/",
    sections: "17 punktas; 20.1 papunktis",
    verifiedAt: "2026-10-02", effectiveFrom: "2024-01-11", effectiveTo: null,
    rule: "17 punkto prekėms keitimas arba grąžinimas priklauso nuo pardavėjo sutikimo."
  },
  sellerRequest: {
    title: "Lietuvos Respublikos vartotojų teisių apsaugos įstatymas (suvestinė redakcija)",
    url: "https://www.e-tar.lt/rs/actualedition/TAR.D790096B17EE/gjHLCcpfdw/format/ISO_PDF/",
    sections: "21 straipsnio 1–3 dalys",
    verifiedAt: "2026-10-02", effectiveFrom: "2026-07-31", effectiveTo: null,
    rule: "Rašytinis kreipimasis su reikalavimu; nesutinkant pardavėjas pateikia motyvuotą atsakymą per 14 dienų nuo gavimo, išskyrus kitokias normas."
  }
} as const;
