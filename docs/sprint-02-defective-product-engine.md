# PIRKĖJO SKYDAS — SPRINT 02

## Defective Product Decision Engine

Build the second functional vertical slice of **Pirkėjo Skydas**:

# „PREKĖ SUGEDO“

This sprint adds a deterministic Lithuanian consumer-rights flow for a consumer who bought a product from a professional seller and the product is defective, non-conforming, or has failed during use.

Sprint 02 must build on Sprint 01 and Sprint 01.1. Do not replace or weaken the existing return engine.

The application will eventually help Lithuanian consumers:

- store purchases and receipts;
- understand return and statutory-guarantee procedures;
- understand what to do when a product is defective;
- generate complaints;
- track seller deadlines;
- preserve evidence;
- prepare information for VVTAT / VTIS disputes.

For this sprint, build only the defective-product workflow and the supporting legal decision engine.

---

# 1. NON-NEGOTIABLE PRODUCT LANGUAGE RULE

The project is for the Lithuanian market.

**All user-facing product language MUST be Lithuanian.**

This includes:

- navigation;
- buttons;
- questions;
- answers;
- validation messages;
- result titles;
- explanations;
- warnings;
- legal-source labels;
- empty states;
- mobile copy.

Code may remain English:

- variable names;
- interfaces;
- types;
- filenames;
- tests;
- developer comments;
- internal documentation.

Do not accidentally introduce English UI copy.

Tone:

- simple;
- calm;
- practical;
- friendly;
- not overly legal;
- explain legal concepts in plain Lithuanian;
- do not sound like a lawyer or promise a legal outcome.

Use wording such as:

> „Pagal pateiktą informaciją...“

> „Gali būti taikoma...“

> „Pirmiausia verta...“

Avoid absolute statements such as:

> „Jūs tikrai laimėsite ginčą.“

> „Pardavėjas privalo grąžinti pinigus dabar.“

unless the underlying rule is genuinely unconditional.

---

# 2. EXISTING PROJECT MUST BE PRESERVED

Sprint 01 and Sprint 01.1 are already completed work.

Before making changes:

1. inspect the existing repository and working tree;
2. understand the existing `/returns` flow;
3. inspect shared decision-result types and legal-source metadata;
4. reuse existing components and patterns where sensible;
5. run the existing test suite before modifying code.

Do NOT rewrite Sprint 01 from scratch.

Do NOT remove legal hardening already added in Sprint 01.1.

All existing Sprint 01 tests must continue to pass.

The existing `DEFECT_FLOW_REQUIRED` result must now link into the new defective-product flow instead of leading to a dead-end placeholder.

---

# 3. TECH STACK

Continue using the existing project stack:

- Next.js;
- App Router;
- TypeScript;
- React;
- Tailwind CSS;
- shadcn/ui;
- Zod;
- Vitest.

Do NOT add a database in this sprint.

Do NOT add Supabase yet.

Do NOT add authentication.

Do NOT add receipt storage yet.

Do NOT add OCR.

Do NOT add an LLM.

Do NOT add complaint generation yet.

Use local/in-memory wizard state only.

The legal rule engine must remain independent of React.

---

# 4. SPRINT GOAL

The user should be able to answer a short sequence of ordinary questions and receive a structured result explaining:

1. whether the situation appears to fall within Lithuanian B2C defective-goods rules;
2. whether the normal statutory seller-liability period appears active;
3. whether repair/replacement is the normal first remedy;
4. whether price reduction or contract termination may already be available;
5. whether the seller's 14-calendar-day written-response period is still running or appears expired;
6. whether VVTAT escalation may now be appropriate;
7. whether the 2026 right-to-repair changes may affect the case;
8. what evidence to preserve;
9. what the user should do next.

The flow must correct common misconceptions, especially:

- „Sugedo po metų, todėl turi iškart duoti naują.“ — not automatically.
- „Sugedo, todėl turi iškart grąžinti pinigus.“ — not automatically.
- „14 dienų reiškia, kad prekė turi būti sutaisyta per 14 dienų.“ — false; the 14-day rule in this workflow concerns the seller's response to the written consumer claim, while repair/replacement is generally subject to a reasonable-time / no-significant-inconvenience standard.
- „Jei neturiu popierinio čekio, neturiu teisių.“ — too simplistic.
- „Gamintojo 12 mėnesių garantija panaikina įstatyminę garantiją.“ — false.

---

# 5. ROUTE AND ENTRY POINTS

Create the route:

`/defective-product`

Update the landing/dashboard action:

**Prekė sugedo**

It must no longer be disabled.

Clicking it opens `/defective-product`.

Update the Sprint 01 result `DEFECT_FLOW_REQUIRED`:

CTA:

**Tęsti sugedusios prekės patikrą**

This CTA must navigate to `/defective-product`.

Do not duplicate the whole application shell.

---

# 6. WIZARD UX

Use the same product language and visual system as Sprint 01.

Mobile-first.

Prefer one meaningful question per screen.

Required behavior:

- progress indicator;
- Back button;
- previous answers preserved;
- no legal evaluation inside React components;
- no network requests required for a decision;
- deterministic results;
- accessible buttons and form controls.

Do not force every branch to have the same number of questions.

Branch only when a question is legally or procedurally relevant.

---

# 7. SUPPORTED SCOPE

Sprint 02 handles primarily:

- a natural person acting as a consumer;
- purchase from a professional seller/business;
- tangible goods;
- defective / non-conforming goods;
- new goods;
- used goods, with conservative handling of a potentially shortened agreed liability period;
- statutory guarantee / seller-liability workflow;
- seller complaint status;
- selected 2026 right-to-repair implications.

Sprint 02 does NOT attempt to fully decide:

- B2B purchases;
- private-to-private purchases;
- pure services;
- pure digital-content or digital-service disputes;
- product safety recalls;
- injury / damages claims;
- complex causation disputes;
- whether a defect is legally "minor" or "serious" based only on a consumer label;
- technical expert conclusions;
- cross-border jurisdiction;
- marketplace responsibility where the contractual seller is unclear.

Unsupported or unclear cases must return an uncertainty / redirect result, never a guessed legal conclusion.

---

# 8. QUESTION — WHO BOUGHT IT?

Lithuanian:

## Kas įsigijo prekę?

