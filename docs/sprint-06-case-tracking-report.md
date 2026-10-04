# Sprint 6 case tracking delivery report

## Source and candidate

- Starting source: `735d861` (`origin/main` and the completed Sprint 5.3 follow-up branch on 2026-10-04). Local `main` was behind that remote. Sprint 6 was branched from the completed source as `feature/sprint-06-case-tracking`.
- Delivered, locally verified code commit: `0fbcf1d41bfc95a8b95bbf1a392f7d591e39b102`. The report follows in a separate documentation commit.
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

- Apply **one additive migration**, `20261004000000_case_tracking.sql`, after `20261003070000_terminal_evidence_deletion.sql`. It creates `cases`, `case_events`, and private deletion replay receipts; owner-only RLS on cases/events; restrictive ordinary-client grants; composite owned-parent constraints; a unique pinned version; and narrow authenticated `create_tracked_case`, `record_case_event`, and `delete_tracked_case` RPCs. No application service-role key was added.
- Events and the current summary update in the same PostgreSQL transaction under a locked case row. Revision checks reject stale tabs. Request UUIDs and canonical JSONB equality accept exact retries and reject changed retries. Saved event result snapshots return the original result after a lost response. Corrections target the latest matching event in the same case; prior entries remain visible. A 500-event cap and 2500-byte event payload cap bound the journal.
- Whole-case deletion is revision checked and retryable. It removes case-owned events while retaining the generated version and purchase evidence. The minimal deletion receipt remains for idempotency. Tracked-version deletion is blocked unless the purchase is already in its coordinated `DELETING` state.
- Typed database definitions were regenerated from the disposable migration and the new tables/RPC signatures reconciled into the repository's existing narrow-enum type file, keeping established compile-time contracts.

## Verification

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
| `git diff --check`, exact-candidate CI | Diff check passed; CI available after push. |

Browser checks use Chromium desktop and a 390 px mobile viewport. Physical iPhone/Safari, Android, and LAN HTTP remain pending because those devices and a reachable local backend were not available for this run. Manual checklist: on each device open a generated document and its case; record submission with unknown receipt, then receipt, response, service and outcome; test Back/Forward and a new tab with unsaved fields, focus after Vilnius midnight, long text wrapping, private PDF/evidence downloads, and evidence upload retry. A viewport emulator does not prove device behavior.

## Limits and rollout

- No seller email, delivery detection, push or background reminders, VVTAT package, or eligibility decision was added. The user-reported journal and in-app reminders do not prove seller conduct or legal entitlement.
- The deadline calculator must be reverified before showing dates beyond 2026-10-31. The journal remains available after that date.
- Storage and PostgreSQL remain separate systems; pre-existing orphan-reconciliation maintenance advice still applies. No shared or production migration was run.
- Push/CI outcome: pending final candidate push and inspection.
