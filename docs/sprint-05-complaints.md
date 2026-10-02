# PIRKĖJO SKYDAS — SPRINT 05
## Reviewed Lithuanian complaints and private document export

Repository: https://github.com/IgnasGaj/pirkejo_skydas.git
Implementation specification: `docs/sprint-05-complaints.md`
Planning date: 2026-10-02

Read this entire specification before editing. Implement the authorized work, verify it, commit it, and push a feature branch. Do not stop after producing a plan. Do not merge into main or deploy as part of this sprint.

Developer communication, code, and documentation: English. All interface text, errors, accessibility labels, and generated consumer documents: Lithuanian.

## 1. Outcome

A signed-in consumer can open an owned purchase, complete the existing legal questionnaire, choose a supported request, review the facts, prepare a Lithuanian letter to the seller, save it privately, and download or copy it for sending themselves.

The complete slice is:

**Saved purchase → legal questions → supported request → reviewed complaint → saved document → PDF/text download.**

This delivers the next milestone in the original roadmap: Sprint 5 complaint generation, followed by Sprint 6 case tracking and Sprint 7 VVTAT evidence packages.

Use deterministic templates. No LLM, paid API, or new external account is needed. The existing legal engines remain responsible for legal decisions; templates express confirmed facts and supported requests.

## 2. Source history and baseline

This specification is based on the supplied conversation export, Sprint 1 rules and classification review, Sprint 3 purchase vault, Sprint 4 receipt scanning, Sprint 4 inspection, Sprint 4.2, and the pre-Sprint 5 inspection.

The latest supplied inspection reviewed main at `226cb76689865dd5b5901f47a9b3cb50f3a0ee77`. It found Sprint 4.2 in main and 197 passing unit/component tests, but explicitly held complaint implementation pending four fixes. This is historical evidence, not a statement about today's remote HEAD.

Before implementation:

1. Read repository instructions, inspect worktree/remotes, fetch current refs, and preserve unrelated local changes.
2. Identify the actual current main and any newer hardening branch or PR.
3. Verify which findings have already been fixed using code and regression tests. Do not assume the supplied report remains current or repeat completed changes.
4. Start `feature/sprint-05-complaints` from current verified main. If prerequisite fixes exist only on an unmerged branch, preserve that history and clearly report the dependency instead of silently merging main.
5. Record the starting SHA, prerequisite commits, and final candidate SHA.

Do not downgrade to a historical SHA, reset user changes, rewrite history, or force-push.

## 3. Mandatory prerequisite gate

Resolve or verify all four findings in `pre-sprint-05-code-inspection(1).md` before implementing complaint generation. If not already resolved, make a focused prerequisite commit on the feature branch and run its checks before continuing. The fix work is included in this specification; do not leave it as an optional suggestion.

| Finding | Required behavior | Required evidence |
| --- | --- | --- |
| Pre-5 F1: distance withdrawal deadline | Calculate the applicable deadline with the event day excluded, final day included, and extension over relevant weekends/Lithuanian public holidays. Keep fourteen calendar days, rather than fourteen working days. | Saturday/Sunday, holiday, consecutive holiday/weekend, extended last day, and next-day tests; retain Europe/Vilnius civil dates. |
| Pre-5 F2: standalone foreign currency | Isolated plausible CHF/SEK/NOK/CAD currency lines and wrapped markers suppress suggested EUR product prices and receipt totals; consciously entered EUR amounts remain possible. | Whole-receipt fixtures, EUR controls, and false-positive controls including NOKIA, CADBURY, and SEKUNDĖ. |
| Pre-5 F3: expired-session retry identity | Validate and preserve stable purchase/document UUIDs through safe reauthentication. Recover the original partial save; explain receipt reselection. | Real authenticated partial-save → session invalidation → login → retry; one purchase/document, original bytes, unsafe/invalid redirect rejection. |
| Pre-5 F4: stale manual purchase edit | Ordinary edits carry the original version and use an atomic guarded update; stale submissions retain entered values and cannot overwrite newer facts. | Real two-tab stale seller/date/price versus notes case, plus a successful current-version edit. |

Do not apply the distance-withdrawal deadline rule indiscriminately to physical-store returns or seller-response deadlines. Verify the national rules independently before changing those flows.