Options:

- Aš kaip privatus asmuo
- Įmonė / individuali veikla verslo tikslais

Internal:

```ts
type BuyerType = "CONSUMER" | "BUSINESS";
```

If `BUSINESS`:

Result:

`NOT_CONSUMER_PURCHASE`

UI:

## Ši situacija nepatenka į įprastą vartotojų teisių apsaugą

Pirkėjo Skydas šiuo metu skirtas fizinių asmenų pirkiniams, įsigytiems asmeniniams, o ne verslo poreikiams.

Do not apply B2C defective-goods rules automatically.

---

# 9. QUESTION — WHO SOLD IT?

## Iš ko pirkote?

Options:

- Parduotuvės / įmonės
- Privataus žmogaus
- Nežinau

Internal:

```ts
type SellerType = "PROFESSIONAL" | "PRIVATE" | "UNKNOWN";
```

If private seller:

`PRIVATE_SELLER`

Message:

## Šiam pirkimui gali būti taikomos kitos taisyklės

Pirkėjo Skydas šiuo metu automatiškai vertina vartotojo pirkinius iš verslininkų. Pirkimams iš privataus asmens įprastos vartotojų apsaugos taisyklės nėra taikomos taip pat.

If unknown:

`SELLER_STATUS_REVIEW_REQUIRED`

Do not guess.

---

# 10. QUESTION — WHAT KIND OF TRANSACTION?

## Dėl ko kilo problema?

Options:

- Fizinė prekė
- Skaitmeninis turinys / skaitmeninė paslauga
- Paslauga
- Nežinau

Internal:

```ts
type TransactionKind =
  | "GOODS"
  | "DIGITAL_CONTENT_OR_SERVICE"
  | "SERVICE"
  | "UNKNOWN";
```

Only `GOODS` continues through this engine.

Other answers:

`UNSUPPORTED_TRANSACTION_TYPE`

Explain that this sprint evaluates defective physical goods and that other consumer-contract rules may differ.

---

# 11. QUESTION — NEW OR USED GOODS?

## Ar prekė buvo nauja ar naudota?

Options:

- Nauja
- Naudota
- Nežinau

Internal:

```ts
type GoodsConditionAtSale = "NEW" | "USED" | "UNKNOWN";
```

For used goods, ask:

## Ar pirkimo metu aiškiai susitarėte dėl trumpesnio pardavėjo atsakomybės termino?

Options:

- Taip
- Ne
- Nežinau

If YES, collect the agreed period if the user knows it.

```ts
interface UsedGoodsLiabilityAgreement {
  hasShortenedTerm: boolean | null;
  months?: number;
}
```

Important legal engineering rule:

Do NOT assume every used product has only a one-year statutory period.

The default statutory seller-liability period is generally two years, while for used goods the seller and consumer may agree a shorter period, but not shorter than one year.

If the term is unknown and the answer affects the outcome:

`USED_GOODS_TERM_REVIEW_REQUIRED`

Do not guess.

---

# 12. QUESTION — DELIVERY / RECEIPT DATE

## Kada gavote prekę?

Use the date the goods were delivered / handed over, not merely the order date.

Internal:

```ts
interface RelevantDates {
  deliveredAt: string;
  asOfDate: string;
}
```

Use an explicit `asOfDate` in the domain input so tests never depend on the computer clock.

Validate:

- invalid date;
- future delivery date;
- impossible sequence.

Create a dedicated tested date helper.

Do not scatter date arithmetic through components.

---

# 13. STATUTORY SELLER-LIABILITY PERIOD

For ordinary new goods, the seller is generally responsible for non-conformity existing at delivery and becoming apparent within two years from delivery.

Use safe product language:

> „garantija pagal įstatymą“

Do not present this as a voluntary manufacturer's warranty.

If the normal statutory period appears active, continue.

If the normal period appears expired, do NOT immediately terminate the flow.

Instead check:

1. used-goods agreed term if relevant;
2. whether a longer commercial guarantee may still apply;
3. whether post-guarantee right-to-repair rules may be relevant.

Possible result:

`STATUTORY_LIABILITY_PERIOD_APPEARS_EXPIRED`

Message:

## Įprastas garantijos pagal įstatymą laikotarpis, panašu, jau pasibaigė

Tai savaime nereiškia, kad nebeturite jokių galimybių. Gali būti aktuali ilgesnė komercinė garantija arba tam tikroms prekėms taikoma teisė į taisymą.

---

# 14. FIRST-YEAR EVIDENTIARY PRESUMPTION

The engine must distinguish between:

- a defect becoming apparent within the first year after delivery;
- a defect becoming apparent later.

Ask when needed:

## Kada pirmą kartą pastebėjote trūkumą?

Internal:

```ts
type DefectTimingClass =
  | "WITHIN_FIRST_YEAR"
  | "AFTER_FIRST_YEAR"
  | "UNKNOWN";
```

Do not turn this into a simplistic eligibility gate.

If within the first year, the result may explain that the defect is generally presumed to have existed at delivery unless incompatible with the nature of the goods or defect.

If later, do not say the consumer has no rights.

Instead include a warning that proof about the origin/existence of the defect may become more important.

Do NOT require the consumer to self-prove technical causation in the wizard.

---

# 15. QUESTION — WHAT HAPPENED?

## Kaip atsirado problema?

Options:

- Prekė sugedo arba trūkumas atsirado įprastai naudojant
- Problema atsirado po smūgio, skysčio, kritimo ar kito įvykio
- Nežinau

Internal:

```ts
type ApparentCause =
  | "NORMAL_USE_OR_UNKNOWN_DEFECT"
  | "ACCIDENT_OR_EXTERNAL_DAMAGE"
  | "UNKNOWN";
```

Important:

The app is not a technical expert.

If the user reports obvious accidental/external damage:

`CAUSE_REVIEW_REQUIRED`

Explain that statutory defect remedies generally concern lack of conformity for which the seller is responsible, while accidental damage may require a different assessment, insurance, paid repair, or evidence.

Do not tell the user that rights definitely do or do not exist.

---

# 16. PURCHASE EVIDENCE

Ask:

## Ar turite įrodymą, kad pirkote iš šio pardavėjo?

Options:

