# Pirkėjo Skydas — Sprint 6 audit and debugging handoff

Audit date: 2026-10-04, Europe/Vilnius.

Repository: https://github.com/IgnasGaj/pirkejo_skydas

Audited branch: `feature/sprint-06-case-tracking`.

Audited SHA: `ba354eef2f6e9bde7e29fe83975b06aca2e7c7de`.

Baseline main: `735d861cbf2d8b26534abc2cd7c2e4093cabc7b1`.

## Verdict

**HOLD MERGE.** The baseline checks and exact-candidate CI pass, but targeted debugging reproduced unsaved form loss, unstable lost-response retries, and a database revision-check bypass. Chronology and several smaller completeness issues also require correction. These are findings in the current Sprint 6 candidate, not historical Sprint 5 failures.

This deliverable contains the audit, reproduction evidence, required fixes, regression acceptance criteria, and a kickoff prompt. Application fixes have **not** been applied or pushed. Main, production, shared Supabase settings, and migrations were not changed.

## Scope and evidence

Read the current Library `sprint-6.md`, the repository's matching specification, completion report, README, CI, Sprint 6 diff, case routes/form/domain/validation, integration/browser tests, additive migration, document-deletion changes, and the extracted navigation guard. No AGENTS.md was found in the checkout. The Sprint 6 branch descends from the latest fetched main; it contains the implementation and subsequent delivery-report commit.

Fresh verification:

| Check | Result |
| --- | --- |
| `npm ci` | Passed |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm test` on unchanged candidate | 269 passed; 5 skipped |
| `npm run build` | Passed |
| `git diff --check` | Passed |
| Additional React/jsdom debugging probes | 4 passed, each asserting a reproduced defect rather than correct behavior |
| Actual Sprint 6 SQL in PGlite | Reproduced null-revision event writes, contradictory chronology, and changed creation-request reuse |
| Full `npm audit` | 5 high; 0 critical; developer dependency chain |
| Production `npm audit --omit=dev` | 0 vulnerabilities |
| Local Playwright | Blocked before browser execution: Chromium absent; installer repeatedly received an invalid/truncated archive |
| Fresh local authenticated Supabase checks | Unavailable: Docker/Supabase were not installed in this environment |
| Physical iPhone/Safari, Android, LAN HTTP | Not performed |

Exact-candidate CI is **completed/success**:

https://github.com/IgnasGaj/pirkejo_skydas/actions/runs/37202511641

The GitHub jobs API showed success for install, lint, types, unit tests, builds, public browser tests, disposable Supabase startup, ordinary test-account preparation, integration tests, authenticated browser tests, development forms, and teardown. This is independently inspected remote CI evidence, not a fresh local authenticated run. The submitted report still says CI/push inspection is pending and needs updating.

PGlite executes PostgreSQL and the unmodified Sprint 6 migration. Minimal synthetic parent tables and an auth.uid fixture were supplied so the new RPC code could execute. This isolates SQL behavior; it does **not** prove full Supabase/PostgREST integration, RLS, Storage races, or genuine multi-connection locking. Repeat the SQL regressions with ordinary accounts on disposable Supabase.

## Findings and required fixes

### F1 — P1: refresh and in-flight saves lose unsaved data; retries change payload

Locations: `src/features/cases/CaseJournal.tsx`, particularly refresh effect, `requestId`, `submit`, and `<form key={item.revision}>`.

The form uses uncontrolled fields and remounts when the server revision changes. Focus, visibility changes, and a minute timer call `router.refresh()` regardless of dirty state. If another tab records an event, that revision refresh clears the first tab's entered fields. The navigation guard does not intercept a server refresh.

The component retains only the UUID for a failed save. Each retry reconstructs the body using the latest `item.revision` and current FormData. If a write committed but its response was lost, a refresh changes the form and expected revision while preserving the original UUID. The SQL replay check then correctly rejects this changed request, leaving the client unable to replay the original attempt.

Fields also remain editable while the save is pending. Successful completion always calls `form.reset()` and clears dirty state, discarding newer edits entered after the request started.

Four React probes were run; three cover this finding:

1. Render revision 1; type `Unsent response`; rerender revision 2. The textarea becomes empty.
2. Capture a request at revision 1; reject fetch to simulate a lost response; rerender revision 2; submit again. UUID is unchanged, expected revision changes from 1 to 2, and payload differs.
3. Start a save of `Original response`; type `Newer unsaved edit` while it is pending; complete success. The newer textarea content disappears.

Required fix:

- Keep the editable draft independent from server refreshes. Preserve dirty fields and the revision against which they were authored, even if current server facts/deadline information refresh.
- Retain the complete immutable attempted request, including UUID, expected revision, dates, kind, payload, evidence and correction target. An unchanged retry sends that exact request.
- Treat edits after a possibly committed attempt explicitly. Reconcile that attempt before silently creating a new logical event; avoid duplicate correspondence after ambiguous network results.
- Either disable editable controls during saves or track draft edit revisions so a successful older save cannot clear newer edits.
- Provide an explicit conflict review/reload action that preserves entered values. Never let automatic refresh serve as silent discard.
- Keep Vilnius date/focus refresh working independently of form preservation; do not solve this by permanently disabling deadline refresh.

Regression acceptance: two tabs plus focus/minute refresh; lost response followed by refresh and exact replay; changed draft after an ambiguous save; pending-save edits; correction target/revision refresh; stale conflict preserves values; no duplicate event.

### F2 — P1: direct RPC callers can bypass expected revision with NULL

Location: `supabase/migrations/20261004000000_case_tracking.sql`, `record_case_event`, revision comparison.

The guard is `if c.revision <> p_expected_revision then ...`. PostgreSQL compares NULL to a value as unknown, so the IF does not reject it. `p_expected_revision` is not subsequently stored in a NOT NULL column by this RPC. An ordinary authenticated caller can therefore submit `p_expected_revision = null`, and a valid event commits against the current row without the required optimistic check.

Reproduced with the actual migration: submit normally to revision 1, then record a response using NULL expected revision. It succeeds at revision 2 with `has_response = true`.

The app API's Zod schema rejects NULL, but authenticated users have execute permission on the RPC; API validation does not protect direct ordinary-client calls. This is an own-case concurrency/integrity defect. No cross-account access bypass was established.

Required fix:

- Add an additive migration replacing the RPC; reject null/malformed required parameters and use a null-safe revision guard such as `IS DISTINCT FROM` after validation.
- Validate the RPC boundary independently of the application. Keep replay comparison and transactional rollback behavior.
- Check analogous guards in the deletion/create RPCs. Null deletion was tested and rejected by `case_deletion_receipts.expected_revision NOT NULL`, rolling back; this audit does **not** claim null-revision deletion succeeds.

Regression acceptance: ordinary-account direct RPC rejects NULL revision with no event/summary change; stale and negative/out-of-range revisions reject; correct revision succeeds; exact replay still succeeds; changed replay rejects. Verify cross-account/anonymous cases remain denied.

### F3 — P2: lifecycle dates can contradict the journal's state transitions

Location: the same migration, `SERVICE_STARTED`, `CLOSED`, `RESOLVED`, and `REOPENED` transitions.

Date checks cover generated date, submission, receipt/response, and return versus current handover. They do not validate the dependent lifecycle boundaries needed for closure, reopening, and successive service episodes.

The SQL engine accepted this sequence:

1. Submission on 2026-10-01.
2. Service handover on 2026-10-04.
3. Closure dated 2026-10-02, before that current service handover.
4. Reopening dated 2026-10-01, before closure.
5. Return on 2026-10-04, then a new service handover dated 2026-10-02, before the prior episode returned.

The revision order changes current state while occurrence-date history depicts a different sequence. This violates the requirement to reject invalid resulting chronology. Sorting the history does not repair persisted facts.

Required fix: define the dependent-date rules for close/resolve/reopen and service episodes, enforce them atomically in SQL, and reflect them in server/client errors. Keep legitimate backdated correspondence possible; do not reject every event merely because it predates the last recorded occurrence. Corrections must validate the resulting dependent chronology too. Closure during ongoing service needs explicit semantics, including how reopening resumes that episode.

Regression acceptance: reopen before applicable closure/resolution rejects; next service episode before prior return rejects; closure/resolution cannot create contradictory dependent events; supported same-day sequences work; legitimate late-recorded older correspondence works; all rejection paths preserve revision and event count.

### F4 — P2: action-change confirmation claims to clear fields but retains them

Location: `CaseJournal.tsx`, action select handler and uncontrolled form fields.

The confirmation says unsaved fields will be cleared. On confirmation the handler changes kind, clears dirty state and UUID, but does not reset the form or all draft state. Common date/note/evidence controls retain their values while the form is now considered clean. Switching response to service can save a response-specific note under a service event.

The fourth React probe entered `Response-specific note`, confirmed switching to `SERVICE_STARTED`, and found the old note still present.

Required fix: make the confirmed action switch reset all intended draft fields, receipt-known state and retry state, with explicit defaults for the new action; cancellation preserves everything. Alternatively retain fields deliberately with truthful wording and dirty tracking. Test actual rendered values and unload/navigation behavior.

### F5 — P2: saved service and submission facts are omitted from history

Location: `CaseJournal.tsx`, history rendering.

The RPC persists service `reference`, `promisedOn`, and return `result`. History renders only response summary, outcome, note and evidence. A service return clears the case's current promised date, so the prior seller promise is no longer visible in the UI. The entered service reference and return result are also absent. A `SUBMITTED` event's receipt date and method are not rendered in its historical entry.

Required fix: render typed, Lithuanian-labelled historical payload fields for each kind, including service reference/promise/result and initial submission/receipt. Preserve original versus corrected facts clearly. Render an empty optional value as absent, and continue escaping text/wrapping long values.

Regression acceptance: two service episodes with different references, promises and results remain inspectable after return, close/reopen, and history pagination; original submission/receipt is visible after correction; long values wrap.

### F6 — P2: creation UUID can be replayed with a different pinned version

Location: `create_tracked_case`, conflict handling in the migration.

Uniqueness covers both pinned version and `(user_id, create_request_id)`, but after `ON CONFLICT DO NOTHING` the RPC only looks up the requested version. If A exists under request A and B already exists under request B, calling B with request A returns B rather than rejecting changed-payload reuse of request A.

Reproduced with two synthetic versions/cases: reuse the first case's creation UUID with the second version; the RPC returned the second case successfully.

Required fix: resolve request identity and verify its pinned version before the separate one-case-per-version shortcut. If a new UUID opens an existing case, define whether/how that request's result is retained consistently with the stated exact-replay contract. Keep simultaneous creation of the same version idempotent.

Regression acceptance: same UUID/same version replays; same UUID/different version rejects whether or not both cases exist; different UUID/same version opens the same case; genuinely overlapping creations produce one row; denied parent access stays denied.

### F7 — P2: Unicode field limits disagree with the database payload limit

Locations: `src/features/cases/validation.ts` and the migration's 2500-byte JSONB payload bound.

API validation permits a 1000-character response summary plus a 500-character note. A Lithuanian response with these fields filled using multibyte characters can satisfy both character limits but exceed the SQL `octet_length(payload::text) <= 2500` limit. JSONB serialization overhead also counts. The UI permits the input, while saving returns a generic validation error without explaining what to shorten.

This is established from the validation/SQL contracts; it was not tested through PostgREST in this environment.

Required fix: define consistent UTF-8 limits across client, server and database, including JSONB representation overhead. Preserve the protective database cap or deliberately revise it with documented bounds. Give an actionable Lithuanian validation error and keep values entered. Direct RPC callers must remain bounded and type-validated.

Regression acceptance: Lithuanian accented text and emoji at/around the bound; combined summary/note/evidence fields; JSON escaping; API and direct RPC agree; invalid payload rollback preserves the journal.

## What is working and should be preserved

- Exact-version case pinning, prepared/unsubmitted default, explicit submission/receipt separation, owned case list/history pagination, Lithuanian UI, and private existing export links are present.
- Case/event RLS, owner-scoped RPC reads, same-purchase READY evidence validation, case row locking, database replay equality, transactional summary/event writes, bounded history, and generated-version deletion protection are present.
- Existing unit/regression checks and the candidate's disposable-backend CI pass. The findings identify missing coverage, not a reason to rebuild the entire feature.
- Withdrawal/physical-return requests have an unavailable response-policy state, rather than receiving the defect complaint countdown.
- Preserve the extracted navigation guard and complaint regression behavior. Do not introduce another history sentinel implementation while repairing drafts.

## Deadline/source review and limits

The current VVTAT request page was independently opened. Its guidance states a seller-response period from receipt and describes refusal/partial/nonresponse next steps:

https://vvtat.lrv.lt/lt/kaip-pateikti-prasyma/

The official e-TAR PDF opening failed in this audit environment. The repository records detailed consolidated provisions and a verification date, but this audit cannot independently certify those exact PDF editions or every arithmetic/applicability rule. No new legal conclusion is asserted here.

The code intentionally withholds computed deadlines after the documented verification window ending 2026-10-31, or when the final date exceeds it. That is a declared conservative limitation, not a newly discovered calculator failure. Reverify official sources before extending it; test the expired-window UI. Do not remove the unavailable state just to make dates appear.

Case list focus/midnight refresh and the full required synthetic case/history pagination coverage remain additional verification gaps. The detail form refresh exists, but F1 must be fixed before it is safe for dirty drafts.

## Implementation and verification handoff

1. Fetch and inspect current remotes/worktree. Confirm whether the audited SHA is still current. Read `docs/sprint-6.md` and this handoff completely. Preserve unrelated work.
2. Create `fix/sprint-06-audit` from the latest intended Sprint 6 source. Do not base on older main if the feature is still unmerged.
3. Fix F1/F2 first, then F3–F7. Use an additive follow-up migration; do not rewrite an already-applied migration. Keep user-facing text Lithuanian and technical reports English.
4. Add focused regression tests for the listed scenarios. Validate SQL through ordinary users on disposable Supabase, including direct RPC NULL/malformed inputs, exact replay, overlapping writes and atomic rollback. Mock/jsdom tests do not replace these backend checks.
5. Complete two-tab authenticated browser tests for dirty refresh, response loss/retry, pending-save edits, action changes, correction conflicts, service history and pagination. Keep existing public purchase/OCR/complaint/export/navigation regressions passing.
6. Run install, lint, typecheck, full tests, production build, public browser suite, integration suite, authenticated browser suite, development-form check, `git diff --check`, and both dependency audits. Keep build/dev directories isolated. Use synthetic records and clean up test-owned data.
7. Update the Sprint 6 report with actual exact-candidate CI links, follow-up migration order, fixes, remaining source/device limitations and test results. Address developer audit findings without forced unrelated upgrades.
8. Commit and push the fix branch normally, then inspect CI on its exact SHA. Do not merge, deploy or modify shared/production Supabase settings as part of this handoff.

Done means the reproduced defects no longer occur, focused regression assertions test correct behavior, disposable-backend/browser checks pass, exact-candidate CI passes, and unavailable checks are labelled accurately.

## Kickoff prompt

> Read `sprint-06-audit-debugging.md` and `docs/sprint-6.md` completely. Inspect the current repository and start from the latest Sprint 6 source; the audited branch was `feature/sprint-06-case-tracking` at `ba354eef2f6e9bde7e29fe83975b06aca2e7c7de`. Create `fix/sprint-06-audit`, preserve unrelated changes and the completed Sprint 5 fixes, and implement F1–F7. Prioritize unsaved draft preservation through server refresh, immutable lost-response retries, in-flight edit handling, and null-safe direct-RPC revision validation. Repair dependent lifecycle chronology, action-switch state, missing historical facts, creation request identity, and UTF-8 payload limits. Use additive migrations and meaningful regressions. Keep all UI/error text Lithuanian. Verify with ordinary accounts on disposable Supabase and real authenticated browser journeys; distinguish mocks, SQL-engine probes, remote CI and physical-device checks. Update the Sprint 6 report, run the full required checks and both audits, commit and push normally, then inspect exact-candidate CI. Continue through fixes and verification. Do not merge into main, deploy, modify shared/production settings, expand into Sprint 7, force-push, or add assistant attribution.