Preserve earlier Sprint 4 protections: receipt claim tokens, original-byte hashes, private evidence, READY filtering, selected corrections, price provenance, cancellation during worker initialization, retry recovery, and cleanup safety. Finding identifiers in the older Sprint 4 inspection refer to different defects; always qualify the report when documenting them.

Run the current prerequisite unit suite, lint, typecheck, build, and relevant authenticated regression checks. If a live backend is unavailable locally, use the existing disposable CI backend and inspect its result before treating this gate as verified. Independent planning/template research may continue, but dependent feature implementation must wait for the gate.

## 4. Legal research gate and provenance

Before enabling a template, verify its current Lithuanian provisions using official consolidated law and VVTAT guidance. Existing repository `lastVerifiedAt` fields alone are insufficient evidence.

Starting sources:

- VVTAT written-request procedure: https://vvtat.lrv.lt/lt/kaip-pateikti-prasyma/
- VVTAT consumer rights and remedies: https://vvtat.lrv.lt/lt/veiklos-sritys-54/ne-maisto-produktai-55/vartotoju-teises-ir-garantijos-714/
- VVTAT consumer request guidance: https://vvtat.lrv.lt/lt/paslaugos-343/prasymai-344/vartotojo-prasymo-forma-345/
- Consolidated Mažmeninės prekybos taisyklės: https://e-seimas.lrs.lt/rs/actualedition/TAIS.137498/
- Directive 2011/83/EU: https://eur-lex.europa.eu/legal-content/LT/TXT/?uri=CELEX:32011L0083
- Current Lithuanian Civil Code and Vartotojų teisių apsaugos įstatymas: resolve their current official consolidated editions; verify the applicable national provisions, including remedies and written-response requirements.

These are research starting points, not certification of every legal path. Guidance can simplify or conflict with legislative text; record and resolve material differences rather than choosing the most convenient wording. Check effective dates and transitional rules, including any relevant right-to-repair implementation. Do not assume an EU directive automatically changes every purchase's national remedy or guarantee.

For every enabled template record source title, official URL, exact article/section, actual verification date, applicable effective dates, and a concise statement of the supported rule. Store this in ordinary project documentation such as `docs/complaint-legal-sources.md` and structured source metadata. Template/source versions must be identifiable in saved records.

If a material provision cannot be verified, keep the affected template unavailable, preserve the conservative engine result, and report the exact blocker. Never mark an inaccessible source as verified or insert invented article numbers. Do not disable unrelated verified functionality.

Do not create a universal repair deadline, claim that every product is returnable, guarantee replacement/refund after one year, or treat a paper receipt as the only possible proof.

## 5. Complaint types and eligibility

Implement these narrowly scoped document families, conditional on the actual current engine outputs and verified sources:

| Family | Document purpose | Guardrails |
| --- | --- | --- |
| `DEFECTIVE_PRODUCT` | Written complaint describing a defect and one supported remedy. | Offer repair/replacement only where supported; price reduction or contract termination/refund needs the engine's verified factual conditions. No default immediate refund. |
| `DISTANCE_WITHDRAWAL` | Notice of withdrawal from a qualifying distance goods contract. | Distinguish withdrawal from a defect complaint; require confirmed received date/applicable deadline and resolved exceptions. Do not require a reason or invent receipt of the notice by the seller. |
| `PHYSICAL_RETURN_REQUEST` | Request concerning a qualifying physical-store purchase or seller-consent route. | Preserve the distinction between a statutory route and voluntary seller permission. A consent request uses “prašau apsvarstyti”, not a claim that acceptance is mandatory. Do not treat exchange and refund as interchangeable. |

Map the actual structured result codes to document eligibility explicitly in a pure policy module. Do not classify using translated result strings, button labels, notes, or OCR text.

For unsupported, incomplete, private-seller, business-buyer, expired, ambiguous-category, or special-review results: preserve the current explanation and next steps; do not offer a definitive legal-demand document. A verified seller-consent branch is a distinct supported request, not a workaround for an unresolved classification.

Scope is existing goods workflows. Do not add services, non-delivery, chargebacks, compensation claims, manufacturer-guarantee enforcement, or cross-border jurisdiction decisions.

No standalone claim-only questionnaire that bypasses the legal engines. A generic “Pretenzijos” entry can lead users to their purchases and the appropriate existing flow.

## 6. Entry points and routes

Reuse current `/returns`, `/defective-product`, purchase context loading, and visual patterns.

Suggested private routes:

- `/purchases/[id]/complaints/new`: choose or resume the relevant legal assessment and review the proposed complaint.
- `/purchases/[id]/complaints/[complaintId]`: saved draft and generated versions.
- Narrow authenticated API endpoints for document downloads where required.

On eligible legal results for an owned saved purchase show **„Parengti pretenziją“**. For withdrawal use **„Parengti sutarties atsisakymą“**. For voluntary returns use **„Parengti prašymą pardavėjui“**.

Preserve public, signed-out use of the existing legal flows. A public result may explain that saving a document requires login and an owned saved purchase. Preserve only a narrowly validated destination through login; do not put questionnaire answers, contact data, or letter contents in URLs. If the assessment cannot survive login safely without new draft infrastructure, clearly ask the user to complete it again.

Do not accept a caller's `eligible=true`, remedy list, or legal result as authoritative. At the server boundary authenticate, load the owned purchase, validate submitted answers, and rerun the engine with a server-controlled current Vilnius civil date before saving/generating. Missing facts remain missing.

## 7. Review form

The review form must show the original purchase context, selected document type, request, editable factual fields, and attachment list.

Required, where applicable:

- Consumer full name and contact email.
- Seller name; optional user-confirmed seller contact/address. Do not invent contact details or use an unverified merchant lookup.
- Product name, purchase date, purchase channel, and received date when required by the selected flow.
- Receipt/order reference when available.
- Optional confirmed product price in EUR integer cents; do not substitute the entire receipt total.
- For defects: user-written defect description, discovery date if relevant to the engine, and one selected supported remedy. Prior repair/refusal facts must match the assessment.
- Document date, defaulted from the current Vilnius civil date and validated.
- Explicitly selected available evidence.

Only require an amount when the chosen request cannot be expressed accurately without it. A price-reduction request requires a clear validated reduction/target amount and explanation; never invent either. Never request more than the confirmed relevant amount.

Do not collect personal identity codes, card data, bank details, signatures, or home addresses as mandatory fields. Do not infer full name from an email or automatically create an identity profile table.

Explain: **„Patikrinkite duomenis. Dokumentą pardavėjui turėsite pateikti patys.“**

A purchase field correction within this form is a complaint-specific reviewed fact; it must not silently edit the purchase. If it contradicts a legal answer, rerun the assessment and require renewed confirmation. Offer an explicit link to edit the purchase.

## 8. Evidence behavior

Reuse owned purchase documents. Do not introduce another evidence bucket or duplicate original files.

- Default to no selection; show available filenames/types and let users confirm the list.
- Only owned READY documents belonging to this purchase can be selected.
- Revalidate selected documents before generation. Missing, pending, deleted, or inaccessible evidence produces a recoverable error.
- The letter lists selected attachments; the PDF does not embed receipt pixels or file contents.
- Explain **„Priedus pridėkite prie laiško atskirai.“** and retain existing private download controls.
- If there is no saved proof, show a warning and allow a truthful explanation of alternative proof. Never fabricate “čekis pridedamas”.
- Store evidence IDs plus filename/type snapshots for the generated version. These are historical descriptions, never authorization grants to retrieve deleted or foreign files.

Evidence bundling and VVTAT submission packages remain Sprint 7 work.

## 9. Deterministic document generation

Separate validation, eligibility, template rendering, persistence, and export under `src/features/complaints/`, following repository conventions. Domain functions must remain independently testable without React or Supabase.

A pure generator accepts validated reviewed facts, a server-recomputed decision, supported request, selected evidence metadata, and explicit date/template/source versions. It returns structured sections and plain text. HTML preview and PDF use that same canonical content.

Document contents:

1. Consumer and seller identification/contact details supplied by the user.
2. Document title appropriate to the family.
3. Document date and identifying purchase facts.
4. Defect/history description when applicable; no invented statement for withdrawal.
5. One clear supported request.
6. Carefully verified procedural wording appropriate to that document family.
7. Selected attachment list, only when present.
8. Consumer name.

Render user text as escaped plain text. User descriptions cannot inject markup, change template instructions, or add arbitrary legal clauses. Preserve Lithuanian characters and meaningful line breaks; use bounded field lengths.

Do not offer unrestricted editing of legally generated clauses in this sprint. Users may correct facts/descriptions and choose supported options, then regenerate. Show material uncertainty near the preview before confirmation.