- Turiu čekį
- Turiu sąskaitą faktūrą
- Turiu mokėjimo kortele / banko įrašą
- Turiu kitą pirkimą patvirtinantį dokumentą
- Nieko neturiu
- Nežinau

Reuse the Sprint 01 `PurchaseEvidence` type if it already exists.

Never implement:

`NO PAPER RECEIPT = NO RIGHTS`

If evidence is missing:

`PURCHASE_EVIDENCE_MISSING`

Explain that proof of purchase is important and may include more than a paper receipt.

Do not build receipt storage yet.

Optional non-functional note may say:

**Čekių saugojimas bus pridėtas kitame etape.**

Do not create a fake upload flow.

---

# 17. QUESTION — HAS THE SELLER BEEN CONTACTED IN WRITING?

## Ar jau raštu kreipėtės į pardavėją dėl šio trūkumo?

Options:

- Taip
- Ne
- Nežinau / kreipiausi tik žodžiu

Internal:

```ts
type WrittenSellerContact = "YES" | "NO" | "UNCLEAR";
```

If NO:

Return the initial-remedy path.

Result code:

`CONTACT_SELLER_REPAIR_OR_REPLACE`

UI:

# Pirmas žingsnis – raštu kreiptis į pardavėją

Explain:

- describe the defect;
- clearly state the requested remedy;
- preserve a copy / screenshot / email;
- attach available proof of purchase;
- preserve photos/videos or other relevant evidence.

Explain the normal remedy hierarchy:

> Pirmiausia dėl nekokybiškos prekės vartotojas paprastai gali pasirinkti remontą arba pakeitimą, jeigu pasirinktas būdas nėra neįmanomas ar neproporcingas.

Do not generate the complaint yet.

CTA placeholder:

**Paruošti pretenziją — netrukus**

Must be visibly disabled or marked as future functionality.

---

# 18. PRIMARY REMEDIES — REPAIR OR REPLACEMENT

Model explicitly:

```ts
type RequestedRemedy =
  | "REPAIR"
  | "REPLACEMENT"
  | "PRICE_REDUCTION"
  | "TERMINATION_REFUND"
  | "OTHER"
  | "UNKNOWN";
```

Primary legal model:

- repair and replacement are the normal first remedies;
- the consumer may choose between them;
- the chosen remedy may be refused if impossible or disproportionately costly compared with the alternative, considering relevant circumstances.

Do not encode:

`DEFECTIVE = AUTOMATIC REFUND`

Do not encode:

`DEFECTIVE = AUTOMATIC NEW PRODUCT`

If the consumer has not yet given the seller a chance to repair/replace and is asking for immediate refund without facts supporting a secondary remedy:

`PRIMARY_REMEDY_FIRST`

Use safe language:

## Pinigų grąžinimas ne visada yra pirmas žingsnis

Pagal pateiktą informaciją pirmiausia gali būti taikomas prekės remontas arba pakeitimas. Kainos sumažinimas ar sutarties nutraukimas tam tikrais atvejais tampa galimi vėliau arba iš karto esant pakankamai rimtam trūkumui.

Never decide that a defect is legally serious solely because the consumer selected a subjective label.

---

# 19. QUESTION — WHAT DID THE USER REQUEST?

If the user contacted the seller, ask:

## Ko prašėte pardavėjo?

Options:

- Sutaisyti prekę
- Pakeisti prekę
- Sumažinti kainą
- Grąžinti pinigus
- Kita
- Nežinau / aiškiai nenurodžiau

If the user did not clearly state a demand:

`CLAIM_REQUIREMENT_UNCLEAR`

Explain that VVTAT guidance emphasizes clearly stating the requested remedy in the written claim.

Do not say the claim is automatically invalid.

---

# 20. QUESTION — WHEN WAS THE WRITTEN CLAIM RECEIVED?

If written seller contact exists, ask:

## Kada pardavėjas gavo jūsų rašytinį kreipimąsi?

Allow:

- exact date;
- „Nežinau“.

Internal:

```ts
interface SellerClaim {
  receivedAt?: string;
  requestedRemedy: RequestedRemedy;
}
```

Do not use send date when the user explicitly knows a different received date.

---

# 21. 14-DAY RESPONSE RULE

This distinction is critical.

The seller must generally examine the consumer's written claim free of charge and, where the seller does not agree with the consumer's demand, provide a detailed reasoned written response no later than 14 days from receipt, unless another applicable rule provides otherwise.

For product UX, communicate simply:

> „Pardavėjas į rašytinę pretenziją turi atsakyti ne vėliau kaip per 14 kalendorinių dienų.“

But DO NOT create the rule:

`REPAIR_MUST_FINISH_IN_14_DAYS`

The 14-day complaint-response period is NOT a universal statutory repair completion deadline.

Repair/replacement must be performed free of charge, within a reasonable period, and without significant inconvenience to the consumer.

Create a tested helper for the response deadline.

Because the UI works with calendar dates, treat the complaint receipt date carefully and document the date-counting convention in tests.

Do not mark the response overdue until the calculated deadline has actually passed.

---

# 22. QUESTION — SELLER RESPONSE / STATUS

Ask:

## Kas įvyko po kreipimosi?

Options:

- Pardavėjas sutiko remontuoti
- Pardavėjas sutiko pakeisti prekę
- Pardavėjas pasiūlė kitą sprendimą
- Pardavėjas atsisakė tenkinti mano reikalavimą
- Pardavėjas dar neatsakė
- Prekę remontavo, bet problema liko / pasikartojo
- Prekę pakeitė, bet problema atsirado ir pakeistoje prekėje
- Problema išspręsta
- Kita / neaišku

Internal:

```ts
type SellerOutcome =
  | "REPAIR_ACCEPTED"
  | "REPLACEMENT_ACCEPTED"
  | "ALTERNATIVE_OFFERED"
  | "REFUSED"
  | "NO_RESPONSE"
  | "REPAIR_FAILED_OR_DEFECT_RECURRED"
  | "REPLACEMENT_DEFECTIVE"
  | "RESOLVED"
  | "OTHER_OR_UNKNOWN";
```

---

# 23. SELLER HAS NOT RESPONDED

If `NO_RESPONSE` and the 14-day response deadline has NOT passed:

`SELLER_RESPONSE_PERIOD_RUNNING`

UI:

## Pardavėjo atsakymo terminas dar nepasibaigė

Show the calculated deadline if known.

Explain that this is the response deadline, not necessarily the repair deadline.

If the deadline HAS passed:

`SELLER_RESPONSE_OVERDUE`

UI:

# Pardavėjo atsakymo terminas, panašu, jau pasibaigė

Explain that if the seller did not respond within the applicable period, the consumer may have grounds to proceed to VVTAT / VTIS for out-of-court dispute resolution, assuming the other procedural requirements are met.

CTA:

**Kaip kreiptis į VVTAT**

For Sprint 02 this may open an informational result section with the official VTIS/VVTAT link.

Do not automate the submission yet.

---

# 24. SELLER REFUSED

If the seller refused the user's written demand:

Do not automatically say the seller acted unlawfully.

Evaluate what was requested and where the case is in the remedy hierarchy.

Possible results:

- `SELLER_REFUSAL_REVIEW_REQUIRED`
- `SECONDARY_REMEDIES_MAY_BE_AVAILABLE`
- `VVTAT_ESCALATION_MAY_BE_AVAILABLE`

If the consumer requested repair/replacement and the seller refused to bring the goods into conformity, price reduction or termination may become relevant depending on the facts.

If the consumer requested an immediate refund as the first remedy, do not automatically treat refusal as unlawful; explain the remedy hierarchy.

---

# 25. REPAIR FAILED OR DEFECT RECURRED

If:

- the seller attempted repair; and
- the lack of conformity remains or appears again;

return:

`SECONDARY_REMEDIES_MAY_BE_AVAILABLE`

Explain that a proportionate price reduction or contract termination may become available when the lack of conformity persists despite an attempt to bring the goods into conformity, subject to the facts and the limitation for minor defects.

Do not require an arbitrary fixed number of repair attempts.

Do NOT create:

`THREE_REPAIRS = AUTOMATIC_REFUND`

unless a current official source specifically creates such a rule for the exact case.

---

# 26. PRICE REDUCTION OR CONTRACT TERMINATION

Model secondary-remedy conditions conservatively.

Create structured reasons similar to:

```ts
type SecondaryRemedyGround =
  | "SELLER_DID_NOT_REPAIR_OR_REPLACE"
  | "SELLER_REFUSED_CONFORMITY_REMEDY"
  | "DEFECT_PERSISTS_AFTER_ATTEMPT"
  | "POTENTIALLY_SERIOUS_DEFECT"
  | "SELLER_WILL_NOT_ACT_WITHIN_REASONABLE_TIME"
  | "SIGNIFICANT_INCONVENIENCE"
  | "UNKNOWN";
```

Important:

The app may detect objective procedural facts such as refusal or failed repair.

The app must NOT definitively classify a defect as legally "serious" based only on a user saying "it is serious".

For fact-sensitive cases use:

`SERIOUSNESS_REVIEW_REQUIRED`

Termination limitation:

A consumer is not entitled to terminate the contract if the lack of conformity is only minor; the burden of proving that the lack of conformity is minor lies with the seller.

Do not ask the consumer to make the final legal classification of "minor".

---

# 27. REPAIR / REPLACEMENT MUST BE FREE AND REASONABLE

When repair or replacement is the relevant path, the result may explain that it should generally be:

- free of charge;
- completed within a reasonable period;
- completed without significant inconvenience to the consumer.

Do not invent a universal number of days for repair completion.

If the user reports that the product has been in repair for a long time, this sprint may show:

`REPAIR_DELAY_REVIEW_REQUIRED`

Explain that there is no generic 14-day repair-completion rule in this engine and that the reasonableness of the period depends on the circumstances.

The dedicated "Prekė per ilgai servise" workflow remains future scope.

---

# 28. 2026 RIGHT-TO-REPAIR CHANGE — GUARANTEE EXTENSION

This is mandatory for Sprint 02.

From **2026-07-31**, new Lithuanian/EU right-to-repair rules apply.

For goods purchased from **2026-07-31**, when the consumer chooses repair instead of replacement during the statutory guarantee period, the statutory guarantee period is extended by an additional year according to the current VVTAT guidance.

Model:

```ts
const REPAIR_EXTENSION_EFFECTIVE_DATE = "2026-07-31";

type RepairGuaranteeExtension =
  | "APPLIES"
  | "DOES_NOT_APPLY_BY_PURCHASE_DATE"
  | "NOT_RELEVANT"
  | "UNKNOWN";
```

If:

- goods were purchased/delivered under the post-2026-07-31 regime as legally applicable; and
- repair is selected as the conformity remedy;

include a result info block:

## Pasirinkus remontą gali būti pratęsta garantija pagal įstatymą

Pagal nuo 2026 m. liepos 31 d. taikomas taisykles, atitinkamais atvejais pasirinkus prekės remontą vietoj pakeitimo, garantija pagal įstatymą pratęsiama papildomiems metams.

Do not apply this extension to older purchases when the current official rule says the extension only applies to goods purchased from 2026-07-31.

The extension should be modeled as a legal effect, not as a new commercial warranty.

Do not persist the extension yet; persistence belongs to a later sprint.

---

# 29. POST-GUARANTEE RIGHT TO REPAIR

The 2026 rules also create/expand manufacturer repair obligations for specified repairable product categories.

This is NOT the same as the seller's free two-year statutory guarantee.

Sprint 02 should support a conservative informational branch when the ordinary statutory seller-liability period appears expired.

Ask only when relevant:

## Kokia tai prekė?

Minimum structured categories based on the currently published VVTAT list:

```ts
type RightToRepairProductCategory =
  | "WASHING_MACHINE_OR_WASHER_DRYER"
  | "DISHWASHER"
  | "REFRIGERATION_APPLIANCE"
  | "TELEVISION"
  | "WELDING_EQUIPMENT"
  | "VACUUM_CLEANER"
  | "SERVER_OR_DATA_STORAGE_PRODUCT"
  | "MOBILE_PHONE_CORDLESS_PHONE_OR_TABLET"
  | "TUMBLE_DRYER"
  | "PRODUCT_WITH_LIGHT_MEANS_OF_TRANSPORT_BATTERY"
  | "LOCAL_SPACE_HEATER"
  | "OTHER"
  | "UNKNOWN";
```

