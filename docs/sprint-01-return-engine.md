# PIRKĖJO SKYDAS — SPRINT 1

You are building the first functional vertical slice of a Lithuanian consumer-rights application called **Pirkėjo Skydas**.

The application will eventually help Lithuanian consumers:

- store purchases and receipts;
- understand return and warranty procedures;
- understand what to do when a product is defective;
- generate complaints;
- track seller deadlines;
- preserve evidence;
- prepare information for VVTAT/VTIS disputes.

For this sprint, DO NOT build the entire application.

Build only:

# “AR GALIU GRĄŽINTI PREKĘ?”

The architecture must nevertheless be reusable for future consumer-rights decision trees.

---

# 1. TECH STACK

Use:

- Next.js
- App Router
- TypeScript
- React
- Tailwind CSS
- shadcn/ui
- Zod
- Vitest for unit tests

Do NOT add a database yet.

Do NOT add Supabase yet.

Do NOT add authentication.

Do NOT add an LLM.

Use local mock data / in-memory state where necessary.

The rule engine must be completely independent of React.

---

# 2. PRODUCT LANGUAGE

UI language for the MVP: **Lithuanian**.

Code, variable names, interfaces and developer documentation: **English**.

Tone:

- simple;
- friendly;
- not overly legal;
- no legal jargon unless followed by a plain-language explanation.

The user should feel like they are answering ordinary retail questions, not filling out a legal form.

---

# 3. MAIN SCREEN

Create a minimal mobile-first landing/dashboard screen.

Title:

# Pirkėjo Skydas

Subtitle:

**Žinok savo teises po kiekvieno pirkimo.**

Primary action:

**Ar galiu grąžinti prekę?**

Secondary placeholder actions may visually appear but MUST be disabled:

- Prekė sugedo
- Nerandu čekio
- Prekė per ilgai servise
- Pardavėjas nepadeda

Show:

**Netrukus**

on disabled functionality.

---

# 4. RETURN FLOW

Route:

`/returns`

Build this as a multi-step wizard.

One question per screen on mobile where practical.

Show progress.

Allow Back.

Preserve previous answers.

Do not evaluate legal rules inside React components.

React collects answers.

A standalone rule engine evaluates them.

---

# 5. QUESTION 1 — IS THE PRODUCT DEFECTIVE?

Lithuanian:

## Ar prekė yra sugedusi arba nekokybiška?

Options:

- Taip
- Ne
- Nežinau

If YES:

Do NOT continue through change-of-mind return rules.

Show:

## Tai nėra paprastas prekės grąžinimas

Jeigu prekė sugedo, neveikia taip, kaip turėtų, arba turi kitų trūkumų, taikomos nekokybiškos prekės taisyklės.

CTA:

**Eiti į „Prekė sugedo“**

This button may currently show:

**Ši funkcija bus sukurta kitame etape.**

Return result code:

`DEFECT_FLOW_REQUIRED`

If UNKNOWN:

Explain briefly what “defective” means and allow:

- Prekė veikia tinkamai
- Prekė turi trūkumą

---

# 6. QUESTION 2 — WHO BOUGHT IT?

## Kas įsigijo prekę?

Options:

- Aš kaip privatus asmuo
- Įmonė / individuali veikla verslo tikslais

If business:

Return:

`NOT_CONSUMER_PURCHASE`

Message:

## Ši situacija nepatenka į įprastą vartotojų teisių apsaugą

Pirkėjo Skydas šiuo metu skirtas fizinių asmenų pirkiniams, įsigytiems asmeniniams, o ne verslo poreikiams.

No definitive legal advice beyond this.

---

# 7. QUESTION 3 — WHO SOLD IT?

## Iš ko pirkote?

Options:

- Parduotuvės / įmonės
- Privataus žmogaus
- Nežinau

If private seller:

Return:

`PRIVATE_SELLER`

Explain:

Pirkėjo Skydas MVP currently handles purchases from professional sellers.

Do not apply consumer B2C return rules automatically.

---

# 8. QUESTION 4 — WHERE WAS IT PURCHASED?

## Kaip pirkote prekę?

Options:

### Fizinėje parduotuvėje

Example:

Topo Centras, Senukai, Maxima etc.

### Internetu

Example:

internetinė parduotuvė, programėlė, užsakymas internetu.

Internally:

```ts
type PurchaseChannel =
  | "PHYSICAL_STORE"
  | "DISTANCE";
```

The next rules differ significantly depending on this answer.

---

# 9. PHYSICAL STORE FLOW

The user has:

- a non-defective product;
- bought as a consumer;
- from a professional seller;
- in a physical store.

Ask:

## Kada įsigijote prekę?

Use purchase date.

Calculate days correctly.

For physical-store return rules, the period generally starts from the following day after purchase.

Never rely only on `currentDate - purchaseDate` scattered across components.

Create a tested date helper.

Possible states:

- within normal 14-day period;
- outside normal 14-day period;
- invalid/future date.

If outside:

Return:

`PHYSICAL_RETURN_PERIOD_EXPIRED`

Message:

## Įprastas 14 dienų terminas jau pasibaigė

Pardavėjas gali taikyti palankesnes savo taisykles, tačiau Pirkėjo Skydas negali automatiškai teigti, kad pardavėjas privalo priimti tinkamos kokybės prekę atgal.

Provide official-source link area.

---

# 10. PHYSICAL STORE — PRODUCT CATEGORY

If within 14 days, ask:

## Kokią prekę norite grąžinti?

MVP categories:

- Drabužiai / avalynė
- Elektronika / elektrotechnika
- Kosmetika / higienos prekė
- Apatiniai drabužiai
- Baldai
- Knygos
- Žaislai / žaidimai
- Juvelyriniai dirbiniai
- Medicinos priemonė / įrenginys
- Kita
- Nežinau

IMPORTANT:

The product-category system must NOT be implemented as random hard-coded UI assumptions.

Create:

```ts
interface ProductCategoryRule {
  id: ProductCategory;
  label: string;
  physicalStoreReturnClass:
    | "STANDARD"
    | "SELLER_CONSENT_REQUIRED"
    | "REQUIRES_REVIEW";
}
```

Several categories listed by Lithuanian retail rules belong to:

`SELLER_CONSENT_REQUIRED`

Meaning:

A non-defective product belonging to the relevant statutory category may generally only be returned if the seller agrees.

Do NOT display:

“Grąžinti draudžiama.”

Instead display:

## Pardavėjas neprivalo automatiškai priimti šios kokybiškos prekės

Ši prekių kategorija patenka tarp kategorijų, kurių tinkamos kokybės prekių grąžinimas fizinėje parduotuvėje priklauso nuo pardavėjo sutikimo.

You may still ask the seller — some stores offer more generous return policies.

Result:

`SELLER_CONSENT_REQUIRED`

---

# 11. UNKNOWN CATEGORY

This is critically important.

If the app cannot confidently classify the product:

DO NOT GUESS.

Return:

`CATEGORY_REVIEW_REQUIRED`

Display:

## Reikia patikslinti prekės kategoriją

Skirtingoms prekių kategorijoms gali būti taikomos skirtingos taisyklės.

Do not produce a definitive “yes/no”.

The future application may use AI to suggest categories, but legal determination must still come from the rules system.

---

# 12. PHYSICAL STORE — CONDITION

If product category uses the standard return path, ask:

## Ar prekė buvo naudota?

Options:

- Ne
- Taip
- Tik apžiūrėjau
- Nežinau

Also ask:

## Ar prekė išsaugojo prekinę išvaizdą ir nėra sugadinta?

- Taip
- Ne
- Nežinau

Physical-store standard return logic should consider that quality goods generally need to remain unused, undamaged, retain consumer properties and commercial appearance.

If clearly used/damaged:

Result:

`PHYSICAL_CONDITION_NOT_MET`

Do not say:

“Illegal to return.”

Say:

## Pardavėjas gali turėti pagrindą nepriimti prekės

Explain why.

---

# 13. PROOF OF PURCHASE

Ask:

## Ar turite įrodymą, kad pirkote iš šio pardavėjo?

Options:

- Turiu čekį
- Turiu sąskaitą faktūrą
- Mokėjau kortele ir turiu mokėjimo įrašą
- Turiu kitą pirkimą patvirtinantį dokumentą
- Nieko neturiu
- Nežinau

IMPORTANT:

Never encode the rule:

`NO RECEIPT = NO RIGHTS`

A receipt is not the only conceivable evidence of purchase.

The system should use:

```ts
type PurchaseEvidence =
  | "RECEIPT"
  | "INVOICE"
  | "PAYMENT_RECORD"
  | "OTHER"
  | "NONE"
  | "UNKNOWN";
```

If evidence is NONE:

Result may say:

## Pirmiausia reikėtų rasti pirkimą patvirtinančių įrodymų

Do not automatically claim that the user's rights disappear.

Result:

`PURCHASE_EVIDENCE_MISSING`

This later connects directly with the Pirkėjo Skydas receipt vault.

---

# 14. PHYSICAL STORE SUCCESS RESULT

If:

- B2C;
- professional seller;
- non-defective;
- physical store;
- within period;
- category uses standard return path;
- condition requirements appear satisfied;
- purchase evidence exists;

Return:

`PHYSICAL_RETURN_LIKELY_AVAILABLE`

UI:

# Pagal pateiktą informaciją galite turėti teisę grąžinti arba pakeisti prekę

Then clearly show:

### Kodėl?

- prekė pirkta fizinėje parduotuvėje;
- nepraėjo įprastas 14 dienų laikotarpis;
- prekė nepatenka į pasirinktą išimčių kategoriją;
- pagal pateiktus atsakymus prekė nėra naudota ar sugadinta;
- turite pirkimą patvirtinančių įrodymų.

CTA:

**Ką daryti toliau?**

Instructions:

1. Kreipkitės į pardavėją.
2. Turėkite pirkimą patvirtinančius įrodymus.
3. Pasiimkite prekę ir komplektaciją.
4. Jei pardavėjas atsisako — išsaugokite jo atsakymą.

Do not guarantee outcome.

Use wording such as:

- “pagal pateiktą informaciją”;
- “gali būti taikoma”;
- “pardavėjas gali turėti papildomą palankesnę grąžinimo politiką”.

---

# 15. ONLINE / DISTANCE FLOW

If:

`purchaseChannel === "DISTANCE"`

Ask:

## Kada gavote prekę?

Use delivery date, NOT necessarily order date.

The normal withdrawal period for goods purchased at distance is generally calculated from physical receipt of the goods.

If within 14 days:

continue.

If outside:

Return:

`DISTANCE_STANDARD_PERIOD_EXPIRED`

BUT:

Do not state absolutely that no withdrawal right can exist.

There are special cases, including situations involving failure to properly inform the consumer about the right of withdrawal.

Result should say:

## Įprastas 14 dienų atsisakymo terminas pasibaigė

Tačiau tam tikromis aplinkybėmis gali būti taikomos papildomos taisyklės.

Result:

`SPECIAL_REVIEW_REQUIRED`

---

# 16. ONLINE — EXCEPTIONS

Create a separate structured exception model.

```ts
type DistanceReturnException =
  | "CUSTOM_MADE"
  | "PERISHABLE"
  | "SEALED_HYGIENE_OPENED"
  | "SEALED_MEDIA_OR_SOFTWARE_OPENED"
  | "DIGITAL_CONTENT_STARTED_WITH_CONSENT"
  | "OTHER_EXCEPTION"
  | "NONE"
  | "UNKNOWN";
```

MVP questionnaire should detect at minimum:

### Custom product

## Ar prekė buvo pagaminta arba aiškiai pritaikyta specialiai jums?

Examples:

- individualūs išmatavimai;
- personalizuotas užrašas;
- specialiai užsakyta individuali konfigūracija where legally applicable.

### Perishable

## Ar prekė greitai genda arba jos galiojimo laikas labai trumpas?

### Hygiene

## Ar tai buvo užplombuota prekė, kurios dėl sveikatos ar higienos priežasčių negalima tinkamai grąžinti po atidarymo?

If YES:

Ask:

## Ar apsauginė pakuotė / plomba buvo atidaryta?

Only treat as:

`SEALED_HYGIENE_OPENED`

where both relevant conditions are met.

DO NOT create the rule:

`HYGIENE PRODUCT = ALWAYS NONRETURNABLE ONLINE`

That is too simplistic.

---

# 17. ONLINE — OPENED PRODUCT

For ordinary distance purchases:

Opening packaging or handling the product does NOT automatically remove the withdrawal right.

The consumer may generally inspect/handle the item as necessary to establish its nature, characteristics and functioning.

Handling beyond what is necessary may create liability for diminished value.

