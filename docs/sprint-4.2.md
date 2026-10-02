# Pirkėjo Skydas — Sprint 4.2
## Complete currency safeguards, merge verified Sprint 4 into main, and start a mobile-accessible local preview

Repository: https://github.com/IgnasGaj/pirkejo_skydas.git

Read this entire specification before acting. This task includes implementation, verification, normal Git delivery to `main`, and starting the app on the user's computer for phone access. Do not stop after writing a plan.

Developer discussion/documentation: English. All user-facing messages, warnings, labels, and accessibility text: Lithuanian.

## 1. Outcome and scope

1. Finish the remaining non-EUR receipt safeguard without breaking ordinary Lithuanian/EUR receipt parsing.
2. Add regression tests and preserve the completed Sprint 4/4.1 fixes.
3. After verification, merge all intended Sprint 4 work into `main` and push normally.
4. Run the merged application locally, accessible from the user's phone on the same trusted Wi-Fi, and leave the server running.

This is a focused follow-up, not a redesign or a new feature sprint. Do not add currency conversion, multi-currency purchase records, paid OCR, complaints, reminders, or new legal logic.

Store this specification in `docs/sprint-4.2.md` and update relevant README instructions.

## 2. Baseline and work preservation

Latest reviewed feature branch: `feature/sprint-04-receipt-scanning`.

Reviewed head: `f9dd9836be1fc4294faa4cd05f5c37d91db01af3`.

This is a historical anchor, not an instruction to downgrade newer code. Fetch current refs, inspect repository instructions, remotes, current branch, status, and branch ancestry. Read:

- `docs/sprint-04-receipt-scanning.md`
- `docs/sprint-04-inspection.md`
- README and current CI workflow
- Receipt parser, currency fixtures, save-claim migration, review-price handling, and OCR lifecycle code

The reviewed branch includes the Sprint 3.1 hardening and fixes for F1–F6. Preserve those changes, particularly database-backed receipt claims, byte hashes, private evidence, selected corrections, stale-update guards, price provenance, and initialization cancellation.

Continue on the current Sprint 4 feature branch where appropriate. Preserve unrelated uncommitted changes; do not blindly stage the worktree, reset, clean, overwrite environment files, rewrite history, or force-push. If the original checkout is blocked, a separate checkout/worktree is acceptable. The final preview must still run on the user's computer, not merely inside an unreachable remote container.

Record actual starting and final SHAs. Inspect newer changes before deciding anything is already fixed.

## 3. Remaining confirmed defect

In the reviewed code, `src/features/receipts/domain/parseReceiptText.ts` recognizes `$`, `£`, USD, GBP, PLN, RUB, and zł as non-EUR, but misses other explicit currencies.

Each of these inputs currently offers product amount `500` cents and total `500` cents with no currency warning:

```text
SHOP
Coffee 5.00 CHF
TOTAL 5.00 CHF
```

The same reproduction works with `SEK`, `NOK`, and `CAD`. The review labels those values EUR. That violates the existing extraction contract even though the user can edit suggestions.

## 4. Currency handling requirements

Implement a small, deterministic currency-marker helper or equivalent logic in the receipts domain. Keep parsing pure, bounded, and independent of runtime network calls.

- Recognize explicit non-EUR ISO currency codes beyond the four reported reproductions, using a maintainable checked-in set with documented provenance. Include at least CHF, SEK, NOK, DKK, CAD, AUD, NZD, JPY, CNY, INR, CZK, HUF, RON, BGN, TRY, UAH, and existing supported codes.
- Recognize common non-EUR symbols conservatively, including existing `$`, `£`, and zł plus yen/yuan and rupee markers. Do not put word boundaries around punctuation symbols. An ambiguous marker such as `$` is enough to prevent a EUR assumption; do not guess which dollar currency it means.
- EUR/€ alone must not trigger a non-EUR warning.
- Detect codes/markers before and after amounts, with normal spaces, non-breaking spaces, and realistic punctuation/case variants. Use letter/token boundaries that do not match inside product names or ordinary words.
- Where a receipt has an explicit non-EUR marker, keep product-name suggestions available but suppress monetary suggestions as EUR: product amounts remain null, and receipt total remains null.
- Mixed EUR/non-EUR receipts must also suppress monetary suggestions conservatively; do not allocate currencies or convert amounts.
- Preserve the clear Lithuanian warning: `Čekyje aptikta kita valiuta; EUR sumos nesiūlomos.`
- An unresolved currency marker associated with an amount must not silently become EUR. If recognition is ambiguous, warn and leave amounts empty rather than claiming a conversion or inventing a currency.
- Do not classify every uppercase three-letter word as a currency. Protect ordinary receipt headers, VAT terms, product names, and existing EUR/no-marker Lithuanian fixtures from false positives.
- Preserve the existing behavior for ordinary Lithuanian receipts with no explicit currency marker; do not make all prices unusable as an incidental change.
- Do not change confirmed purchase schemas, EUR-only persistence, or manual price entry. The fix concerns OCR suggestions.
- Do not add merchant templates or a full financial accounting model.