Keep the category data in a dedicated structured module with source metadata and `lastVerifiedAt`.

If the product is in a currently covered category:

`POST_GUARANTEE_REPAIR_RIGHT_MAY_APPLY`

UI:

## Šiai prekių kategorijai gali būti taikoma teisė į taisymą

Explain clearly:

- this is separate from the normal free statutory guarantee;
- manufacturer repair obligations apply only to specified product groups and for the periods set by the relevant product rules;
- repair may be chargeable outside the statutory guarantee;
- the category list and detailed repairability rules may change;
- show the official VVTAT source.

Do NOT implement a definitive repair-duration eligibility calculator for each product regulation in Sprint 02.

If exact applicability depends on product-specific regulation:

`RIGHT_TO_REPAIR_REVIEW_REQUIRED`

No guessing.

---

# 30. COMMERCIAL GUARANTEE

If the statutory liability period appears expired, ask:

## Ar turite ilgesnę pardavėjo arba gamintojo suteiktą komercinę garantiją?

Options:

- Taip
- Ne
- Nežinau

If YES:

`COMMERCIAL_GUARANTEE_MAY_APPLY`

Explain that commercial guarantees are additional to statutory rights and may have their own terms.

Do not attempt to interpret arbitrary warranty booklets in Sprint 02.

Do not tell the user that a manufacturer's shorter stated warranty reduces the statutory consumer guarantee.

---

# 31. EVIDENCE CHECKLIST

Every meaningful defective-product result should include a practical evidence section where relevant:

## Ką verta išsaugoti?

Possible items:

- pirkimo dokumentą ar kitą pirkimo įrodymą;
- rašytinę pretenziją pardavėjui;
- įrodymą, kada pardavėjas ją gavo;
- pardavėjo atsakymą;
- prekės nuotraukas ar vaizdo įrašus;
- serviso / diagnostikos dokumentus;
- siuntimo ar prekės perdavimo dokumentus;
- ankstesnio remonto dokumentus.

Do not tell the user every item is always legally mandatory.

Differentiate:

- useful evidence;
- procedural requirement;
- optional supporting material.

---

# 32. VVTAT / VTIS ESCALATION

Where the seller:

- rejects the claim;
- only partially satisfies it; or
- does not respond within the applicable 14-day period;

and the user has first made a written claim,

the result may say that the user can consider submitting the dispute to VVTAT / VTIS.

Use current official-source metadata.

Result code:

`VVTAT_ESCALATION_MAY_BE_AVAILABLE`

UI section:

## Kitas žingsnis gali būti VVTAT

Explain that the consumer should preserve:

- the claim sent to the seller;
- seller's response if received;
- proof of purchase;
- relevant supporting evidence.

Provide official links.

Do not submit anything automatically in this sprint.

---

# 33. RESULT OBJECT

Reuse the existing generic `DecisionResult` model from Sprint 01 if technically sensible.

Do not create a second incompatible result rendering system.

If extension is required, extend carefully.

Target shape:

```ts
interface DecisionResult {
  code: DecisionCode;
  status:
    | "LIKELY_ELIGIBLE"
    | "LIKELY_NOT_ELIGIBLE"
    | "ACTION_REQUIRED"
    | "WAITING"
    | "NEEDS_MORE_INFORMATION"
    | "REDIRECT"
    | "INFORMATION";
  title: string;
  summary: string;
  reasons: DecisionReason[];
  nextSteps: NextStep[];
  warnings: string[];
  sourceIds: LegalSourceId[];
  infoBlocks?: DecisionInfoBlock[];
}
```

Do not generate legal results directly as JSX.

The UI renders a domain result.

---

# 34. DEFECTIVE PRODUCT INPUT MODEL

Create a dedicated domain input similar to:

```ts
interface DefectiveProductCaseInput {
  buyerType: BuyerType;
  sellerType: SellerType;
  transactionKind: TransactionKind;
  goodsConditionAtSale: GoodsConditionAtSale;
  usedGoodsLiabilityAgreement?: UsedGoodsLiabilityAgreement;

  deliveredAt?: string;
  defectDetectedAt?: string;
  asOfDate: string;

  apparentCause?: ApparentCause;
  purchaseEvidence?: PurchaseEvidence;

  writtenSellerContact?: WrittenSellerContact;
  sellerClaim?: SellerClaim;
  sellerOutcome?: SellerOutcome;

  rightToRepairCategory?: RightToRepairProductCategory;
  hasCommercialGuarantee?: boolean | null;
}
```

Use Zod for input validation at the appropriate boundary.

Do not let domain decisions depend on unvalidated arbitrary strings.

---

# 35. RULE ENGINE

Create a pure function similar to:

```ts
evaluateDefectiveProductCase(
  input: DefectiveProductCaseInput
): DecisionResult
```

Requirements:

- no React dependency;
- no network dependency;
- no AI dependency;
- no browser dependency;
- deterministic;
- pure;
- unit-testable;
- explicit `asOfDate`;
- every legal decision path references at least one official source ID.

Suggested structure:

```text
src/
  features/
    defective-product/
      components/
      domain/
        types.ts
        schemas.ts
        rules.ts
        dateRules.ts
        evaluateDefectiveProductCase.ts
        rightToRepairCategories.ts
      content/
        lt.ts
  legal/
    sources.ts
```

Adapt to the existing Sprint 01 structure rather than creating unnecessary duplication.

---

# 36. DECISION CODES

At minimum support:

```ts
type DefectiveProductDecisionCode =
  | "NOT_CONSUMER_PURCHASE"
  | "PRIVATE_SELLER"
  | "SELLER_STATUS_REVIEW_REQUIRED"
  | "UNSUPPORTED_TRANSACTION_TYPE"
  | "USED_GOODS_TERM_REVIEW_REQUIRED"
  | "INVALID_DATE"
  | "STATUTORY_LIABILITY_PERIOD_APPEARS_EXPIRED"
  | "CAUSE_REVIEW_REQUIRED"
  | "PURCHASE_EVIDENCE_MISSING"
  | "CONTACT_SELLER_REPAIR_OR_REPLACE"
  | "PRIMARY_REMEDY_FIRST"
  | "CLAIM_REQUIREMENT_UNCLEAR"
  | "SELLER_RESPONSE_PERIOD_RUNNING"
  | "SELLER_RESPONSE_OVERDUE"
  | "SELLER_REFUSAL_REVIEW_REQUIRED"
  | "SECONDARY_REMEDIES_MAY_BE_AVAILABLE"
  | "SERIOUSNESS_REVIEW_REQUIRED"
  | "REPAIR_DELAY_REVIEW_REQUIRED"
  | "VVTAT_ESCALATION_MAY_BE_AVAILABLE"
  | "COMMERCIAL_GUARANTEE_MAY_APPLY"
  | "POST_GUARANTEE_REPAIR_RIGHT_MAY_APPLY"
  | "RIGHT_TO_REPAIR_REVIEW_REQUIRED"
  | "CASE_RESOLVED";
```

