# Sprint 5.3 inspection follow-up — implementation report

Date: 2026-10-04 (Europe/Vilnius)<br>
Repository: `IgnasGaj/pirkejo_skydas`<br>
Branch: `feature/sprint-05-3-audit-fixes`<br>
Audited Sprint 5.3 baseline: `6635e2676f8e02f67cfb04cb866e44977e796527`<br>
Inspected fix commit: `63a235e426b5a7d44f121076b67769a12734f1c9`<br>
R1/R2 code and test commit: `5d3a7b4521db6c39c59ebf033df79bf8e5acd529`<br>
Report commit: this document's commit; obtain its full SHA with `git rev-parse HEAD` on this branch.

The supplied [inspection](sprint-05-3-fix-inspection.md) is copied into `docs`. Its R1 and R2 findings were checked against the local fix branch, which also contained the later A3 absence confirmation in `b1d129fcd5d59f7124cf32bd5f7dca2d85ce4dc2`. The prior [A1–A3 report](sprint-05-3-audit-fixes-report.md) remains historical.

## Changes

| Finding | Implementation and regression evidence |
| --- | --- |
| R1 — complaint history | The composer marks a base and its guard with one ID and only treats traversal to that base as an attempted departure. Hash Back/Forward and unrelated `popstate` do not prompt or invoke Back. A cancelled dirty Back moves forward to the existing guard; an accepted or clean Back leaves once. Cleanup removes the active marker, while StrictMode, same-route remounts and reload reuse the existing entry. A short lived `sessionStorage` ID covers Next.js hydration replacing history state during reload; access failures do not crash the form. Next history metadata is copied intact. Same-tab exits replace the guard entry, including successful first save and deletion. The edit revision and saved revision remain independent of navigation allowance. |
| R2 — retry test date | The complaints route tests control `Date` at a fixed Vilnius assessment day and restore real time after each test. A separate test advances across Vilnius midnight and confirms an identical creation request returns `CREATION_CHANGED` with the saved draft ID and version when the server assessment date changes. Server reassessment and `asOfDate` comparison remain intact. Other date fixtures were reviewed; their fixed dates are explicit validation inputs rather than a live-date retry expectation. |

Component tests cover StrictMode setup/cleanup/setup, remount and reload state restoration, unrelated history metadata, repeated edit/save protection, Forward/hash traversal, and cancelled/accepted Back. Authenticated Chromium covers real hash Back/Forward without prompts, new tabs and modifiers retaining unsaved facts, two save/edit cycles, reload and close warnings, accepted Back returning to the exact previous page, and two clean leave/reopen cycles without extra guard entries. The authenticated development check asserts one guard entry under React StrictMode.

The earlier A1 and A3 changes remain: new-tab and download actions cannot mark facts saved; generation remains disabled for dirty facts; failed Storage removal or unconfirmed absence keeps a DELETING row with the retryable object path. Existing retry, reassessment, ownership/RLS, immutable-version, claim-token late-upload and signed evidence-lock checks were not weakened.

## Verification on the final local code

| Check | Result |
| --- | --- |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm test` | 263 passed, 4 skipped; the skipped cases require the disposable backend and ran separately below |
| `npm run test:integration` on disposable local Supabase | 4 passed |
| `npm run build` with local disposable Supabase variables | Passed |
| Public Chromium (`npx playwright test --workers=2`) | 5 passed, 15 authenticated cases skipped by its ordinary-mode gate |
| Authenticated Chromium (`npm run test:e2e:auth`) on disposable local Supabase | 15 passed, including the R1 browser regression |
| Authenticated development forms (`node scripts/check-dev-purchase-forms.mjs`) | Passed, including one-guard StrictMode assertion |
| `git diff --check` | Passed before the code commit |
| Exact-commit GitHub CI for `5d3a7b4521db6c39c59ebf033df79bf8e5acd529` | Not run; the branch was kept local and not pushed |

The temporary local Supabase email-confirmation setting was restored after stack startup. The local stack was stopped without backup after verification. No production data, production configuration, deployed service, or main branch was changed.

## Remaining limitations

Physical iPhone/Safari and Android behavior and read-only production migration, RLS, bucket and signing readiness were not verified here. If a browser disables `sessionStorage` and Next.js also discards history state during a full reload, the form remains usable but may leave an extra same-URL history entry after reload. Storage and PostgreSQL still cannot make object cleanup atomic; a crash or upload continuing past its claim lease can require operational reconciliation. Exact-commit CI awaits an authorized push.