If currency provenance uses an authoritative source, check it while implementing and document the chosen snapshot. Do not rely solely on environment-dependent `Intl` lists or download a currency catalog at runtime.

## 5. Required regression tests

Use synthetic text, not real personal receipts. At minimum test:

1. Each reported CHF, SEK, NOK, and CAD reproduction suppresses product amounts and total, retains the product candidate, and shows the currency warning.
2. Additional currency-code families and supported symbols, before/after the amount, with spacing and punctuation variants.
3. Mixed EUR and non-EUR lines suppress amounts throughout the receipt.
4. EUR-only and €-only receipts still yield the known expected amounts.
5. Existing Lithuanian no-marker receipt fixtures still pass.
6. Codes are not matched as substrings in ordinary product names; common uppercase headers do not trigger false positives.
7. Existing refund, negative amount, discount, quantity, total-vs-product, date, and seller safeguards remain intact.
8. Existing review-price, concurrent-save claim, cancellation, auth, legal-engine, and signature tests remain passing.

Test both the currency helper, if extracted, and `parseReceiptText()` end to end. Do not merely test a regex independently and assume the parser uses it correctly.

## 6. Verification gates

Run the repository's supported commands from a clean dependency install:

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Use disposable Supabase for authenticated verification; current CI already starts it and runs the authenticated suite and development purchase-form check. Check the actual CI logs for the exact revised commit. A local Docker blocker may be satisfied by successful exact-commit CI backend checks; never report CI execution as local execution.

Before merging require:

- Green lint, typecheck, unit/component tests, and production build.
- Passing real OCR/public browser checks.
- Passing authenticated backend checks in local disposable Supabase or exact-commit CI, not merely a skipped suite.
- Preservation of receipt claim/concurrency, original bytes, partial-save recovery, access denial, selected corrections, and development/production purchase forms.
- Diff review, no secrets/environment files/real receipts committed, and no unrelated changes included.

Keep dev and production output directories separate or stop dev during builds. Do not obtain green results by removing slow tests, replacing real OCR with mocks, bypassing authorization, or silently skipping required checks. Record remaining actual-device/visual checks honestly; these are not made passing by a mobile viewport test.

## 7. Git delivery — main is explicitly authorized

The user authorizes merging the completed Sprint 4, hardening, and Sprint 4.2 changes into `main` and pushing to this repository, subject to the verification gates above. This supersedes the earlier feature-only delivery restriction for this task only.

1. Commit intended changes with a normal message, such as `fix: complete receipt currency safeguards`, and push the feature branch normally.
2. Wait for the exact feature commit's CI and inspect its required jobs/logs.
3. Refresh `origin/main`. If main advanced, integrate its changes safely into the candidate and rerun checks/CI on that resulting candidate before merging. Never replace main with an older snapshot.
4. Honor repository protection and review requirements. If a PR is required, create/use one and merge only when required checks/reviews allow it. Do not bypass protections or approval requirements.
5. If unprotected and a direct merge is allowed, merge the verified feature history into main normally (fast-forward when possible) and push `main` without force.
6. Confirm remote main contains the delivered work and inspect the main CI result. Do not claim success while CI is failing or pending.

No attribution banners, assistant co-author trailers, or agent scratch files. Preserve existing history. Do not manually deploy or change production Supabase as part of this task. If a known automatic main deployment would run against a backend missing the required migration, report that risk and resolve deployment/database authority with the user before publishing an incompatible app.