If the existing shared decision-code architecture uses namespacing or feature-specific unions, follow that pattern.

Do not create ambiguous result codes such as `YES` / `NO`.

---

# 37. RULE TRACE / DEVELOPMENT PANEL

Reuse or extend the Sprint 01 development-only rule trace.

Example:

```text
Decision:
SECONDARY_REMEDIES_MAY_BE_AVAILABLE

Rules triggered:
B2C_GOODS
STATUTORY_PERIOD_ACTIVE
WRITTEN_CLAIM_EXISTS
REPAIR_ATTEMPT_FAILED
SECONDARY_REMEDY_GROUND_FOUND

Sources:
VVTAT_CONSUMER_RIGHTS_GUARANTEES
LT_CIVIL_CODE_6_364_1
EU_SALE_OF_GOODS_ART_13
```

Hide in production.

Do not expose internal legal-debug identifiers to ordinary users.

---

# 38. LEGAL SOURCES

Extend the existing structured legal-source registry rather than hardcoding URLs into components.

At minimum include / verify these official sources as of the implementation date:

### VVTAT — Vartotojų teisės ir garantijos

https://vvtat.lrv.lt/lt/veiklos-sritys-54/ne-maisto-produktai-55/vartotoju-teises-ir-garantijos-714/

Covers, among other things:

- repair/replacement as primary remedies;
- price reduction / termination conditions;
- two-year statutory guarantee;
- minor-defect limitation.

### VVTAT — Dažniausiai užduodami klausimai

https://vvtat.lrv.lt/lt/DUK/

Covers, among other things:

- two-year statutory guarantee;
- used-goods shorter agreed period, not below one year;
- first-year burden-of-proof information;
- 14-day claim-response rule.

### VVTAT — Kaip pateikti prašymą?

https://vvtat.lrv.lt/lt/kaip-pateikti-prasyma/

Covers:

- first contacting the seller in writing;
- clearly stating a demand;
- 14-day written-response obligation;
- VVTAT / VTIS escalation.

### VVTAT — Teisė į taisymą

https://vvtat.lrv.lt/lt/teise-i-taisyma/

Mandatory for current 2026 behavior.

Covers, among other things:

- rules applying from 2026-07-31;
- additional statutory-guarantee year when qualifying consumers choose repair instead of replacement;
- product categories currently subject to repairability obligations;
- manufacturer repair obligations outside the ordinary statutory guarantee in qualifying product categories.

### Lithuanian Civil Code

Reuse the existing official E-Seimas / E-TAR Civil Code source from Sprint 01 and add precise article references in rule metadata where possible, including the current provisions corresponding to:

- seller responsibility for lack of conformity;
- statutory period;
- used goods;
- remedies for lack of conformity;
- commercial guarantees.

### Consumer Rights Protection Law

Add / verify the official source for Article 21 concerning the consumer's written claim and the seller's response.

### Directive (EU) 2019/771 — Sale of Goods

https://eur-lex.europa.eu/eli/dir/2019/771

Use the current consolidated version where appropriate.

Relevant concepts include:

- repair/replacement;
- secondary remedies;
- reasonable repair/replacement period;
- no significant inconvenience;
- minor-defect termination limitation.

### Directive (EU) 2024/1799 — Right to Repair

https://eur-lex.europa.eu/eli/dir/2024/1799

Use together with current Lithuanian implementation/VVTAT guidance.

---

# 39. SOURCE VERSIONING

Legal-source metadata should support:

```ts
interface LegalSource {
  id: LegalSourceId;
  authority: "VVTAT" | "E_SEIMAS" | "E_TAR" | "EUR_LEX";
  title: string;
  url: string;
  lastVerifiedAt: string;
  notes?: string;
}
```

For Sprint 02 legal verification, use:

`lastVerifiedAt: "2026-10-01"`

for sources actually checked during implementation.

Do not falsely update `lastVerifiedAt` for a source that was not checked.

---

# 40. IMPORTANT LEGAL ENGINEERING RULES

These are non-negotiable.

### Rule 1

AI is NOT the legal decision engine.

### Rule 2

Do not infer law from prose generated at runtime.

### Rule 3

Every legal result must have official source metadata.

### Rule 4

Unknown facts produce uncertainty, not a guessed legal conclusion.

### Rule 5

A defective product is NOT an ordinary 14-day change-of-mind return.

### Rule 6

A defect does NOT automatically create a right to immediate refund.

### Rule 7

Repair and replacement are the normal first conformity remedies, subject to impossibility / disproportionality rules.

### Rule 8

Price reduction / termination must be based on recognized secondary-remedy grounds.

### Rule 9

Do not invent a universal number of repair attempts.

### Rule 10

The seller's 14-day written-response deadline is NOT a universal 14-day repair-completion deadline.

### Rule 11

No paper receipt does NOT automatically mean no consumer rights.

### Rule 12

A manufacturer's short commercial guarantee does NOT automatically shorten statutory consumer rights.

### Rule 13

Used goods are not automatically limited to one year; a shorter period must be agreed and may not be below the legal minimum.

### Rule 14

Do not automatically treat an after-one-year defect as rejected. Evidence rules change, but the statutory period may still be active.

### Rule 15

The 2026 repair-based guarantee extension must be gated by the correct effective-date logic.

### Rule 16

Post-guarantee manufacturer right-to-repair obligations are separate from the seller's free statutory guarantee.

### Rule 17

Do not hardcode a "serious defect" legal conclusion from a subjective user answer.

### Rule 18

