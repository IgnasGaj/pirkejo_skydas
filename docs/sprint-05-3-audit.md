# Pirkėjo Skydas — post-Sprint 5.3 audit

Date: 2026-10-03<br>
Repository: https://github.com/IgnasGaj/pirkejo_skydas<br>
Branch: `feature/sprint-05-3-project-hardening`<br>
Audited commit: `6635e2676f8e02f67cfb04cb866e44977e796527`<br>
Implementation commit: `9298604dd9b97e76d7e1d1086106dabbb25bb086`<br>
Baseline: Sprint 5.2 `50c9b56ce7ca7e67982b91bf4915b1b2f2fc9317`<br>
Observed main: `9531c3b88fa3d3e13d8efb9301993489d6f4b567`

## Verdict

**Hold the merge and Sprint 6 acceptance until A1 is corrected. Complete A2 and A3 in the same focused follow-up.**

Sprint 5.3 substantially addresses the earlier findings, and the exact pushed commit has successful CI. However, the new navigation protection can clear the unsaved flag without actually leaving the composer. That reintroduces a mismatch between the visible complaint preview and the saved facts used to generate a document. Two additional recovery defects remain.

No cross-account disclosure was identified in the reviewed code or available test evidence. This audit is not a penetration test, a production readiness certification, or legal certification of every decision path.

The audit changed no application implementation, remote branch, migration or production setting. Temporary diagnostic tests were removed; the repository working tree was clean after the audit.

## 1. Confirmed findings

| ID | Priority | Finding | Evidence |
| --- | --- | --- | --- |
| A1 | P1 — merge blocker | A link opened in another tab can mark unsaved facts clean and enable generation from an older saved revision | Executed actual composer with a same-origin new-tab link; verified generation becomes enabled; traced actual API generation from saved draft |
| A2 | P2 | A successful save permanently enables leave bypass for later edits in the same mounted composer | Executed actual save → new edit → beforeunload sequence; inspected Back handler |
| A3 | P2 | Failed ordinary-upload Storage cleanup still removes its recovery metadata | Executed actual document service with injected READY-update and cleanup failures |

The diagnostic tests asserted the observed defective behavior. Passing those tests confirms reproduction; it does not mean the defects are fixed. Browser and database interleavings for these new cases still need regression coverage in the implementation follow-up.

### A1 — Opening another tab clears the unsaved revision

Location: `src/features/complaints/ComplaintComposer.tsx`, capture-phase link handler around lines 103–110, generation button around line 210, and `src/app/api/purchases/[id]/complaints/route.ts`, generation branch.

The link interceptor checks the URL but ignores link target, modifier keys, mouse button and download behavior. If the confirmation is accepted, it sets both `allowLeave.current = true` and `dirty = false`, even when the action opens another tab and leaves the composer mounted.

Executed diagnostic:

1. Render a saved, eligible complaint with generation initially enabled.
2. Edit the consumer name without saving. Generation is now disabled as expected.
3. Click a same-origin link with `target="_blank"` and accept the leave confirmation.
4. The edited facts remain in the composer, but the generation button becomes enabled.

The probe used a synthetic link beside the actual composer because the interceptor listens on the entire document. Its logic also applies to Ctrl/Command-click on the existing purchase edit link; that modifier-click variation was identified by source review rather than a separate real-browser run.

The API's generation branch intentionally loads `draft.facts`, `draft.answers` and `draft.remedy` from the database. It does not generate from the newly submitted client facts. Therefore the older stored facts can be generated while the screen previews the unsaved edit. The UI invariant is broken; accepting a leave prompt must not itself imply that the local values were saved or reverted.

**Required fix:** Restrict navigation prompting to actions that actually leave this document. New-tab/window, modifier, download and appropriate same-document actions must not clear unsaved state. Keep the displayed revision and saved revision distinct until an explicit successful save or explicit reset to saved facts. Consider a revision comparison in addition to a mutable dirty flag so this invariant cannot be broken by navigation bookkeeping.

**Acceptance:** Edit a saved draft; use Command/Ctrl-click, Shift-click and a same-origin target-blank link. The current form retains its edits and generation stays disabled. Verify actual same-tab cancellation retains edits, confirmed discard navigates, and any allowed generation's saved facts match the displayed saved revision. Test actual browser interaction and the server result, not just button state.

### A2 — Save bypass remains active after subsequent edits

Location: `src/features/complaints/ComplaintComposer.tsx`, `beforeunload` around lines 97–101, Back handler around lines 111–115, and successful save around lines 167–170.

Every successful save sets `allowLeave.current = true`. An existing draft remains mounted while `router.refresh()` runs. Neither `change`, remedy changes nor reassessment resets that ref when new edits become dirty.

The diagnostic saved an existing draft successfully, typed a second unsaved name, and dispatched a cancellable `beforeunload` event. `event.defaultPrevented` remained false. The Back handler also exits immediately while the ref is true; that consequence is established by source review, not an executed native Back test in this audit.

