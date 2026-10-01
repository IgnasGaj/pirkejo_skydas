# Pirkėjo Skydas — Sprint 4 inspection

Reviewed: 2 October 2026 (Europe/Vilnius).

**Verdict: hold the merge.** The core receipt-scanning architecture is implemented and the standard checks pass, but this inspection found one high-priority evidence-loss defect and five medium-priority correctness/resource defects. Fix these in a focused hardening pass before moving to Sprint 5. Authenticated and device verification also remain incomplete in this inspection.

## Exact scope and repository state

- Repository: https://github.com/IgnasGaj/pirkejo_skydas
- Inspected branch: `feature/sprint-04-receipt-scanning`.
- Inspected SHA: `e432f0419dbe6b784f9525e66a59037a61fa7ceb`.
- Main SHA observed: `fce8d354d6771d6d433b17ef68173f1a90cd14c1`.
- Sprint commits: `6f7e156` (receipt scanning) and `e432f04` (retain receipt when switching to manual entry).
- The Sprint 3.1 hardening commit is an ancestor of this feature branch. Its history and changes are preserved.
- No pull requests were returned by the repository PR search at review time.
- Compared the complete Sprint 4 diff with main, inspected the parser, OCR adapter, both review flows, server actions, private image endpoint, upload/retry services, schemas, RLS migration, asset preparation, documentation, and tests.
- The attached Sprint 4 specification matches `docs/sprint-04-receipt-scanning.md` in substantive content; the attachment has one extra trailing blank line.
- Inspection only: no implementation files were changed, no commits pushed, no merge or deployment performed, and no production database accessed. Temporary reproduction probes were kept outside the repository.

## Findings

Priority meanings: **P1** = fix before merge because evidence can be lost; **P2** = correctness or required lifecycle behavior needs correction before sprint acceptance. No cross-account data disclosure was demonstrated. Static inspection is not a substitute for live authorization tests.

### F1 — P1: overlapping save retries can delete successfully saved evidence