Do not tell the user to contact the manufacturer instead of the seller for the ordinary statutory guarantee claim. The statutory seller-liability workflow is against the seller; manufacturer obligations/commercial guarantees are separate concepts.

---

# 41. REQUIRED UNIT TESTS

Write unit tests before considering Sprint 02 complete.

At minimum cover all cases below.

### Test 1 — Initial defective-goods claim

Consumer + professional seller + physical goods + new + delivered 6 months ago + ordinary-use defect + evidence + no written seller claim.

Expected:

`CONTACT_SELLER_REPAIR_OR_REPLACE`

### Test 2 — Immediate refund misconception

Same as Test 1, but user has only asked for an immediate refund and no secondary-remedy ground exists.

Expected:

`PRIMARY_REMEDY_FIRST`

### Test 3 — First-year defect

Defect became apparent within first year.

Result must include the appropriate first-year evidentiary information.

Must NOT say the case is automatically won.

### Test 4 — Second-year defect

Defect became apparent after first year but within two years.

Must NOT reject the case solely because one year passed.

Result should warn that proof may become more important.

### Test 5 — New goods after two years

No longer within ordinary statutory period; no known commercial guarantee.

Expected baseline:

`STATUTORY_LIABILITY_PERIOD_APPEARS_EXPIRED`

or a more specific right-to-repair branch if the later product-category answers justify it.

### Test 6 — Used goods, no shorter agreement

Used goods + 18 months + no shorter term agreed.

Must NOT automatically treat the statutory period as expired merely because goods were used.

### Test 7 — Used goods, explicitly agreed 12-month term

Used goods + valid 12-month agreed term + 18 months elapsed.

Expected statutory-period-expired path, while still allowing commercial guarantee / right-to-repair follow-up where relevant.

### Test 8 — Used goods, unknown term

If the agreed term is outcome-determinative but unknown:

`USED_GOODS_TERM_REVIEW_REQUIRED`

### Test 9 — No paper receipt, bank evidence exists

Must NOT return purchase-evidence failure.

### Test 10 — No purchase evidence at all

`PURCHASE_EVIDENCE_MISSING`

Must NOT say rights are automatically lost.

### Test 11 — Obvious accidental damage

`CAUSE_REVIEW_REQUIRED`

No definitive legal rejection.

### Test 12 — Seller contacted only verbally

Must recommend written contact / preserve written proof before VVTAT escalation.

### Test 13 — Written claim, no response, deadline still running

Expected:

`SELLER_RESPONSE_PERIOD_RUNNING`

### Test 14 — Written claim, no response, deadline passed

Expected:

`SELLER_RESPONSE_OVERDUE`

and/or `VVTAT_ESCALATION_MAY_BE_AVAILABLE` according to the result architecture.

### Test 15 — Exact deadline boundary

The final day of the response period must not be marked overdue prematurely.

### Test 16 — Seller refused repair

Consumer requested repair; seller refused conformity remedy.

Expected secondary-remedy / escalation path, without automatically declaring the seller unlawful.

### Test 17 — Seller refused immediate refund as first request

Must NOT automatically return a favorable secondary-remedy result.

The engine must understand the remedy hierarchy.

### Test 18 — Repair attempted, same defect persists

Expected:

`SECONDARY_REMEDIES_MAY_BE_AVAILABLE`

### Test 19 — Defect recurs after attempted repair

Expected secondary-remedy path.

Do NOT require three repairs.

### Test 20 — Repair accepted and still ongoing

Must NOT treat 14 days as an automatic repair deadline.

If the facts are insufficient:

`REPAIR_DELAY_REVIEW_REQUIRED`

or an informational waiting result.

### Test 21 — Purchase on/after 2026-07-31 + repair selected

Must include the repair-based additional statutory-guarantee-year information when applicable.

### Test 22 — Purchase before 2026-07-31 + repair selected

Must NOT apply the new guarantee extension solely because the repair occurs after 2026-07-31.

### Test 23 — Post-guarantee covered right-to-repair product

Example: qualifying television / smartphone category outside the ordinary seller statutory period.

Expected:

`POST_GUARANTEE_REPAIR_RIGHT_MAY_APPLY`

with clear distinction from free statutory warranty repair.

### Test 24 — Post-guarantee product category unknown

`RIGHT_TO_REPAIR_REVIEW_REQUIRED`

No guessing.

### Test 25 — Business purchase

`NOT_CONSUMER_PURCHASE`

### Test 26 — Private seller

`PRIVATE_SELLER`

### Test 27 — Service instead of goods

`UNSUPPORTED_TRANSACTION_TYPE`

### Test 28 — Future delivery date

`INVALID_DATE`

### Test 29 — Case resolved

Seller repaired/replaced successfully and user states problem is resolved.

`CASE_RESOLVED`

### Test 30 — Existing Sprint 01 regression suite

All Sprint 01 / 01.1 tests still pass unchanged unless a justified shared-type migration is required.

---

# 42. RESULT SCREEN DESIGN

Every result screen should prioritize:

1. what this means;
2. why;
3. what to do now;
4. what evidence to save;
5. official sources.

Example:

```text
Pagal pateiktą informaciją

Pirmiausia kreipkitės į pardavėją raštu

Sugedus nekokybiškai prekei, pirmas sprendimo būdas paprastai yra remontas arba pakeitimas.

Ką daryti dabar?
1. Aprašykite trūkumą.
2. Aiškiai pasirinkite: remontas arba pakeitimas.
3. Pridėkite pirkimo įrodymą, jei turite.
4. Išsaugokite išsiųstos pretenzijos kopiją.

Ką verta išsaugoti?
• čekį / sąskaitą / mokėjimo įrodymą
• nuotraukas ar vaizdo įrašus
• susirašinėjimą su pardavėju

Oficialūs šaltiniai
[VVTAT ...]
```

Keep paragraphs short on mobile.

Do not flood the result with statute numbers before giving the practical answer.

---

# 43. CONTENT ARCHITECTURE

Keep Lithuanian copy out of the rules where reasonably possible.

Prefer a content layer such as:

```text
features/defective-product/content/lt.ts
```

The domain engine should determine:

- code;
- reason IDs;
- next-step IDs;
- warning IDs;
- source IDs;
- relevant structured legal effects.

The content layer may map these to Lithuanian UI text.

If Sprint 01 already uses a different clean pattern, reuse it.

