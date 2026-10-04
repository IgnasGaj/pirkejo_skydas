# Pirkėjo Skydas — Sprint 5.3 audit-fix inspection

Date: 2026-10-04 (Europe/Vilnius)

Repository: https://github.com/IgnasGaj/pirkejo_skydas

Branch: `feature/sprint-05-3-audit-fixes`

Inspected commit: `63a235e426b5a7d44f121076b67769a12734f1c9`

Comparison baseline: `6635e2676f8e02f67cfb04cb866e44977e796527`

## Verdict

**The original P1 generation mismatch is corrected. Complete the two P2 follow-ups below before closing Sprint 5.3 and merging.**

A1 and A3 are resolved in the reviewed paths and exact-commit CI. A2's save/edit bypass is resolved, but history lifecycle and traversal remain incomplete. A date-dependent existing test also fails on October 4 despite the October 3 CI run passing.

This is a focused inspection of all nine changed files, the affected existing code and database guards, regression coverage, and exact-commit CI. It builds on the previous project audit; it does not repeat legal certification, production configuration inspection, or physical-device acceptance. No remaining P1 was identified within this scope.

## Original findings

| Finding | Result | Evidence |
| --- | --- | --- |
| A1: new-tab/modifier clicks clear dirty state | Fixed | Link interception excludes modifier keys, non-primary clicks, downloads and other targets. Navigation no longer marks facts saved. Local and saved revision counters control generation. CI opens actual new tabs and verifies stored/generated facts against the visible saved preview. |
| A2: later edits retain save-time unload bypass | Core defect fixed; history follow-up remains | Existing-draft save no longer grants leave bypass. New edits reset the allowance. CI covers repeated saves, subsequent edits, native reload/close warnings, cancelled Back and accepted departure. R1 below covers missing lifecycle and Forward cases. |
| A3: failed Storage cleanup deletes recovery metadata | Fixed | Failure path marks PENDING/READY metadata DELETING before cleanup, clears its claim, and retains it when object removal fails. Metadata deletion follows successful removal. Three disposable-backend tests passed in CI. |

Ordinary uploads now reserve a 15-minute claim and require the matching token to become READY. Evidence and purchase removal retain metadata while a claim is active. The backend interleaving test holds an ordinary upload, marks its document DELETING, then completes the late upload and verifies that both row and object disappear. Existing terminal-state and parent-deletion guards remain unchanged. Storage/database crash atomicity and lease-expiry limitations still require operational reconciliation.

## R1 — P2: history guard is not reversible and treats Forward as Back

Location: `src/features/complaints/ComplaintComposer.tsx`, lines 115–143.

The mount effect unconditionally pushes a new same-URL sentinel. Cleanup removes listeners but leaves the history entry and marker. The handler then treats every popstate whose marker differs from the current sentinel as a Back attempt; after confirmation, or when clean, it calls `history.back()`.

Two temporary tests executed against the actual component established:

1. Render under React StrictMode: effect setup/cleanup/setup pushes **two distinct sentinels**. Unmount leaves the last marker in `history.state`. Setup is therefore not reversible, and the comment promising one sentinel is not true for this lifecycle.
2. With unsaved facts, add a same-document `#reviewed-facts` entry, perform actual JSDOM history Back to the sentinel, then actual history Forward to the hash entry. Forward opens the discard prompt and, when accepted, calls `history.back()` instead of allowing forward traversal. The first Back to the sentinel did not prompt.

These are executed component/JSDOM history reproductions. They are not a native Chromium reproduction of the complete Next.js router lifecycle. Duplicate-entry effects on route remounts, confirmed exits and page skipping must be verified in the browser follow-up rather than inferred as an already observed production incident. No data corruption or unauthorized access was demonstrated.

Required change:

- Make history installation safe across StrictMode setup/cleanup/setup, remounts, refreshes and same-tab exits. Preserve Next.js history metadata.
- Recognize movement relative to the guard entry. Do not call Back for arbitrary Forward or same-document traversal.
- Keep unsaved revision bookkeeping independent of navigation allowance. Preserve the A1 fix and reset protection on every new edit.
- Avoid introducing asynchronous cleanup that navigates away from a subsequently mounted route. Verify any history repair against the real router.

Acceptance:

- Development mode with StrictMode and production mode: clean Back exits predictably; repeated opening, saving, leaving and reopening does not accumulate stale guard entries.
- Same-document hash Back/Forward works without a discard prompt when the form stays open.
- Actual departure while dirty still prompts; cancellation preserves values and history; acceptance leaves once and does not skip an unrelated page.
- Repeated save/edit, modifier/new-tab, reload and close regressions continue passing.

## R2 — P2: retry test depends on the current calendar day