**Required fix:** Make any leave allowance one-time and specific to an actual authorized navigation. Saving an existing draft does not require a persistent allowance. Starting a new dirty revision must restore unload and navigation protection. Audit sentinel-history setup/cleanup so repeated edit/save cycles do not accumulate misleading history entries or make Back require unexpected extra steps.

**Acceptance:** Save, then edit again without saving. Refresh, close, Back and same-tab exit all protect the second edit. Repeat multiple save/edit cycles. Cancel retains values; explicit discard leaves once; successful save and deletion navigate without duplicate warnings.

### A3 — Cleanup removes the only tracked path despite failed Storage removal

Location: `src/features/purchases/data/document-service.ts`, `saveDocument` catch block around lines 20–23.

Ordinary uploads now correctly reserve PENDING metadata before sending bytes. However, after an upload/READY-transition failure, the catch block calls `storage.remove` and then deletes PENDING metadata regardless of whether Storage removal succeeded. It throws an AggregateError only after both operations.

Executed diagnostic with injected outcomes:

1. Reserve the pending document row.
2. Upload succeeds.
3. READY update fails.
4. Storage removal returns an error.
5. The service still executes metadata deletion and throws `Document upload cleanup failed`.

If metadata deletion succeeds while the object remains, the object loses its tracked path and disappears from the unfinished-file recovery UI. This is an ordinary handled failure path, not merely the cross-system process-crash limitation already acknowledged in the implementation report. The audit demonstrated the actual service call sequence with mocks; it did not create a real orphan in deployed Storage.

**Required fix:** Retain durable recovery metadata when object removal is unsuccessful or unconfirmed. Keep it non-READY and retryable, using a consistent cleanup/tombstone path that cannot be reclaimed by a late uploader. Delete metadata only after cleanup success is established. Preserve ownership isolation and idempotent retries.

**Acceptance:** With a disposable backend, inject successful upload, failed READY update and failed object cleanup. Metadata remains visible for authorized cleanup, no READY evidence is exposed, and retry removes both object and row. Also test cleanup success followed by failed metadata deletion, overlapping deletion and late upload completion, and cross-account denial.

## 2. Earlier Sprint 5.3 requirements

| Original item | Audit disposition |
| --- | --- |
| F1 — changed creation retry | Canonical replay comparison and explicit changed-creation recovery are implemented. Current tests cover the intended save/reapply path. A1 is a separate route to preview-versus-saved divergence. |
| F2 — refreshed revision | Clean adoption and explicit dirty rebase are implemented; complaint identity is keyed at the page boundary. Component tests cover dirty rebase. |
| F3 — delete after reassessment | Fixed in client operation guards; API deletion does not depend on valid reviewed facts. Tests cover this case. |
| F4 — input contracts | Shared monetary ceiling, single-line validation and additive NOT VALID database checks are present; existing incompatible records receive correction guidance. Applied production constraints were not inspected. |
| F5 — truthful write errors | Whole-route exception handling, stable error codes, signing/migration classification and non-JSON client handling are present and have targeted tests. Message-based fallback classification remains less robust than explicit typed domain/SQL error codes. |
| F6 — failed reads | Complaint/history read errors are distinguished from successful empty results; exports return service errors for read failures. |
| F7 — unsaved navigation | **Not fully resolved:** A1 and A2 are regressions in the new protection. Existing tests cover only a subset of navigation cases. |
| F8 — UTF-8 limits | Conservative shared budgets are applied to facts, answers, snapshot and sections. Character-only validation no longer accepts arbitrary oversized facts silently. |
| V1 — evidence lifecycle | Reservation, tombstones, parent-deletion guards and generation metadata locks improve coordination. **Incomplete cleanup recovery:** A3. Storage and PostgreSQL remain separate systems. |
| V2 — devices/production | Still pending; do not represent viewport tests as physical-device results. |
| V3 — dependencies | Full audit still has five high development-chain entries; production-only audit is clean. |
| I1 — pagination | Bounded purchase/complaint/version pages and latest-version queries are implemented. CI includes pagination evidence. Offset pagination may shift under concurrent inserts/updates; this audit did not establish data loss. |
| I2 — reassessment/date freshness | Existing-draft reassessment is accessible; focus, visibility and interval updates refresh the Vilnius date; server decisions remain authoritative. |
| I3 — scan close/reopen | Abort controller, session guard and correction-field reset are implemented and tested. |

## 3. Project-wide review

The audit reviewed the complete Sprint 5.3 diff and its effects on the previously audited baseline, including:

- Purchase creation/editing, evidence access, ordinary/reviewed upload, receipt retry and OCR correction interactions.
- Complaint creation, canonical replay, recovery, refreshed revisions, reassessment, dirty state, navigation, generation, immutable history and export routes.
- All five new migrations in application order, parent deletion guards, terminal document deletion, Storage access policies and the replacement generation function.
- Pagination, authorized empty/error states, temporary evidence labels, shared field/byte contracts, environment instructions and development-form script changes.
- Unchanged legal-engine, authentication, receipt-parser/OCR and UUID behavior through source comparison and the regression suite. No new substantive legal-rule defect was identified here; legal editions and production configuration were not independently certified.