Keep source links and educational guidance on the app review screen. Include legislative references in the letter only when verified and relevant; do not paste a large legal bibliography into it.

Do not apply defect-complaint response wording mechanically to a withdrawal notice. Do not conflate withdrawal, return shipment, reimbursement, and seller-response periods. No active deadline calculator or countdown is added here.

## 10. Persistence and immutable generated versions

Use the existing Supabase platform with additive migrations and updated types. Prefer a small `complaints` table and `complaint_versions` table; equivalent naming is acceptable.

Draft record includes:

- UUID, authenticated owner, owned purchase ID, document family.
- Validated assessment answers, reviewed facts/contact details, selected remedy/evidence IDs.
- Captured purchase version and template/source versions.
- Created/updated timestamps and optimistic concurrency version.

Generated version includes:

- Parent complaint and owner.
- Monotonic version number, generated timestamp, explicit document date.
- Immutable reviewed purchase/fact snapshot, validated legal answers and decision snapshot.
- Template/source provenance and selected evidence metadata snapshot.
- Canonical structured sections and exact generated plain text.

Use bounded, validated JSON where appropriate; do not build an event-sourcing platform. Draft saves are explicit, not keystroke autosave. A stable request identifier makes draft creation and generation safe to retry after lost responses. Back this with database uniqueness, not only disabled buttons.

Draft updates use atomic optimistic concurrency. Generation must check the draft version and current purchase version and write the final snapshot/version atomically in the database, using an appropriately secured RPC/transaction or equivalent. No unguarded read-then-write race. A purchase changed since review requires reload/reconfirmation, never a silent refresh of the document.

Generated versions cannot be edited in place. Draft edits create a new version only after explicit regeneration. Later purchase edits, evidence removal, or source updates do not rewrite an existing generated document. Show its generation date and that it records facts reviewed at that time; do not imply it proves present-day eligibility.

Store canonical content and generate PDF on demand from the saved immutable version. Do not store generated PDFs as purchase evidence or create an OCR target. Bound generation size and avoid a second Storage transaction.

## 11. RLS, ownership, and deletion

- Enable RLS on all new tables; ordinary users access only their own records.
- Enforce parent ownership with composite foreign keys or equivalent database constraints, not just UI checks.
- Derive ownership from the verified server session; never accept hidden form `user_id` values.
- Generated version writes are controlled by the validated generation path. Ordinary direct API access must not bypass immutability or parent ownership. If an RPC uses elevated function privileges, harden search_path, explicit auth checks, grants, and executable surface; prefer invoker security where feasible.
- No service-role client in app code. Authorization tests use two ordinary accounts and anonymous access.
- Reject forged parent/child combinations, foreign evidence IDs, and caller-supplied storage paths.
- Draft deletion requires confirmation and removes its generated versions. Deleting a purchase follows existing evidence cleanup safety and then removes associated complaints/versions; update confirmation text to disclose this.
- A complaint never prevents the owner from deleting an evidence file. Historical attachment descriptions may remain in its snapshot, while the app accurately reports current unavailability.
- No public document URLs, signed links in canonical text, analytics containing descriptions/contact details, or persistent browser caches of drafts.
- Private preview/export responses use `Cache-Control: private, no-store`; avoid logging document bodies.

Do not modify historical applied migrations. Test all migrations on a fresh disposable backend and report production migration readiness separately.

## 12. PDF, text, and copy

Required outputs:

- **„Atsisiųsti PDF“**: an A4 document with selectable text.
- **„Atsisiųsti tekstą“**: UTF-8 `.txt`.
- **„Kopijuoti tekstą“**: exact canonical text; show success only after clipboard success, with a selectable-text fallback where clipboard access fails.

Choose a maintained PDF library compatible with the installed project/runtime, verify its current official API, pin dependencies, and commit the lockfile. Embed a locally bundled font licensed for redistribution with Lithuanian glyph support. No runtime font CDN or arbitrary resource fetching.

PDF requirements: readable spacing/margins, wrapped long references, correct Lithuanian characters, page breaks without clipping, clear attachment list, and page numbering for multi-page documents. No fake digital signature, official institutional branding, or claim that a PDF is evidence of sending.

Use a sanitized generic filename, such as `pretenzija-2026-10-02-v1.pdf`; do not put personal names or arbitrary seller input into response headers. Authorize every preview/download request against both parent purchase and complaint/version.