Location: `src/app/api/purchases/[id]/complaints/route.test.ts`, lines 36–45; supporting behavior in `src/features/complaints/domain.ts` and the complaints POST route.

The fixture builds stored answers with `decide(..., "2026-10-03")`. The actual POST handler uses `todayInVilnius()`, and `decide` sets `answers.asOfDate` from that date. Canonical equality therefore differs on October 4.

Executed unmodified suite on October 4:

**257 passed, 1 failed, 3 integration tests skipped.** The failing test was `deduplicates only an identical creation operation`: expected status 200, received 409.

Diagnostic confirmation: temporarily mock only `todayInVilnius` to October 3; all five route tests pass. The diagnostic mock was then removed. This explains why the exact same commit passed CI on October 3.

Required change: control the test clock or date dependency and restore it after each test. Build fixtures with the same controlled assessment date as the route. Preserve date-sensitive server reassessment; do not remove `asOfDate` comparison merely to make this test green. Add a separate controlled midnight/next-day test documenting the intended recovery behavior when assessment date changes. Review related date-sensitive fixtures for similar assumptions.

This is a test determinism defect inherited from the baseline, not evidence that the new audit-fix code caused a runtime retry regression. Cross-day assessment changes need explicit behavioral coverage.

## Verification

### Local inspection

| Check | Result |
| --- | --- |
| Fresh `npm ci` and OCR preparation | Passed; 481 packages installed |
| ESLint | Passed on unmodified branch |
| TypeScript | Passed on unmodified branch |
| Full unit/component suite on October 4 | 257 passed, 1 failed, 3 integration tests skipped; R2 |
| Production build, blank public Supabase variables | Passed; reused webpack cache emitted restoration warnings before successful compilation |
| Two temporary history reproductions | Passed assertions proving the R1 behavior |
| Route suite with temporary October 3 date mock | 5 passed; confirms R2 diagnosis |
| Diff check and diagnostic removal | Diagnostics removed; final repository cleanliness checked before delivery |

The local runtime is Node 24.19.0; CI uses Node 22. The production build started before temporary diagnostics were added. Diagnostic changes were confined to the isolated scratch checkout and were restored; they are not part of the pushed commit.

### Exact-commit CI independently inspected

Run: https://github.com/IgnasGaj/pirkejo_skydas/actions/runs/37138226316

Job: `111247043965`

Commit: `63a235e426b5a7d44f121076b67769a12734f1c9`

Conclusion: **success**, executed October 3.

Decoded logs and job steps establish:

- Fresh install, lint, typecheck and production builds passed.
- Unit/component suite: **258 passed, 3 integration cases skipped** in ordinary mode.
- Public Chromium: **5 passed, 15 authenticated cases skipped**.
- Disposable Supabase integration run: **3 passed**, covering failed object cleanup, failed metadata deletion, and late-upload overlap. Owner/cross-account recovery checks are included.
- Authenticated Chromium: **15 passed**, including actual new-tab/modifier interaction, repeated save/edit, reload/close protection and preview-to-generated-facts comparison.
- Authenticated development purchase/complaint forms and disposable-stack cleanup passed.

Transient Docker registry rate-limit messages appear during setup, but setup and the subsequent live tests completed successfully. The green historical CI result does not contradict today's date-dependent unit failure.

### Limits

No installed local Chromium, Docker or Supabase CLI was available for a separate local browser/live-backend run. Browser and live-backend conclusions above come from inspected exact-commit CI and reviewed test source. Physical iPhone/Safari and Android behavior, production migration/RLS/bucket/signing configuration and fresh visual PDF QA remain unverified here. Dependencies did not change in this fix commit; the earlier development dependency findings remain a follow-up, not a new clean-audit claim.

## Documentation and handoff

`docs/sprint-05-3-audit.md` contains the original audit, including its old hold verdict and old commit. Retain it as historical evidence, but add a current implementation/verification report identifying this fix commit, addressed findings, remaining R1/R2 and the actual CI counts. Do not present the historical file as the current inspection result.

### Codex prompt

Continue from `feature/sprint-05-3-audit-fixes` commit `63a235e426b5a7d44f121076b67769a12734f1c9`. Read this inspection and resolve R1 and R2. Preserve the verified A1/A3 fixes, revision-based dirty state, save/edit unload protection, claim-token upload checks, retained cleanup tombstones, ownership, immutable versions and generation evidence locks. Make history handling reversible across StrictMode/remounts and correctly distinguish Forward, same-document traversal and actual departure. Make the retry test independent of the real date and add controlled cross-day coverage without weakening server legal reassessment. Add meaningful browser regressions for history lifecycle, rerun all required checks, and write a current implementation report with exact results and limitations. Keep UI Lithuanian. Do not merge, deploy or modify production data.
