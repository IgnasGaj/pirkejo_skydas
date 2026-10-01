# Sprint 01.1 legal classification review

Reviewed 2026-10-01. This document describes the rules encoded in the deterministic Sprint 01 return engine. A consumer-facing category is not itself proof of a statutory goods group. The engine records a separate physical-store legal classification and its official source IDs. Physical-store categories do not feed the distance-sale exception logic.

## A. Verified and encoded classifications

These rows describe **tinkamos kokybės** goods bought in a physical store, within the ordinary return period. `SELLER_CONSENT_REQUIRED` means the statutory change-of-mind request is subject to seller consent; it does not mean return is forbidden.

| User answer / clarification | Encoded class | Direct official support |
| --- | --- | --- |
| Adult outer clothing or footwear, expressly excluding baby clothes and underwear | `STANDARD` | [Retail rules](https://e-seimas.lrs.lt/rs/actualedition/TAIS.137498/), especially the exhaustive point 17 list; [VVTAT's current 14-day guidance](https://vvtat.lrv.lt/lt/naujienos-ir-pranesimai-ziniasklaidai-377/mitai-apie-14-dienu-prekiu-grazinimo-teise-Qxg/) uses trousers and footwear as ordinary return examples. |
| Mobile phone | `SELLER_CONSENT_REQUIRED` | [Retail rules, point 17.14](https://e-seimas.lrs.lt/rs/actualedition/TAIS.137498/) and [VVTAT's phone-specific guidance](https://vvtat.lrv.lt/lt/naujienos-ir-pranesimai-ziniasklaidai-377/perkate-mobiluji-telefona-gerai-ivertinkite-savo-ir-savo-artimuju-poreikius-217/). |
| Perfume, cosmetic or toilet preparation | `SELLER_CONSENT_REQUIRED` | [Retail rules, point 17.2, KN 3303–3307](https://e-seimas.lrs.lt/rs/actualedition/TAIS.137498/). This does not classify every product called a “hygiene item.” |
| Underwear | `SELLER_CONSENT_REQUIRED` | [Retail rules, points 17.7, 17.9–17.11](https://e-seimas.lrs.lt/rs/actualedition/TAIS.137498/); [VVTAT's current guidance](https://vvtat.lrv.lt/lt/naujienos-ir-pranesimai-ziniasklaidai-377/mitai-apie-14-dienu-prekiu-grazinimo-teise-Qxg/) also names underwear. |
| Furniture | `SELLER_CONSENT_REQUIRED` | [Retail rules, point 17.21, KN 9401–9406](https://e-seimas.lrs.lt/rs/actualedition/TAIS.137498/). |
| Printed book | `SELLER_CONSENT_REQUIRED` | [Retail rules, point 17.4, KN 4901–4911](https://e-seimas.lrs.lt/rs/actualedition/TAIS.137498/). |
| Children's toy or board game | `SELLER_CONSENT_REQUIRED` | [Retail rules, point 17.22, KN 9503–9505 and 9508](https://e-seimas.lrs.lt/rs/actualedition/TAIS.137498/). |
| Ordinary inflatable sports ball | `STANDARD` | [Retail rules, point 17.22](https://e-seimas.lrs.lt/rs/actualedition/TAIS.137498/) expressly excludes sports equipment from its toy/game exception; [EU Combined Nomenclature](https://eur-lex.europa.eu/legal-content/LT/TXT/PDF/?uri=CELLAR:770bbae3-306d-11ee-9e98-01aa75ed71a1) places inflatable balls under 9506 62, outside the point 17.22 ranges. The selector is intentionally limited to this plain product type. |
| Precious-metal jewellery | `SELLER_CONSENT_REQUIRED` | [Retail rules, point 17.12, KN 7101–7116 and 7118](https://e-seimas.lrs.lt/rs/actualedition/TAIS.137498/), which expressly excludes imitation jewellery. |
| Medical/optical instrument or apparatus with a **documented** KN code in 9001–9033 | `SELLER_CONSENT_REQUIRED` | [Retail rules, point 17.17](https://e-seimas.lrs.lt/rs/actualedition/TAIS.137498/). The user must have the code in product documentation; a generic “medical device” label is insufficient. |

## B. Intentionally `CATEGORY_REVIEW_REQUIRED`

- Broad electronics/electrotechnics without identification as a mobile phone.
- Broad cosmetics/hygiene without confirmation that the item is a perfume, cosmetic or toilet preparation under point 17.2.
- Broad medical device/aid without a documented KN 9001–9033 code.
- Broad toys/games without a precise toy, board game, or ordinary inflatable sports ball identification.
- Broad clothing/footwear without the narrower adult outer-clothing-or-footwear answer; other clothing can overlap point 17 exceptions.
- Broad books without confirmation that the item is a printed book.
- Jewellery without confirmation that it is a precious-metal item; imitation jewellery is expressly excluded from point 17.12.
- `OTHER`, `UNKNOWN`, “other type / cannot determine,” and a subtype that conflicts with the selected category.

In these cases the result explains that the exact product type must be established before giving a reliable physical-store conclusion. The engine does not infer a legal class from a broad label.

## C. Intentionally `SPECIAL_REVIEW_REQUIRED`

Distance purchases are assessed under the separate withdrawal exceptions, not retail-rule point 17. The questionnaire routes `OTHER_EXCEPTION`, potentially opened sealed media/software, potentially consented digital content, unknown exception facts, and an ordinary 14-day period that appears expired to special review. Those situations need facts the MVP does not collect, including statutory consent/information conditions or possible extended deadlines.

The sealed-hygiene exception is applied only when the answer states **both** that the item was sealed and cannot be properly returned after opening for health/hygiene reasons **and** that its protective seal was opened. A broad cosmetics/hygiene category never triggers that exception by itself. An intact seal does not trigger it. This follows [Directive 2011/83/EU, article 16(e)](https://eur-lex.europa.eu/legal-content/LT/TXT/?uri=CELEX:32011L0083) and the [VVTAT guidance](https://vvtat.lrv.lt/lt/naujienos-ir-pranesimai-ziniasklaidai-377/mitai-apie-14-dienu-prekiu-grazinimo-teise-Qxg/).

## D. Official sources used

The application source registry is [`src/legal/sources.ts`](../src/legal/sources.ts). The classification-specific IDs are `LT_RETAIL_RULES`, `VVTAT_14_DAY_MYTHS`, `VVTAT_MOBILE_PHONE`, and `EU_CN_SPORTS_BALL`. Distance exceptions retain `EU_CRD_WITHDRAWAL` and `LT_CIVIL_CODE`. Every definitive physical classification supplies at least one official source ID; unresolved classifications carry no claim that a narrower class has been verified.

Before a future expansion to more product subtypes, confirm the actual item and, where the legal group is tariff-code-based, the applicable KN code. Do not widen a subtype merely because its consumer label sounds similar to the statute.