Render representative PDFs to images during implementation and visually inspect a short letter, long description, multi-page attachments, and Lithuanian diacritics. Text extraction alone is insufficient layout verification. Browser print may be an enhancement; it does not replace the required real PDF download.

## 13. Draft and saved-document UX

On purchase detail add **„Dokumentai pardavėjui“** with drafts/generated documents, family, created date, and latest generated version. Existing purchase evidence remains a separate section.

Actions:

- **„Išsaugoti juodraštį“**
- **„Peržiūrėti dokumentą“**
- **„Patvirtinti ir parengti dokumentą“**
- **„Redaguoti juodraštį“**
- **„Parengti naują versiją“**
- **„Ištrinti dokumentą“**

Use document preparation labels rather than “Išsiųsta”. Saving or downloading does not start a deadline or change a case status.

After generation show: **„Dokumentas parengtas. Pateikite jį pardavėjui ir išsaugokite pateikimo įrodymą.“** Provide practical manual-delivery guidance and an official procedure link. No send button, mail provider integration, or auto-addressed outbound action.

Failed saves/generation preserve submitted values and explain the actionable issue. Expired sessions use safe return paths; unsaved sensitive data is not placed in URLs or localStorage. Explain when the user must reenter unsaved details. Saved drafts must reopen after logout/login.

Maintain mobile layout, associated labels, 44px touch controls, visible focus, keyboard operation, accessible errors/progress, and no horizontal overflow. Confirm destructive actions and warn before leaving changed unsaved drafts where supported.

## 14. Required verification

Keep all current legal, purchase, receipt, auth, concurrency, and real OCR tests. Add meaningful tests covering:

### Domain and validation

- Explicit result-code eligibility mapping for each supported family.
- Uncertain/category-review, private seller, business buyer, expired and incomplete paths cannot generate an unsupported legal demand.
- Supported repair/replacement and conditional refund/reduction; rejected tampered remedy and forged decision.
- Voluntary physical-return wording versus statutory wording; exchange versus refund distinctions.
- Valid withdrawal without a reason; verified deadline/exceptions reflected accurately.
- Missing/invalid consumer details, dates, amounts, price-reduction values, excessive text, and literal HTML/script input.
- Product price never replaced with receipt total; null price stays null.
- Attachment list matches explicit selection; absent proof is not invented.
- Fixed input/date/template yields the same canonical content with Lithuanian characters intact.

### Persistence and real backend

- Draft create/save/reopen/edit/delete with ordinary account A.
- Account B and anonymous clients cannot read/change A's draft, versions, or exports, through app routes and direct Supabase queries/RPCs.
- Forged purchase/complaint/version relationships and foreign evidence IDs are rejected.
- Retried draft create/generation and genuinely overlapping generation requests create at most one result for the same request identifier.
- Two-tab stale draft edit and purchase edits during review cannot overwrite or generate stale facts.
- Generation detects evidence deletion and does not leave a misleading successful version.
- Existing generated version remains unchanged after later purchase edits; explicit regeneration creates a new version.
- Direct database attempts cannot mutate immutable generated content or bypass secured generation controls.
- Purchase and complaint deletion remove new records without weakening existing Storage failure recovery.

### Browser and export

- Eligible defect and withdrawal flows reach a reviewed saved letter end to end; a voluntary physical-return example uses qualified wording.
- Draft persists after logout/login; current protected-route and public-flow behavior remains intact.
- PDF/text downloads contain the same saved facts as the preview; PDF has Lithuanian glyphs, selectable text, correct MIME/headers, and no private cache.
- Download/generation retry works after a failed response without duplicate versions.
- Copy success/failure states and selectable fallback work.
- Mobile preview/form behavior, keyboard focus, and long-text rendering are inspected.

Use synthetic data and receipts only. Clean test-owned records. Unit adapters do not prove RLS or database atomicity; mocked PDFs do not prove an actual export. Distinguish local results, CI results, emulated mobile, and real-device checks.