If checks or permissions block merging, push only the safe feature work, explain the blocker, and do not claim main was updated.

## 8. Database and environment readiness

The branch requires both migrations, including:

`supabase/migrations/20261002000000_receipt_upload_claims.sql`

Do not modify applied historical migrations. No additional currency schema migration should be necessary.

- Reuse the user's existing task-relevant `.env.local` without printing keys or replacing it with disposable CI settings.
- Use only the app's publishable credentials. Never expose a service-role key to the app or phone.
- Verify the preview's intended backend has the claim migration and reachable auth/storage services.
- Apply migrations automatically only to a clearly identified disposable/local development backend within scope. Ask before modifying an existing shared/production database or its auth configuration.
- If backend setup is blocked, still launch a truthful public-route preview where possible, but identify that private purchase/scanning flows are unavailable. Do not call this a complete authenticated preview.

## 9. Run locally for phone access

After the merged code is available locally, run it on the user's actual computer and leave it running in a persistent terminal/session.

Suggested default, adjusted to a free port if needed:

```bash
npm run dev -- --hostname 0.0.0.0 --port 3000
```

Required actions:

1. Identify the active Wi-Fi/LAN interface and its private IPv4 address. Do not guess `en0`, use a VPN/container address, or present `0.0.0.0` as a browseable URL.
2. Return both the computer URL and exact phone URL, for example `http://192.168.1.42:3000` using the actual address.
3. Verify the server responds through localhost and the LAN address. Check homepage/login and required OCR asset URLs. Do not equate a localhost-only response with phone accessibility.
4. Explain that phone and computer must be on the same trusted Wi-Fi, the computer must remain awake, and router client isolation or firewall rules may block access.
5. Diagnose firewall restrictions safely; do not disable the firewall, open router ports, expose the database/admin services unnecessarily, or create a public tunnel without separate authorization.
6. Use the installed Next.js version's supported configuration if a development-origin restriction blocks LAN use. Scope any allowlist to the actual intended local origin, never a wildcard CSRF bypass. Keep machine-specific IPs out of committed production configuration; document a local environment-driven setup if needed.
7. Verify normal same-origin server actions/login through the LAN origin where possible. If the browser Supabase endpoint is `localhost` or `127.0.0.1`, remember that those names on the phone refer to the phone. Determine which backend calls are server-side versus browser-side and configure a safe reachable development endpoint if required.
8. Keep auth redirect destinations narrow. Email confirmation links for localhost may not work on the phone; use an already confirmed account for testing or report the required authorized local callback setup. Never disable confirmation in a shared/production backend just to make preview work.
9. LAN HTTP is a layout/functionality preview, not a promise that secure-context-only browser features work. Report camera/file capture and OCR capability honestly on the actual phone. If HTTPS is required, explain the limitation and request approval for a trusted local HTTPS setup; do not invent a public tunnel or weaken browser security.
10. Leave the process alive, identify its terminal/session and command, and provide how to stop it (normally Ctrl+C). Do not claim it will stay running after an ephemeral remote execution environment closes.

If you are running in cloud Codex rather than on the user's computer, do not claim its private container IP is accessible from their phone. Complete code/Git verification, then provide exact local checkout/setup/start commands and clearly report that starting the server on their computer remains pending. Do not publish the app merely to compensate for this constraint.

## 10. Handoff and acceptance

Finish with:

- Actual starting branch/SHA and final feature/main SHAs.
- Currency fix and test count/results.
- CI links for the delivered candidate/main, with local vs CI and mocked vs real checks distinguished.
- Whether main was pushed successfully and any protection/merge blocker.
- Migration readiness for the preview backend, without secrets.
- Exact working computer/phone URLs and the running terminal/session, or a clear local-execution blocker and commands to finish.
- A short mobile checklist: sign in, open a purchase, select a synthetic receipt, scan, review, save, reopen evidence, and verify manual fallback. Do not use a personal receipt in logs or test fixtures.
- Actual-device, visual, and rotated-capture checks as passed only if genuinely performed; otherwise pending.

Done means the currency defect is fixed and verified, intended code is on main with passing CI, and the merged app is running on the user's computer with an accurately verified LAN preview address. If any part is blocked, separate completed work from pending work explicitly.