Code: [saveAttempt.ts](https://github.com/IgnasGaj/pirkejo_skydas/blob/e432f0419dbe6b784f9525e66a59037a61fa7ceb/src/features/receipts/domain/saveAttempt.ts#L24-L32), combined with [upload.ts](https://github.com/IgnasGaj/pirkejo_skydas/blob/e432f0419dbe6b784f9525e66a59037a61fa7ceb/src/features/purchases/domain/upload.ts#L8-L14).

The retry service considers an object an orphan whenever it has not yet found a metadata row. That is unsafe while another request is between upload and metadata insertion. The submit button prevents some repeated clicks, but it cannot serialize a retry from another tab or a retry made while the first request's response is delayed.

Reproduced with a deterministic injected adapter using the actual `saveAttempt()` implementation:

1. Request A uploads the receipt and pauses before metadata insertion.
2. Request B reads no metadata, finds A's object, and removes it as an orphan.
3. B uploads the receipt, inserts its metadata, and returns success.
4. A resumes; its metadata insert conflicts with the row B inserted.
5. A's metadata-failure cleanup removes the shared object path.

**Observed result:** B reported success; the document row existed; its Storage object no longer existed. This is an adapter-level reproduction of the concurrency interleaving, not a live Supabase run.

Required fix: establish exclusive ownership of each document save attempt at the database boundary, with a safe recovery strategy for interrupted attempts. Do not delete an object solely because one earlier metadata read was empty. Cleanup must not delete evidence now owned by another successful request. Add a deterministic overlapping-request regression test, then repeat the race against disposable Supabase. Stable UUIDs alone do not make these operations safe.

### F2 — P2: foreign-currency symbols can become EUR suggestions

Code: [parseReceiptText.ts](https://github.com/IgnasGaj/pirkejo_skydas/blob/e432f0419dbe6b784f9525e66a59037a61fa7ceb/src/features/receipts/domain/parseReceiptText.ts#L58-L75).

The non-EUR expression places word boundaries around `$`, `£`, and `zł`. These boundaries do not match ordinary symbol formatting reliably.

Actual parser probes:

```text
SHOP
Coffee $5.00
TOTAL $5.00
```

```text
SHOP
Coffee £5.00
TOTAL £5.00
```

**Observed in both cases:** product amount `500` cents, receipt total `500` cents, and no currency warning. The review UI labels those values as EUR. User confirmation does not remove the requirement to avoid presenting unsupported currency as EUR.

Required fix: handle symbols independently of word-delimited currency codes; conservatively suppress EUR amounts when another currency is detected. Add tests for symbols before/after amounts, spacing, Polish zł, and mixed currencies.

### F3 — P2: separate discount lines leave an undiscounted product price without a warning

Code: [parseReceiptText.ts](https://github.com/IgnasGaj/pirkejo_skydas/blob/e432f0419dbe6b784f9525e66a59037a61fa7ceb/src/features/receipts/domain/parseReceiptText.ts#L62-L75).

Reproduction:

```text
SHOP
Kava 5,00
Nuolaida -1,00
TOTAL 4,00 EUR
```

**Observed:** `Kava` is offered at `500` cents, receipt total is `400` cents, and warnings are empty. Discount lines are excluded before they can make the associated product amount ambiguous. The problem also occurs with a receipt-level discount that cannot safely be allocated to one product.

Required fix: detect discount context before finalizing product-price suggestions. When allocation is unclear, keep the product candidate but leave its price empty and show a Lithuanian warning. Do not infer the product's final price from the total. Add adjacent-line and receipt-wide discount fixtures.

### F4 — P2: existing-receipt review can carry one product's price onto another product

Code: [ExistingReceiptScanner.tsx](https://github.com/IgnasGaj/pirkejo_skydas/blob/e432f0419dbe6b784f9525e66a59037a61fa7ceb/src/features/receipts/components/ExistingReceiptScanner.tsx#L64-L67).

Selecting a candidate with an unknown amount uses `previous.price`. Therefore:

1. Select product A with a known amount, for example €3.50.
2. Select product B whose quantity/discount makes its amount unknown.
3. Product name becomes B, but proposed price remains €3.50 from A.
4. Selecting the product and price correction checkboxes can save that mismatched pair.

Manually changing the proposed product name likewise leaves an automatically filled amount associated with the old product. This finding is verified from the state-update logic; the authenticated UI was not executed locally.

Required fix: track whether a price is manual or tied to an OCR candidate. Clear an automatically suggested price when the selected product changes to one with an unknown amount or when its name is manually replaced. Preserve an intentionally entered manual price under an explicit policy. Reuse the new-purchase flow's price-provenance handling where appropriate. Add UI tests for product switching and manual name edits.

### F5 — P2: cancellation cannot terminate a worker still being initialized

Code: [ocr.ts](https://github.com/IgnasGaj/pirkejo_skydas/blob/e432f0419dbe6b784f9525e66a59037a61fa7ceb/src/features/receipts/client/ocr.ts#L47-L75).

`this.worker` is assigned only after `createWorker()` resolves. In the installed Tesseract.js 7.0.0 source, the underlying Worker is created before core/language initialization completes. Cancellation or timeout during that initialization therefore has no worker handle to terminate.

Reproduced with a deferred factory injected into the actual `ReceiptOcrSession`:

- Cancel while the factory is pending: scan rejects with `cancelled`, but termination count is zero.
- Resolve the factory afterward: termination finally occurs.
- If initialization stays pending, that eventual termination never occurs through this code path. Starting a replacement scan can overlap with the old initializing worker.

Required fix: make worker initialization cancellable and retain a termination handle from worker creation onward, including failed initialization. Ensure cancel, timeout, unmount, and new-image selection stop preparation as well as recognition. Add pending-initialization and failed-initialization tests plus a browser cancellation check. Existing tests cover cancellation after the worker is available.

### F6 — P2: address and cashier lines are offered as sellers

Code: [parseReceiptText.ts](https://github.com/IgnasGaj/pirkejo_skydas/blob/e432f0419dbe6b784f9525e66a59037a61fa7ceb/src/features/receipts/domain/parseReceiptText.ts#L3-L38).

Actual probes with a valid company line immediately afterward:

| First line | Suggested seller | Expected handling |
| --- | --- | --- |
| `Vilniaus g. 12` | `Vilniaus g. 12` | Exclude address; consider company header |
| `Kasininkas Jonas` | `Kasininkas Jonas` | Exclude cashier; consider company header |

The stem alternatives such as `KASININK` are followed by a word boundary, so ordinary inflected words such as `Kasininkas` escape exclusion. Common Lithuanian street abbreviations are also missed.

Required fix: make exclusion rules work with Lithuanian inflections and common address/terminal formatting. When header interpretation is uncertain, leave the seller blank or present alternatives. Add address, cashier, company code, VAT, terminal, and bank/acquirer fixtures.

## Verification results

| Check | Result and scope |
| --- | --- |
| Clean `npm ci` | Passed locally; same-origin OCR assets prepared and archive/raw checksums verified |
| `npm run lint` | Passed locally |
| `npm run typecheck` | Passed locally |
| `npm test` | Passed locally: 122 tests in 10 files |
| `npm run build` | Passed locally using Next.js 15.5.27; no simultaneous dev process |
| `git diff --check origin/main...HEAD` | Passed |
| Targeted parser probes | Reproduced currency, discount, address, and cashier defects using actual parser code |
| Targeted retry probe | Reproduced evidence deletion under overlapping save requests with injected storage/metadata behavior |
| Targeted lifecycle probe | Reproduced delayed worker termination during initialization |
| Chromium installation | Blocked locally: repeated browser downloads were empty/truncated and failed ZIP validation |
| Local `npm run test:e2e` | Attempted: 5 tests failed at browser launch because the executable was unavailable; 4 authenticated tests skipped. No local browser assertions ran |
| Exact-head GitHub CI | Passed: [run 36937958397](https://github.com/IgnasGaj/pirkejo_skydas/actions/runs/36937958397); inspected job steps and logs |
| CI browser suite | Logs show 5 passed and 4 skipped. The five include the real same-origin OCR smoke test |
| Authenticated Sprint 4 lifecycle / live RLS | Not rerun here: no Docker/Supabase CLI or disposable local backend/test credentials available. CI also skipped these tests |
| Authenticated `/purchases/new` and edit-form historical webpack error | Not reproduced or cleared in this inspection; a successful build alone is insufficient |
| Desktop/mobile review visual QA | Not performed here because local browser execution was blocked |
| Actual iPhone/Safari and Android capture, WebP, rotated receipts | Not performed; browser emulation would not establish actual-device behavior |
| `npm audit --json` | Exit 1: two existing entries, Next.js and its nested PostCSS; one moderate and one high entry. This is a pre-existing dependency issue, not a newly introduced OCR finding |

Local runtime: Node.js 24.19.0. README recommends Node.js 22; GitHub CI is configured for Node.js 22.

The CI real OCR test directly invokes the locally served Tesseract distribution on a synthetic canvas. It establishes real worker/model recognition and same-origin asset use in that test. It does not exercise the application's cancellation or initialization-failure lifecycle. The authenticated test does exercise the application scanner, but it is opt-in and was skipped in the inspected CI run.

## Requirements and security assessment

| Sprint area | Inspection outcome |
| --- | --- |
| Hardening baseline | Preserved; feature branch descends from current main |
| Minimum signature length | Fixed for all supported signatures; regression cases exist |
| OCR assets | Exact Tesseract.js/core 7.0.0, checked-in lit/eng models, same-origin preparation hooks and checksums |
| Lazy OCR loading | Adapter uses dynamic import at scan invocation; CI smoke checks no `/ocr/` resources on home before explicit invocation |
| New purchase workflow | Implemented with original preview, editable fields, one product, explicit save, and UNKNOWN initial channel |
| Manual/unsupported fallback | Implemented; selected receipt retained when switching to manual mode; PDF/HEIC/HEIF storage preserved |
| Existing receipt workflow | Implemented with private image loading, selected field corrections, and stale `updated_at` rejection; F4 requires correction |
| Total vs product price | Distinct data fields and UI labels; no blanket total-to-product copying; discount interpretation remains defective |
| Legal facts | OCR result exposes no channel, delivery date, product classification, guarantee, remedy, or legal decision; legal-engine code was not changed by the sprint |
| Privacy | OCR text is rendered as escaped text; no new persistent raw-text table, OCR service, or text analytics found in the inspected paths |
| Ownership | Server session determines ownership; owned-row queries and existing composite FK/RLS are reused; private route resolves database paths and has private/no-store headers |
| Private image validation | Route checks ownership via metadata query/RLS and checks stored size/MIME plus downloaded size. It does not repeat byte-signature checks; initial app uploads do |
| Partial save | Truthful partial-success text, stable IDs, owned-purchase recovery, and retry controls implemented; concurrent retry safety is not met (F1) |
| OCR lifecycle | Recognition cancellation, stale-result guards, 90-second timeout, object URL cleanup, and 20 MP check exist; initialization termination is incomplete (F5) |
| Accessibility | Lithuanian labels/statuses, keyboard controls and large buttons present. Scanner failure focuses its alert; server save/correction errors do not explicitly move focus to their alert. No full accessibility/browser audit completed |
| Migrations/types | No new Sprint 4 migration or OCR/draft/job table. Existing types retained; README distinguishes migration-derived types from deployed-backend verification |
| Scope | No paid OCR, LLM extraction, complaint generator, PDF rendering, HEIC conversion, bulk import, or legal-engine expansion added |

Ownership checks look appropriately scoped in source, but this report does not certify live RLS. Signed URLs remain bearer links; unauthorized issuance must be tested separately from access to an already-issued link.

## Test coverage gaps

The green suite misses the reproduced cases above. In particular, sequential save retries are tested, but overlapping retries are not. Lifecycle tests inject an already obtainable worker and do not cover an initializing worker that cannot be cancelled. There are no automated browser assertions for application-level cancellation, late/stale review results, or the existing-review price association defect.

The opt-in backend tests cover scan-assisted saving, original-byte hash comparison, private loading, selected corrections, stale edits, near-limit uploads, unsupported PDF fallback, and restoring an existing purchase for retry. The partial-save restoration test pre-inserts a purchase; it does not inject a real app upload failure. Its near-limit upload uses the ordinary attachment flow, rather than the new reviewed-save action. Add fault-injected UI/service coverage for those paths.

No live claims should be inferred from CI skipping authenticated cases. Earlier Sprint 3 backend verification does not verify these new Sprint 4 actions or routes.

## Acceptance plan

1. Fix F1 first, with a test where two requests overlap at upload/metadata boundaries and successful evidence survives every interleaving.
2. Fix F2–F4 and F6 with synthetic receipt fixtures and product/price review tests. Keep uncertain values blank with Lithuanian warnings.
3. Fix F5 with a cancellable initialization design and regression coverage for pending/failed preparation.
4. Repeat clean install, lint, typecheck, all unit tests, production build, and real OCR browser checks.
5. Run the authenticated suite against disposable Supabase with two ordinary accounts. Add concurrent save, actual partial-failure retry, deletion during review, forged ID combinations, and direct RLS/Storage denial checks. Verify cleanup and original receipt bytes.
6. Inspect desktop/mobile review layouts and test actual iPhone/Safari plus Android capture and rotated images when available. Explicitly record any device checks still pending.
7. Repeat the authenticated dev/production purchase-form runtime check using separate output directories or separate checkouts.

**Merge recommendation:** do not merge the inspected SHA as completed Sprint 4. A focused Sprint 4.1 hardening pass is warranted. This is an inspection report, not a claim that the fixes have been implemented.