Use existing scripts, adapting names only to actual repository commands:

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
git diff --check
```

Also run the repository's authenticated disposable-Supabase and development-form checks, plus PDF render inspection. Keep dev/build output contexts separate. Ensure CI exercises new migrations, ordinary-user authorization, generation concurrency, and export.

Inspect exact-candidate CI after pushing. Do not call pending CI passed or count skipped authenticated cases as verification.

## 15. Existing follow-ups

- The supplied report observed Next/PostCSS audit entries. Run a current audit, record actual advisories and affected paths, and remediate compatible versions in a focused change if feasible. Avoid forced major upgrades or suppression. Material applicability remains a release assessment, not evidence of a demonstrated exploit.
- The user previously reported manual functionality working; that does not establish every named iPhone/Android camera, rotation, recovery, or visual test. Record actual results and remaining gaps.
- For this sprint, test the complaint review/download on actual iPhone/Safari and Android where available. If unavailable, provide a short manual checklist and mark pending.
- Disposable migrations do not prove production state. Do not modify a shared/production database, auth settings, or deployment configuration under this specification. Provide exact required additive migrations and rollout order.

## 16. Explicit exclusions

Do not implement:

- Seller email sending, automatic delivery, or a “sent” state inferred from export.
- Actual sending/receipt date capture, countdowns, deadline notifications, response tracking, case timelines, or background jobs; these belong to Sprint 6.
- VVTAT eligibility automation, evidence ZIPs, VTIS integration, or official submission; these belong to Sprint 7.
- LLM legal decisions, generative letter rewriting, paid providers, or AI chat.
- New OCR formats, multi-product accounting, warranty calendars, email import, bank integration, payments, subscriptions, family accounts, admin panels, or a broad redesign.

Do not implement these because the new document tables could support them later.

## 17. Implementation order and Git delivery

1. Resolve current baseline and verify/fix Pre-5 F1–F4; commit the prerequisite changes separately where needed.
2. Verify legal sources and define the explicit eligibility matrix before enabling document families.
3. Implement pure validation, policy, templates, and domain tests.
4. Add additive schema/RLS, atomic guarded generation, retry constraints, and live authorization tests.
5. Integrate legal result entry points, review, explicit draft saving, and version display.
6. Implement PDF/text/copy with a bundled font and visually verified layout.
7. Complete browser, authenticated backend, regression, and exact-candidate CI verification.
8. Update README and legal-source documentation; review diff, secrets, and dependency changes; commit and push the finished feature branch.

Store this spec at `docs/sprint-05-complaints.md`. Document setup, migrations/types provenance, supported/blocked document families, privacy, snapshots, generation retries, exports, and limitations.

Use neutral project branch names and ordinary commit messages, for example `feat: add reviewed seller complaint documents`. Add no generated-by banners, assistant attribution, assistant co-author trailers, or agent scratch files. Preserve historical commits rather than rewriting existing attribution.

Push to the existing repository. Main merge and production deployment are separate tasks. If a remote feature push triggers preview deployment, verify the destination backend can support the required migrations before publishing incompatible behavior; do not silently modify its database.

## 18. Acceptance and handoff

Sprint 5 is implemented when:

- Pre-5 F1–F4 are demonstrably fixed without receipt/evidence regressions.
- Verified eligible defect, distance-withdrawal, and physical-return request families work; any unverified family remains blocked and explicitly reported.
- A user reviews facts and one supported request before generation.
- Server generation reruns the legal engine and enforces ownership/current versions.
- Drafts and immutable generated versions persist privately with retry-safe, guarded writes.
- PDF/text/copy match saved content; real PDF layout and Lithuanian glyphs are verified.
- Cross-account, anonymous, stale-edit, overlapping generation, and deletion checks pass on a real disposable backend.
- Existing public legal flows, private purchase vault, OCR, and original evidence behavior remain intact.
- Required checks pass for the delivered commit and code/docs/migrations are committed and pushed.

Unavailable source/backend/device checks must be listed as blockers or pending acceptance; do not label them passed or fully verified. If blocked, still complete independent authorized work and push a clearly described safe candidate where possible.

Completion report must include:

1. Starting/final branch and SHA, prerequisite fixes and their verification.
2. Delivered document families, blocked paths, and legal-source verification dates.
3. Schema/RLS/migration names, typed-schema provenance, and setup requirements.
4. Snapshot/concurrency/retry behavior and private export implementation.
5. Local/CI test results, actual PDF render inspection, live authorization/concurrency results, and device status.
6. Current audit findings and concrete remaining limitations.
7. Pushed branch/commit and exact-candidate CI link; explicitly state that main was not merged and production was not changed.

The user should finish this sprint able to turn their saved purchase and confirmed legal answers into a clear Lithuanian document they can send to the seller themselves.
