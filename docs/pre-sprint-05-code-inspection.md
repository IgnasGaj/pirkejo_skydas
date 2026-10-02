# Pre-Sprint 5 code inspection — Pirkėjo Skydas

Date: 2026-10-02

Repository: [IgnasGaj/pirkejo_skydas](https://github.com/IgnasGaj/pirkejo_skydas)

Inspected branch: main

Inspected commit: `226cb76689865dd5b5901f47a9b3cb50f3a0ee77`

Method: read-only source review, fresh dependency installation, local checks, targeted probes, and inspection of the GitHub CI logs for this exact commit.

## Verdict

**Hold the Sprint 5 implementation that generates complaints from these decisions and purchase records until F1–F4 are resolved.** Sprint 5 planning can proceed. The existing build is green, and Sprint 4.2 is present on main, but green tests do not cover the four cases below.

One high-priority legal deadline defect and three medium-priority receipt/data integrity defects remain. No cross-account evidence-access bypass was identified in the reviewed paths. This is a source and test inspection, not certification of all legal classifications or production infrastructure.

No application code, migrations, production data, commits, or branches were changed by this inspection.

## Findings

| ID | Priority | Finding | Evidence |
| --- | --- | --- | --- |
| F1 | P1 | Distance withdrawal period expires before the applicable next working day | Executed actual date helper; checked official guidance |
| F2 | P2 | A standalone foreign currency code is ignored and amounts become EUR suggestions | Executed actual parser |
| F3 | P2 | Reauthentication from a reviewed save loses stable purchase/document IDs | Traced server action, auth redirect, and new-page logic |
| F4 | P2 | A stale manual edit silently overwrites newer purchase data | Source review and injected-adapter probe of actual updater |

### F1 — Extend the distance withdrawal deadline when its final day is a non-working day

Location: [dateRules.ts, lines 11–16](https://github.com/IgnasGaj/pirkejo_skydas/blob/226cb76689865dd5b5901f47a9b3cb50f3a0ee77/src/features/returns/domain/dateRules.ts#L11-L16), used by the DISTANCE branch in `evaluateReturnCase.ts`.

The helper compares elapsed calendar days with 14. It never adjusts the final day for a Saturday, Sunday, or public holiday. Consequently, the distance flow can say that the ordinary withdrawal term has ended while it is still available.

Executed example:

```text
Received: 2026-09-19
Ordinary day 14: Saturday, 2026-10-03

asOf 2026-10-03 -> WITHIN_14_DAYS
asOf 2026-10-04 -> EXPIRED
asOf 2026-10-05 -> EXPIRED
```

For this distance-withdrawal example, the deadline should extend through Monday, 2026-10-05. The [European Commission guidance, section 6.1.1, printed pages 37–38](https://commission.europa.eu/system/files/2019-07/crd_guidance_en_0_updated_0.pdf) explains calendar-day counting and the extension to the next working day under Regulation 1182/71, Article 3(4). The [2021 Commission notice](https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=OJ%3AC%3A2021%3A525%3AFULL) also indexes this rule; its full text was blocked by a robot check in this environment.

Required change: introduce a deadline calculation appropriate to the legal flow, include the applicable public-holiday calendar, and compare the current date with the adjusted deadline. Keep the event day excluded and the final day included. Do not simply convert all fourteen days to working days.

Acceptance: distance-flow tests for Saturday and Sunday endings, a Lithuanian holiday ending, consecutive holiday/weekend days, the extended final day, and the following day. Preserve Vilnius civil-date behavior.

Related review item: the physical-return helper shares this calculation, and `sellerResponseDeadline` also adds exactly 14 calendar days. Verify the applicable Lithuanian national deadline provisions before extending those flows; this finding's verified legal conclusion is specifically about distance withdrawal.

### F2 — Suppress prices when a foreign currency marker appears on its own line

Location: [currencyMarkers.ts, lines 35–59](https://github.com/IgnasGaj/pirkejo_skydas/blob/226cb76689865dd5b5901f47a9b3cb50f3a0ee77/src/features/receipts/domain/currencyMarkers.ts#L35-L59), `parseReceiptText.ts`, and `currencyMarkers.test.ts`.

Sprint 4.2 recognizes a much broader set of codes next to an amount or after a currency label. A code on its own line is deliberately ignored; a current test asserts that `CHF\nCoffee 5.00` is safe.

Executed parser input:

```text
SHOP
CHF
2026-10-01
Coffee 5.00
TOTAL 5.00
```

Actual result: product amount 500 cents, receipt total 500 cents, and no currency warning. The application persists prices as EUR, so this can offer CHF 5.00 as EUR 5.00 without flagging the mismatch. User review mitigates the impact but does not satisfy the conservative currency safeguard.

Required change: treat an isolated known foreign currency code in plausible receipt currency context as unresolved/non-EUR evidence and suppress numeric EUR suggestions. Keep the original OCR text and allow a consciously entered manual EUR price. Preserve false-positive protection for ordinary words such as NOKIA, CADBURY, and SEKUNDĖ.

Acceptance: whole-receipt fixtures with standalone CHF, SEK, NOK, and CAD lines; wrapped currency/amount lines; existing labelled and adjacent-code cases; EUR and ordinary-word controls. Assert both product prices and receipt totals are suppressed.

### F3 — Preserve reviewed-save identity across an expired session

Location: [saveReviewedPurchase, lines 23–27](https://github.com/IgnasGaj/pirkejo_skydas/blob/226cb76689865dd5b5901f47a9b3cb50f3a0ee77/src/features/receipts/data/actions.ts#L23-L27), `src/features/purchases/data/auth.ts`, and `src/app/purchases/new/page.tsx`.

The new page retains validated `draft` and `document` UUIDs in its login return path. The save action calls `requirePurchaseUser("/purchases/new")` before reading those IDs. If the session is no longer valid during a retry, login returns to the plain new page, which generates fresh UUIDs.

Reproduction to cover: save the purchase with a receipt failure; expire/revoke the session; retry from the existing review form; sign in. The original purchase/document identity is lost from the recovery route. A subsequent save can create a second purchase instead of finishing the original pending attachment.

This is a traced control-flow finding; the expired-session interaction was not reproduced against a live backend in this inspection.

Required change: validate the submitted UUIDs before constructing the authentication return path and preserve them through the safe-return-path mechanism. Keep database operations behind authentication. Reauthentication cannot restore a browser File automatically, so instruct the user to reselect the original receipt while recovering the same purchase.

Acceptance: an authenticated browser test with a partially saved purchase, invalidated session, reauthentication, and receipt retry. Assert the original IDs survive, one purchase remains, original bytes are attached, and invalid IDs cannot create an unsafe redirect.

### F4 — Apply optimistic concurrency to ordinary purchase edits

Location: [editPurchaseAction, lines 51–67](https://github.com/IgnasGaj/pirkejo_skydas/blob/226cb76689865dd5b5901f47a9b3cb50f3a0ee77/src/features/purchases/data/actions.ts#L51-L67), [purchases.ts, lines 39–49](https://github.com/IgnasGaj/pirkejo_skydas/blob/226cb76689865dd5b5901f47a9b3cb50f3a0ee77/src/features/purchases/data/purchases.ts#L39-L49), and `PurchaseForm.tsx`.

Receipt corrections compare `updated_at` and use `updatePurchaseIfCurrent`. Ordinary edits write all submitted fields using only owner and purchase-ID filters.

Example: tabs A and B start with “Old seller.” A corrects the seller. B changes only notes and submits its stale form. B writes “Old seller” back while displaying a successful update. This can silently invalidate a later complaint's seller, dates, or price.

An injected-adapter probe calling the actual updater twice confirmed the stale seller is written back and the query filters contain only `user_id` and `id`. This probe demonstrates the updater behavior; it is not a live concurrent database test.

Required change: carry the edit form's original `updated_at` version and reuse the guarded update path. On conflict, preserve the submitted values and show a clear reload/review message. Keep ownership filters and validation.

Acceptance: a two-tab authenticated test where one tab changes seller/date/price and the other submits stale notes. The stale submission must not overwrite newer values. A current-version edit must still succeed.

## Verification evidence

| Check | Local inspection result | Exact-commit CI evidence |
| --- | --- | --- |
| Fresh `npm ci` | Passed; OCR assets prepared | Passed |
| ESLint | Passed | Passed |
| TypeScript | Passed | Passed |
| Unit/component tests | 197 tests passed in 13 files | 197 passed |
| Production build | Passed | Passed |
| Public browser suite | Not rerun: Chromium installation failed with truncated/empty ZIP downloads | 5 passed, 6 authenticated cases skipped |
| Disposable Supabase migrations | Not run locally; Docker/Supabase runtime unavailable | Both migrations applied |
| Authenticated browser suite | Not run locally | 6 passed |
| Authenticated development forms | Not run locally | Passed |
| `git diff --check` / tracked checkout | Passed; no tracked changes | — |
| Dependency audit | Two affected package entries: Next moderate, nested PostCSS high | Audit is not a required CI step |

[CI run 36971822950](https://github.com/IgnasGaj/pirkejo_skydas/actions/runs/36971822950) is successful for the inspected SHA. Its logs include real OCR, authenticated purchase/evidence workflows, two-account isolation, receipt claim handling, upload-conflict recovery, and deletion during review.

Coverage limits matter: injected unit adapters do not prove database transaction behavior. The live claim case interleaves claim operations; it does not launch two complete save server actions simultaneously. The development-form script checks rendering, interaction, and page errors; it does not independently establish every development-server submission path. Production authenticated tests exercise submissions. No actual iPhone/Safari, Android, rotated camera capture, or manual mobile visual review was performed here.

## Scope and positive findings

Reviewed the application routes, authentication/session middleware, legal return and defect engines, purchase forms and data access, receipt parsing/review/OCR cancellation, evidence endpoints and cleanup, database migrations/RLS/Storage policies, OCR preparation scripts, dependency lockfile, CI workflow, and relevant tests.

The earlier Sprint 4 fixes remain in the inspected ancestry. The reviewed-save path now reserves receipt metadata before upload, binds the file hash, uses a claim token, and avoids deleting shared successful evidence during retries. READY filtering prevents pending attachments being treated as usable evidence. Receipt corrections use guarded updates, discounted prices are suppressed, review prices track their source, and worker initialization can be cancelled.

Owner filters and database policies align in the reviewed purchase/document paths. Evidence image access validates authentication, parent IDs, metadata, size, and MIME, and returns private/no-store responses. The signed-download path is short lived. These observations and the two-account CI tests support the current isolation design; they do not constitute a penetration test.

Only `.env.example` is tracked as an environment configuration file. A targeted current-tree credential-pattern scan found no private-key/token candidates. This did not scan every historical commit or validate secret rotation.

## Additional follow-ups

1. **Dependency maintenance:** `npm audit` reports Next's nested `postcss@8.4.31`; Tailwind/Vite use `8.5.28`. The [PostCSS maintainer advisory](https://github.com/postcss/postcss/security/advisories/GHSA-r28c-9q8g-f849) describes source-map file disclosure when processing attacker-controlled CSS. The reviewed app does not expose a user-CSS processing endpoint, so a remote application exploit was not established. Plan a compatible dependency remediation and rerun all checks; avoid a blind forced major upgrade. Track [the additional incomplete-fix advisory](https://github.com/postcss/postcss/security/advisories/GHSA-fxqj-rqcc-2cmp) as well.
2. **Legal source provenance:** stored `lastVerifiedAt` values are repository claims. Before complaint generation, verify the current national provisions for seller-response deadlines and classifications and record the actual provisions used. Some official sites were inaccessible to automated retrieval here.
3. **Mobile acceptance:** perform visual and camera-file tests on actual iPhone/Safari and Android, including rotated photos, cancellation, failed-save recovery, and reselecting a receipt after login. Automated overflow checks are useful but insufficient for this acceptance.
4. **Deployment migration:** the receipt-claim migration must exist in any target database before this code is used there. CI proves it applies to a disposable database; production migration state was not inspected or changed.

## Recommended next work package

Resolve F1–F4 in a focused hardening change before Sprint 5 relies on the outputs. Add the acceptance cases specified above, then run fresh install, lint, typecheck, all unit/component tests, production build, public browser tests, authenticated disposable-backend tests, and the development-form check. Include a genuine overlapping-save browser/backend case if strengthening the concurrency evidence.

Have the user complete the real-device checklist and record results. Inspect the final commit and exact-head CI before treating the hardening work as complete.