Existing safeguards remain: owner-filtered application reads/writes, foreign-key ownership relationships, RLS, private bucket, signed generation authorization, immutable generated rows and no OCR text persisted by the scanning flow. CI exercises two-account denial. This is evidence for the tested revision, not proof of every possible adversarial path or deployed policy state.

Further release follow-ups, separate from the three findings:

- Keep a documented orphan-object reconciliation procedure; even corrected cleanup cannot make Storage/database operations fully atomic.
- Historical attachment labeling uses current READY metadata; a DELETING record is labeled removed even if object removal is still pending. Consider displaying a distinct deletion-in-progress state without changing immutable snapshots.
- NOT VALID constraints preserve legacy rows, but still apply to subsequent updates, including deletion-state marking. Verify legacy outlier correction/deletion explicitly before importing or migrating real legacy data.
- Continue dependency maintenance and actual-device acceptance. Do not expand this corrective pass into case tracking or automatic complaint submission.

## 4. Verification evidence

### Executed locally for this audit

| Check | Result |
| --- | --- |
| Fresh `npm ci`, same-origin OCR preparation | Passed |
| ESLint | Passed on repository source before diagnostic harness creation |
| TypeScript | Passed on repository source before diagnostic harness creation |
| Existing unit/component suite | **252 passed in 20 files** |
| Three new diagnostic reproduction tests | **3 passed in 2 temporary files**; A1–A3 reproduced as described |
| Production build with blank public Supabase settings | Passed after removing the temporary diagnostic harness |
| `git diff --check`, working tree | Passed; clean after harness removal |
| Full `npm audit` | **5 high entries**, development chain through braces; nonzero audit status |
| `npm audit --omit=dev` | **0 findings** |

An initial build attempted while the diagnostic files were present failed on the harness's explicit-any lint errors. Those temporary files were removed, and the clean-source build then passed. This was an audit-harness issue, not a branch implementation failure.

Local runtime: Node **24.19.0**. Exact-commit CI uses Node **22**. No implementation tests or source changes were committed by this audit.

### Exact pushed-commit CI, independently inspected

Run: https://github.com/IgnasGaj/pirkejo_skydas/actions/runs/37135349992<br>
Job: `111238650020`<br>
Commit: `6635e2676f8e02f67cfb04cb866e44977e796527`<br>
Conclusion: **success**.

Job steps and decoded logs establish:

- Install, lint, typecheck, 252 tests and production builds passed.
- Public Chromium suite: **5 passed, 14 authenticated cases explicitly skipped** in public mode.
- Disposable Supabase startup/account setup passed.
- Authenticated Chromium suite: **14 passed**.
- Authenticated development purchase and complaint forms passed.
- Disposable stack cleanup passed.

The tracked implementation report's “no final-commit CI ran because this local branch was not pushed” statement is now historical. Its public-mode count of 13 skips is not the exact pushed-commit count; the observed CI count is 14.

### Not independently executed here

- Local real-browser rerun: current headless Chromium download returned invalid/truncated archives. CI browser results above were inspected instead.
- Local live authenticated/RLS rerun: Docker and Supabase CLI were unavailable; no disposable-backend credentials were supplied.
- Physical iPhone/Safari and Android, including LAN HTTP and trusted HTTPS journeys.
- Production migration, private bucket/RLS and signing-key agreement checks.
- Fresh visual rendering of PDF page images. The implementation report records previous visual QA; this audit reviewed export changes and current tests but did not repeat that visual check.

## 5. Corrective handoff

Create a focused follow-up from the audited branch, for example `feature/sprint-05-3-audit-fixes`. Fix A1–A3, preserve all prior hardening, and add meaningful tests for the exact failure sequences above. Keep UI language Lithuanian. Do not change existing generated documents, applied migration history, production data or unrelated features.

Run install, lint, typecheck, all tests, production build, public real-OCR browser suite, authenticated disposable-backend suite, development-form checks and diff checks. Add actual browser coverage for new-tab/modifier navigation, save/edit/unload/Back cycles and preview-versus-generated facts. Add backend fault-injection coverage for cleanup failures with retained metadata. Record actual-device and production limitations explicitly.

Update the implementation report with the final fix commit and exact-commit CI. Hold merge/deployment until the P1 revision-consistency issue is fixed and verified; this audit does not authorize either action.

### Prompt

> Audit follow-up for `IgnasGaj/pirkejo_skydas`: read `sprint-05-3-audit.md`, verify the audited branch/commit, and fix A1–A3 on a new branch based on completed Sprint 5.3. Preserve the corrected retry, reassessment, ownership, immutable-version and evidence-lock safeguards. Add regressions that prove unsaved facts remain dirty after new-tab/modifier clicks, a second edit after save restores unload/Back protection, and failed Storage cleanup retains retryable metadata. Complete implementation, required verification and a precise report. Keep UI Lithuanian. Do not merge to main, deploy or modify production data.
