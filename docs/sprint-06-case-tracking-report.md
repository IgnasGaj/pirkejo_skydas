# Sprint 6 case tracking delivery report

## Source and candidate

- Starting source: `735d861` (`origin/main` and the completed Sprint 5.3 follow-up branch on 2026-10-04). Local `main` was behind that remote. Sprint 6 was branched from the completed source as `feature/sprint-06-case-tracking`.
- Delivered, locally verified code commit: `0fbcf1d41bfc95a8b95bbf1a392f7d591e39b102`. The report follows in a separate documentation commit.
- Sprint 6 audit baseline: `ba354eef2f6e9bde7e29fe83975b06aca2e7c7de`; its [exact-candidate CI](https://github.com/IgnasGaj/pirkejo_skydas/actions/runs/37202511641) passed. The audit fixes are on `fix/sprint-06-audit`; their final SHA and CI are recorded in the final handoff after push.
- The pre-existing untracked `docs/sprint-03-1-technical-hardening.md` was preserved and excluded from this branch.
- Main, the linked shared Supabase project, production settings, and deployment were not changed.

## Delivered behavior

- A generated complaint version has a **Sekti kreipimąsi** entry point. The case pins its exact version, document family, generation time, and existing immutable provenance. One version can have only one case; repeated creation opens it. Other versions can be tracked separately.
- `/cases` provides owned active/closed lists with exact counts and bounded pages. `/cases/[caseId]` displays purchase context, private downloads of the pinned version, current progress, a qualified response date or explicit unavailable reason, next-step guidance, evidence availability, and paginated history.
- The user explicitly records submission and optionally confirms a known receipt date. Document generation, copying, and downloading do not mark submission. Responses, service episodes, corrections, resolution, closure, reopening, and whole-case deletion are explicit saves. Interim responses leave the original response clock visible. Service promises are labelled as seller-provided dates, separate from statutory response periods.
- The existing purchase evidence infrastructure supplies selectable READY files and private downloads. Historical filenames remain descriptions; removed evidence no longer becomes downloadable. Complaint deletion is blocked while a case pins one of its versions. Purchase deletion still uses the recoverable deletion coordinator and includes cases and history.
- The fixed complaint navigation guard was extracted for reuse by the case form, including Back/Forward, hash, modifier/new-tab, StrictMode, and unload behavior. A case form keeps entered values after a service error or revision conflict.

## Deadline policy

- Rule: `LT-VTA-21-CK-1.118-1.121-2026-10-04.1`; source version `2026-10-04`. Applies only to generated `DEFECTIVE_PRODUCT` consumer complaints with a user-confirmed seller receipt date. Withdrawal notices and physical return/consent requests return a stated unavailable reason.
- Article 21(2) of the Consumer Rights Protection Act starts from seller receipt. Civil Code 1.118 excludes that day; 1.121 includes intermediate weekends/holidays and moves a nonworking final day to the next working day. The current Labour Code holiday list was checked. The final day is included; overdue begins after it. [Exact editions, provisions, verification date, and applicability](case-tracking-legal-sources.md).
- The app displays no definitive countdown without known receipt or after the verified source window ending 2026-10-31. Receipt and rule/source version are persisted. A changed rule version yields an unavailable reason until reviewed; no old event or document is rewritten. Display refreshes through server revalidation after focus, visibility change, and a minute timer.

## Persistence and security

- Apply `20261004000000_case_tracking.sql` after `20261003070000_terminal_evidence_deletion.sql`, then apply the additive audit migration `20261004010000_case_audit_fixes.sql` before running the corrected app. The first migration creates `cases`, `case_events`, and private deletion replay receipts; owner-only RLS on cases/events; restrictive ordinary-client grants; composite owned-parent constraints; a unique pinned version; and narrow authenticated RPCs. The follow-up migration adds private creation-request receipts, strengthens their owned exact-version foreign key, replaces the three RPC bodies, and raises the bounded JSONB event payload cap from 2500 to 8192 bytes. No application service-role key was added.
- Events and the current summary update in the same PostgreSQL transaction under a locked case row. Null-safe revision checks reject stale or malformed direct RPC calls. Creation UUIDs now bind to one version even when they open an already existing case. Request UUIDs and canonical JSONB equality accept exact event retries and reject changed retries. Saved event result snapshots return the original result after a lost response. Corrections target the latest matching event in the same case; prior entries remain visible. A 500-event cap and 8192-byte event payload cap bound the journal.
- Whole-case deletion is revision checked and retryable. It removes case-owned events while retaining the generated version and purchase evidence. The minimal deletion receipt remains for idempotency. Tracked-version deletion is blocked unless the purchase is already in its coordinated `DELETING` state.
- Typed database definitions were regenerated from the disposable migration and the new private receipt table reconciled into the repository's existing narrow-enum type file, keeping established compile-time contracts.

## Sprint 6 audit fixes

- **F1:** The case form stays mounted across server refreshes, retains the authored revision and full immutable attempted request, and replays that exact body after an ambiguous network failure. Controls are disabled during a save. Later edits remain visible after replay, with an explicit review step before a new logical event. A stale revision also requires review without discarding the draft. Focus, visibility, and minute refresh still update server facts.
- **F2:** The authenticated event RPC rejects null, negative, and out-of-range revisions before mutation, then compares expected and actual revisions with `IS DISTINCT FROM`. Deletion and creation RPC arguments were checked at their own boundaries.
- **F3:** Closure and resolution dates cannot precede dependent case events; resolution requires a returned item when service is open. Reopening cannot predate the latest closure or resolution. A new service episode cannot predate the previous return or reopen, and return cannot predate a reopen. Closing during service retains the open episode; reopening resumes it. Date corrections validate the dependent chronology; backdated correspondence remains allowed.
- **F4:** Confirmed action switches reset the common and action-specific fields, receipt-known flag, dirty state, and prior retry state. Cancellation retains the draft.
- **F5:** History now shows the original submission method and optional receipt, seller/service reference and promised date, and each return result, including after later episodes and pagination. Text wraps on mobile.
- **F6:** A private, RLS-enabled creation-receipt table records every creation UUID, including shortcuts to existing cases; changed-version reuse fails. Existing cases are backfilled during migration.
- **F7:** The 8192-byte JSONB limit accommodates maximum allowed Unicode summary and note fields, including four-byte characters and JSON escaping. The API checks UTF-8 size and gives an actionable Lithuanian error; direct RPC payloads remain bounded and typed.

## Original Sprint 6 verification at `ba354eef`

| Check | Result |
| --- | --- |
| Baseline before edits: lint, typecheck, unit suite | Passed: 263 unit tests, 4 skips. |
| Disposable local migration | `supabase db reset --local` applied all migrations, including the new case schema. |
| `npm ci`, lint, typecheck, unit suite, build | Passed; 269 unit tests passed, 5 skipped. Production build passed again after the final case-form and list-copy corrections. |
| Disposable backend integration | Passed: 2 files, 5 tests, using ordinary local test accounts. |
| Public Playwright suite | Passed: 5 public tests; 16 authenticated tests skipped by design without credentials. |
| Authenticated Playwright suite | Passed: 16 tests, including the complete case journey. The case journey passed again after adding the unsaved form navigation and reopen default-action checks. |
| Development-form check | Passed: authenticated development purchase and complaint forms. |
| Full dependency audit | Current `npm audit`: 5 high, 0 critical; all in developer tooling (`@next/eslint-plugin-next`, `eslint-config-next`, `braces`, `fast-glob`, `micromatch`). |
| Production dependency audit | Current `npm audit --omit=dev`: 0 vulnerabilities. |
| `git diff --check`, exact-candidate CI | Diff check passed; [CI run 37202511641](https://github.com/IgnasGaj/pirkejo_skydas/actions/runs/37202511641) completed successfully. |

## Audit-fix verification

| Check | Result |
| --- | --- |
| `npm ci` | Passed. |
| `npm run lint`, `npm run typecheck` | Passed. |
| `npm test` | 272 passed, 6 skipped (the opt-in disposable-backend suites). |
| `supabase db reset --local` | Passed with both Sprint 6 migrations in order; only the disposable local database was reset. |
| `npm run test:integration` | 6 passed with ordinary local accounts, including direct RPC null/stale revision, changed creation identity, chronology, Unicode, owner, replay, rollback and deletion checks. |
| `npm run build` | Passed. |
| Public Playwright | 5 passed; 16 authenticated tests skipped by design in this separate run. |
| Authenticated Playwright | 16 passed against disposable local Supabase. The case journey covers lost response with exact replay, pending-save controls, dirty focus refresh, stale conflict review, action switch, service history and pagination, mobile overflow, and case-list focus refresh. |
| Authenticated development forms | Passed. |
| `npm audit` | 5 high, 0 critical, confined to developer-tooling packages (`@next/eslint-plugin-next`, `eslint-config-next`, `braces`, `fast-glob`, `micromatch`). |
| `npm audit --omit=dev` | 0 vulnerabilities. |
| `git diff --check`, exact fix-branch CI | Diff check passed; [run 37215686780](https://github.com/IgnasGaj/pirkejo_skydas/actions/runs/37215686780) passed for the audit-fix code commit `495dcbdc383bf55d87aed148dde9458316e85009`. |

Browser checks use Chromium desktop and a 390 px mobile viewport. Physical iPhone/Safari, Android, and LAN HTTP remain pending because those devices and a reachable local backend were not available for this run. Manual checklist: on each device open a generated document and its case; record submission with unknown receipt, then receipt, response, service and outcome; test Back/Forward and a new tab with unsaved fields, focus after Vilnius midnight, long text wrapping, private PDF/evidence downloads, and evidence upload retry. A viewport emulator does not prove device behavior.

## Limits and rollout

- No seller email, delivery detection, push or background reminders, VVTAT package, or eligibility decision was added. The user-reported journal and in-app reminders do not prove seller conduct or legal entitlement.
- The deadline calculator must be reverified before showing dates beyond 2026-10-31. The journal remains available after that date.
- Storage and PostgreSQL remain separate systems; pre-existing orphan-reconciliation maintenance advice still applies. No shared or production migration was run.
- Original feature-branch push and CI succeeded. The audit-fix code commit `495dcbdc383bf55d87aed148dde9458316e85009` passed [exact-commit CI](https://github.com/IgnasGaj/pirkejo_skydas/actions/runs/37215686780). The report update is a separate documentation-only commit; its final SHA and CI are reported with delivery. The fix branch remains separate from main and production.