Therefore create:

```ts
type HandlingLevel =
  | "UNOPENED"
  | "INSPECTED"
  | "USED_BEYOND_INSPECTION"
  | "UNKNOWN";
```

If:

`USED_BEYOND_INSPECTION`

Do NOT automatically return:

`RETURN_FORBIDDEN`

Instead return result containing warning:

`POSSIBLE_DIMINISHED_VALUE`

Message:

## Prekę vis tiek gali būti įmanoma grąžinti, tačiau gali kilti klausimas dėl jos vertės sumažėjimo

Exceptions such as opened sealed hygiene products are handled separately.

---

# 18. ONLINE SUCCESS RESULT

If:

- B2C;
- professional seller;
- distance purchase;
- within standard withdrawal period;
- no applicable exception;

return:

`DISTANCE_WITHDRAWAL_LIKELY_AVAILABLE`

Display:

# Pagal pateiktą informaciją jums greičiausiai taikoma teisė atsisakyti nuotolinės sutarties

Explain:

- purchase was made at distance;
- product was received within the relevant period;
- answers did not identify an applicable exception.

Then:

## Ką daryti?

1. Informuokite pardavėją apie sprendimą atsisakyti sutarties iki termino pabaigos.
2. Išsaugokite įrodymą, kada pranešimą išsiuntėte.
3. Grąžinkite prekę pagal pardavėjo pateiktą procesą.
4. Išsaugokite siuntimo dokumentus.

Later Pirkėjo Skydas will generate the withdrawal notice automatically.

---

# 19. RESULT OBJECT

All paths must produce the same structured object.

Example:

```ts
interface DecisionResult {
  code: DecisionCode;
  status:
    | "LIKELY_ELIGIBLE"
    | "LIKELY_NOT_ELIGIBLE"
    | "SELLER_CONSENT"
    | "NEEDS_MORE_INFORMATION"
    | "REDIRECT";
  title: string;
  summary: string;
  reasons: DecisionReason[];
  nextSteps: NextStep[];
  warnings: string[];
  sourceIds: LegalSourceId[];
}
```

Do NOT generate legal results directly as JSX.

The UI should render `DecisionResult`.

---

# 20. RULE ENGINE

Create a pure function similar to:

```ts
evaluateReturnCase(input: ReturnCaseInput): DecisionResult
```

It must:

- have no React dependency;
- have no network dependency;
- have no AI dependency;
- be deterministic;
- be fully unit-testable.

Suggested folder:

```text
src/
  features/
    returns/
      components/
      domain/
        types.ts
        categories.ts
        rules.ts
        evaluateReturnCase.ts
        dateRules.ts
      content/
        lt.ts
      pages/
  legal/
    sources.ts
```

Modify structure if there is a strong technical reason, but keep domain logic isolated.

---

# 21. LEGAL SOURCES

Create structured legal-source metadata.

Example:

```ts
interface LegalSource {
  id: string;
  authority: "VVTAT" | "E_SEIMAS" | "EUR_LEX";
  title: string;
  url: string;
  lastVerifiedAt: string;
}
```

Initial source categories:

- VVTAT guidance on myths surrounding the 14-day return right;
- VVTAT consumer-rights FAQ;
- Lithuanian retail rules concerning categories of quality goods that may only be returned with seller consent;
- Lithuanian Civil Code consumer provisions;
- EU Consumer Rights Directive rules governing distance-contract withdrawal;
- EU rules governing diminished value after handling.

The user-facing result must have:

### Oficialūs šaltiniai

with clickable source links.

No result affecting legal guidance may exist without at least one source ID.

---

# 22. IMPORTANT LEGAL ENGINEERING RULES

These are non-negotiable.

### Rule 1

AI is NOT the law engine.

### Rule 2

Never create legal rules from generated text.

### Rule 3

Every rule must reference an official source.

### Rule 4

Unknown information must result in uncertainty, not a guessed legal answer.

### Rule 5

Product categories must be structured data.

### Rule 6

Online and physical-store return rules must NEVER be merged into one generic “14 day rule”.

### Rule 7

Defective-product rights must NEVER be processed as a simple change-of-mind return.

### Rule 8

Do not treat absence of a paper receipt as automatic loss of rights.

### Rule 9

Do not treat opening packaging as automatically destroying the distance-withdrawal right.

### Rule 10