Do not create copy duplication across JSX files.

---

# 44. DO NOT BUILD YET

Do not implement during Sprint 02:

- Supabase;
- user accounts;
- login;
- receipt upload;
- receipt storage;
- receipt OCR;
- purchase vault;
- automatic email import;
- complaint document generation;
- sending email to sellers;
- automated VTIS submission;
- case persistence;
- deadline notifications;
- push notifications;
- payments;
- subscription system;
- merchant database;
- AI legal advice;
- native mobile app;
- admin panel.

Receipt saving belongs to the next product stage, not this sprint.

---

# 45. REPOSITORY AND GIT REQUIREMENTS

The implementation is not complete until the code exists in:

https://github.com/IgnasGaj/pirkejo_skydas.git

Important: the remote repository may not yet contain the completed local Sprint 01 work. Do not assume that local implementation means the remote is synchronized.

Before coding, run a Git preflight equivalent to:

```bash
git status
git remote -v
git branch --show-current
git log --oneline -n 10
```

Requirements:

1. Confirm `origin` points to:

   `https://github.com/IgnasGaj/pirkejo_skydas.git`

2. Preserve all existing Sprint 01 / 01.1 work in the working tree and history.

3. Do not clone over or delete unpushed local work.

4. Do not force-push.

5. Do not rewrite existing history merely to make the push easier.

6. If the remote is empty but the local repository contains the completed project, push the existing project history plus Sprint 02 to the normal primary branch.

7. Prefer the repository's existing primary branch. If the repository truly has no branch yet, use `main`.

8. Commit only project files that belong in source control.

9. Do not commit secrets, local `.env` values, caches, build output, test artifacts, editor state, or agent working files.

10. After implementation and validation, commit the completed Sprint 02 work with a normal project-focused commit message, for example:

```text
feat: add defective product decision engine
```

11. Push the completed code to `origin`.

12. Verify the push succeeded.

At completion, equivalent checks must show that local HEAD is synchronized with the pushed remote branch.

Do not report Sprint 02 as complete if the push failed.

---

# 46. REPOSITORY HYGIENE — NO ASSISTANT / AGENT ATTRIBUTION

The repository should look like an ordinary software project maintained by its owner.

Do not add assistant-specific or agent-specific artifacts.

Specifically:

- no generated-by-AI comments;
- no tool-specific authorship text;
- no automated-generation attribution text;
- no AI attribution banners;
- no agent transcripts;
- no prompt logs;
- no temporary reasoning files;
- no tool-specific agent-working directory;
- no agent-specific README section;
- no commit-message text attributing implementation to an automated coding assistant;
- no `Co-authored-by` trailer naming an automated coding assistant;
- no source-code comments explaining that an AI wrote the implementation.

Do not alter or falsify repository authorship metadata as a workaround. Simply use the repository's normal configured Git workflow and avoid adding assistant-specific attribution or working artifacts.

The sprint specification itself may be stored under `docs/` if desired, but it must be project-focused and must not state that a particular AI system implemented the code.

---

# 47. QUALITY CHECKS

Before the sprint is considered complete:

- run all unit tests;
- run the full regression test suite;
- run TypeScript checks if configured;
- run lint if configured;
- run the production build;
- fix failures;
- verify `/returns` still works;
- verify `/defective-product` works;
- verify the landing action works;
- verify the Sprint 01 defect redirect works;
- verify mobile layout;
- verify no English user-facing copy accidentally appears in the new flow;
- verify all legal result paths contain source IDs;
- verify no receipt-storage/database code was introduced;
- verify Git working tree is clean after commit;
- verify the remote push succeeded.

Expected commands depend on the repository scripts, but at minimum run the relevant equivalents of:

```bash
npm test
npm run build
```

and any existing lint/typecheck scripts.

---

# 48. LEGAL CLASSIFICATION REVIEW OUTPUT

As part of Sprint 02 completion, create a concise developer review document:

`docs/legal-classification-review-sprint-02.md`

It must list only genuine legal / classification uncertainties that remain after implementation.

Examples that may require conservative handling:

- exact applicability of right-to-repair product-specific regulations;
- used-goods shortened-term facts when the agreement is unknown;
- whether a defect is legally minor or serious;
- technical causation disputes;
- reasonableness of a repair period;
- marketplace seller identity;
- applicability of special sector-specific rules.

Do not fill this file with generic disclaimers.

Every item should explain:

1. what the unresolved classification is;
2. which result code handles it conservatively;
3. which official source should be reviewed before narrowing the rule.

---

# 49. DEFINITION OF DONE

Sprint 02 is complete only when all of the following are true:

1. Existing Sprint 01 / 01.1 behavior is preserved.
2. Landing-page **Prekė sugedo** is active.
3. `/defective-product` provides the complete supported wizard.
4. Sprint 01 `DEFECT_FLOW_REQUIRED` links into Sprint 02.
5. All legal decisions originate from the pure defective-product rules engine.
6. The engine distinguishes primary remedies from secondary remedies.
7. The engine does not promise an automatic replacement/refund merely because a product failed.
8. The engine correctly distinguishes the seller's 14-day response rule from repair duration.
9. The engine handles the first-year vs later evidentiary distinction conservatively.
10. The engine handles new vs used goods conservatively.
11. The 2026-07-31 repair-based guarantee-extension rule is implemented and tested.
12. A conservative post-guarantee right-to-repair branch exists for currently listed product categories.
13. Missing/unknown facts produce review states, not guesses.
14. Purchase evidence is handled without a paper-receipt-only rule.
15. Every legal result has official source IDs.
16. VVTAT escalation is shown only after the relevant written-claim procedural path.
17. Unit tests in this specification pass.
18. Sprint 01 regression tests pass.
19. Production build passes.
20. UI is mobile-friendly.
21. All user-facing product language is Lithuanian.
22. No database, authentication, OCR, receipt storage, or complaint generator has been added.
23. `docs/legal-classification-review-sprint-02.md` exists.
24. Repository contains no assistant/agent attribution or working artifacts.
25. Completed project code is committed and pushed successfully to:

   `https://github.com/IgnasGaj/pirkejo_skydas.git`

26. Local HEAD and the pushed remote branch are verified to be synchronized.

Do not expand scope beyond this specification.
