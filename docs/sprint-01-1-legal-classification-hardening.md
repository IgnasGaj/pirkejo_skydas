# PIRKĖJO SKYDAS — SPRINT 01.1
## LEGAL CLASSIFICATION HARDENING

You have already completed Sprint 01: "Ar galiu grąžinti prekę?"

You also produced `legal-classification-review.md`.

Do NOT start Sprint 02.

Your task is to harden the existing Sprint 01 implementation based on the issues identified in that legal review.

The application architecture and original Sprint 01 constraints remain in force.

Do not add:
- database;
- Supabase;
- authentication;
- AI/LLM;
- OCR;
- complaint generation;
- defective-product flow;
- payments.

The goal is to make the return rule engine more legally conservative and prevent broad UI categories from being treated as precise statutory classifications.


# 1. CORE PRINCIPLE

A broad consumer-facing product category MUST NOT automatically produce a definitive legal classification unless the application has enough information to map it confidently to the applicable rule.

When information is insufficient:

return:

CATEGORY_REVIEW_REQUIRED

Do not guess.


# 2. SEPARATE USER-FACING CATEGORY FROM LEGAL CLASSIFICATION

Refactor the category model if necessary so that:

- user-facing categories remain simple;
- statutory/legal classification is represented separately.

For example:

```ts
type ProductCategory =
  | "CLOTHING_FOOTWEAR"
  | "ELECTRONICS"
  | "COSMETICS_HYGIENE"
  | "UNDERWEAR"
  | "FURNITURE"
  | "BOOKS"
  | "TOYS_GAMES"
  | "JEWELRY"
  | "MEDICAL_DEVICE"
  | "OTHER"
  | "UNKNOWN";
```

Create a separate legal classification concept.

Example only:

```ts
type PhysicalReturnClassification =
  | "STANDARD"
  | "SELLER_CONSENT_REQUIRED"
  | "REQUIRES_REVIEW";
```

Do not assume the broad ProductCategory itself proves the legal classification.


# 3. CATEGORY CLARIFICATION

For categories that are too broad, the wizard must support follow-up clarification questions.

At minimum review:

- Elektronika / elektrotechnika
- Kosmetika / higienos prekė
- Medicinos priemonė / įrenginys
- Žaislai / žaidimai
- Kita
- Nežinau

The follow-up system must be reusable.

Do not hard-code clarification logic directly inside React pages.

Represent clarification options as domain data where practical.


# 4. TOYS / GAMES

The current "Žaislai / žaidimai" category is too broad.

Do NOT automatically classify the entire category as either:

STANDARD

or:

SELLER_CONSENT_REQUIRED.

Ask additional questions or provide narrower selectable product types where the applicable legal classification is known.

If the precise product cannot be confidently mapped:

CATEGORY_REVIEW_REQUIRED.


# 5. ELECTRONICS / ELECTROTECHNICS

Do not treat every product commonly described by a consumer as "electronics" as belonging to the same statutory return category.

Review the exact wording of the official Lithuanian retail rules already referenced by the project.

Only encode precise mappings supported by those official sources.

If the UI answer remains broader than the legal category:

CATEGORY_REVIEW_REQUIRED.


# 6. COSMETICS / HYGIENE

Physical-store rules and distance-sale hygiene exceptions MUST remain separate.

Do NOT create:

COSMETICS_OR_HYGIENE = NONRETURNABLE

For physical stores, classification must be based on the applicable Lithuanian retail-rule category.

For distance purchases, the existing sealed-hygiene exception requires the relevant hygiene condition AND the seal/opening facts.

Do not merge the two systems.


# 7. MEDICAL DEVICES

Do not assume every product described by the user as a medical device has identical return treatment.

Only provide a definitive physical-store classification when supported by the official source mapping.

Otherwise:

CATEGORY_REVIEW_REQUIRED.


# 8. OTHER / UNKNOWN

"Kita" and "Nežinau" must never be mapped to a legal return class automatically.

Return or route toward:

CATEGORY_REVIEW_REQUIRED.

The result should explain that the exact product type must be established before the app can provide a reliable result.


# 9. DISTANCE-SALE SPECIAL REVIEW

Preserve:

SPECIAL_REVIEW_REQUIRED

for situations that cannot safely be determined from the MVP questionnaire.

This includes, where applicable:

- OTHER_EXCEPTION;
- uncertain sealed media/software cases;
- uncertain digital-content consent situations;
- other fact-specific statutory exceptions.

Do not attempt to turn every edge case into a definitive YES/NO result.


# 10. SOURCE TRACEABILITY

Every precise classification added during this sprint must point to an official source ID.

Maintain the existing rule:

No legal classification affecting the result without an official source.

Prefer the existing structured source registry rather than adding URLs directly to rule logic.


# 11. RULE TRACE

Improve the development-only rule trace so that category clarification is visible.

Example:

```text
User category:
ELECTRONICS

Clarification:
<precise subtype>

Legal classification:
SELLER_CONSENT_REQUIRED

Rules triggered:
...

Sources:
...
```

If classification is unresolved:

```text
Legal classification:
REQUIRES_REVIEW
```


# 12. TESTS

Keep all existing Sprint 01 tests passing.

Add tests covering at minimum:

1. Broad electronics category without sufficient clarification  
   Expected:  
   CATEGORY_REVIEW_REQUIRED

2. Electronics subtype that can be confidently mapped to seller-consent-required  
   Expected:  
   SELLER_CONSENT_REQUIRED

3. Toys/games without sufficient product identification  
   Expected:  
   CATEGORY_REVIEW_REQUIRED

4. A clarified toy/game subtype that follows STANDARD rules, if supported by the official rules  
   Expected:  
   normal physical-store flow

5. OTHER category  
   Expected:  
   CATEGORY_REVIEW_REQUIRED

6. UNKNOWN category  
   Expected:  
   CATEGORY_REVIEW_REQUIRED

7. Broad cosmetics/hygiene classification must not automatically trigger the online sealed-hygiene exception.

8. Distance hygiene-sensitive product + seal intact  
   Must NOT automatically reject withdrawal.

9. Distance hygiene-sensitive product + seal opened, where all exception criteria are satisfied  
   Expected applicable distance exception.

10. Uncertain distance exception  
    Expected:  
    SPECIAL_REVIEW_REQUIRED


# 13. LEGAL REVIEW DOCUMENT

Update `legal-classification-review.md`.

It should clearly separate:

A. classifications now verified and encoded;

B. classifications intentionally left as CATEGORY_REVIEW_REQUIRED;

C. situations intentionally left as SPECIAL_REVIEW_REQUIRED;

D. official sources used.

Do not claim that a classification has been verified unless the actual rule encoded in the application is supported by the cited official source.


# 14. DEFINITION OF DONE

Sprint 01.1 is complete when:

- broad UI categories no longer create unjustified legal conclusions;
- clarification logic is isolated from React;
- unresolved classifications safely return CATEGORY_REVIEW_REQUIRED;
- distance-sale exceptions remain separate from physical-store category rules;
- all old tests still pass;
- new classification tests pass;
- npm run test passes;
- TypeScript checks pass;
- npm run build passes;
- legal-classification-review.md is updated.

Do not start work on defective products or any other Sprint 02 functionality.