Use safe language:

“pagal pateiktą informaciją”

rather than:

“jūs tikrai turite teisę”.

---

# 23. UNIT TESTS

Write tests before considering the sprint complete.

At minimum cover:

### Test 1
Physical store + non-defective + standard category + day 5 + unused + evidence.

Expected:

`PHYSICAL_RETURN_LIKELY_AVAILABLE`

### Test 2
Physical store + electronics + non-defective.

Expected:

`SELLER_CONSENT_REQUIRED`

### Test 3
Physical store + standard category + day 20.

Expected:

`PHYSICAL_RETURN_PERIOD_EXPIRED`

### Test 4
Physical store + standard category + used/damaged.

Expected:

`PHYSICAL_CONDITION_NOT_MET`

### Test 5
Physical store + no paper receipt but invoice exists.

Must NOT return receipt failure.

### Test 6
Physical store + no evidence at all.

Expected:

`PURCHASE_EVIDENCE_MISSING`

### Test 7
Online + received 5 days ago + ordinary product.

Expected:

`DISTANCE_WITHDRAWAL_LIKELY_AVAILABLE`

### Test 8
Online + sealed hygiene-sensitive item + seal opened.

Expected exception result.

### Test 9
Online + hygiene-sensitive item + seal NOT opened.

Must NOT automatically reject return.

### Test 10
Online + custom-made/personalised product.

Expected exception.

### Test 11
Online + ordinary product packaging opened only for inspection.

Must NOT automatically reject return.

### Test 12
Online + product materially used beyond inspection.

Result must mention possible diminished value rather than automatically claim that withdrawal is impossible.

### Test 13
Product defective.

Expected:

`DEFECT_FLOW_REQUIRED`

### Test 14
Purchased by company for business purposes.

Expected:

`NOT_CONSUMER_PURCHASE`

### Test 15
Purchased from private individual.

Expected:

`PRIVATE_SELLER`

### Test 16
Unknown product category.

Expected:

`CATEGORY_REVIEW_REQUIRED`

No guessing.

---

# 24. DEVELOPMENT UX

Add a development-only panel underneath the result.

Show:

```text
Decision:
DISTANCE_WITHDRAWAL_LIKELY_AVAILABLE

Rules triggered:
DISTANCE_B2C
WITHIN_14_DAYS
NO_EXCEPTION_FOUND

Sources:
VVTAT_...
EU_CRD_...
```

This panel is extremely important while developing and testing legal decision trees.

Hide it in production.

---

# 25. VISUAL DIRECTION

Mobile-first.

Clean Lithuanian fintech/government-service feeling, but warmer and simpler.

Avoid:

- lawyer imagery;
- gavels;
- courthouse clichés;
- huge amounts of text;
- AI gradients;
- cartoon mascots for now.

Result screens should emphasize:

1. answer;
2. reason;
3. what to do next;
4. official sources.

Questions should feel very easy.

Example:

```text
←

2 iš 6

Kur pirkote prekę?

[ 🏪 Fizinėje parduotuvėje ]

[ 🌐 Internetu ]

Kodėl to klausiame?
Pirkiniams internetu ir fizinėse parduotuvėse
taikomos skirtingos grąžinimo taisyklės.
```

---

# 26. DO NOT BUILD YET

Absolutely do not implement during this sprint:

- authentication;
- Supabase;
- receipt OCR;
- AI;
- complaint generation;
- VVTAT complaint flow;
- payment system;
- push notifications;
- warranty system;
- merchant database;
- email import;
- native app;
- admin panel.

Leave architecture extensible, but do not overengineer future functionality.

---

# 27. DEFINITION OF DONE

Sprint 1 is complete when:

1. Application runs locally.
2. `/returns` provides the complete wizard.
3. Physical and distance purchases follow different branches.
4. All decisions originate from the pure rules engine.
5. Legal-source metadata is attached to results.
6. Unknown cases produce uncertainty instead of guesses.
7. Every listed unit test passes.
8. Mobile UI is usable.
9. No AI is involved.
10. No database is required.
11. `npm run test` passes.
12. `npm run build` passes.

Before finishing:

- run tests;
- run TypeScript checks;
- run production build;
- fix all failures;
- provide a concise summary of what was created;
- document any legal classifications that still require manual verification.

Do not expand project scope beyond this specification.
