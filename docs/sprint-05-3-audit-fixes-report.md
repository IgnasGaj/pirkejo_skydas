# Sprint 5.3 audit follow-up — implementation report

Date: 2026-10-04<br>
Branch: `feature/sprint-05-3-audit-fixes`<br>
Audited Sprint 5.3 base: `6635e2676f8e02f67cfb04cb866e44977e796527`<br>
Fix commits: `63a235e426b5a7d44f121076b67769a12734f1c9`, `b1d129fcd5d59f7124cf32bd5f7dca2d85ce4dc2`<br>
Scope: source and disposable local Supabase. No merge, deployment, production credential, production data, existing generated document, or applied migration was changed.

The supplied [audit](sprint-05-3-audit.md) is in `docs`. The audited branch's origin ref resolved to the stated base commit before and after the new branch was created. The unrelated pre-existing untracked `docs/sprint-03-1-technical-hardening.md` was left untouched.

## Finding dispositions

| ID | Result and proof |
| --- | --- |
| A1 | Fixed. The composer now tracks local and saved edit revisions separately. Opening a target-blank link, Command/Ctrl/Shift-clicking a link, downloading, or following a same-document anchor never marks entered facts saved. Only actual same-tab exits prompt. The browser regression kept the edited name in the preview with generation disabled after three real new-tab/window interactions; after an explicit save, the generated database snapshot and text matched the displayed saved name. A cancelled same-tab exit retained edits. |
| A2 | Fixed. Saving an existing draft advances the saved revision without granting a leave bypass. New edits revoke any in-progress allowance. A mounted composer installs one Back sentinel, reused across edit/save cycles; cancelled Back restores it, while accepted Back leaves once. A one-use allowance handles an authorized unload, with a timeout for a cancelled navigation. Browser tests covered two save/edit cycles, actual refresh and close warnings, cancelled same-tab and Back navigation, and accepted discard. |
| A3 | Fixed. Ordinary uploads reserve a timed claim with PENDING metadata. If upload or READY transition fails, cleanup first marks the owned row DELETING and clears the completed uploader's claim. A Storage removal error keeps that row and path. A no-error Storage response is followed by an owner-scoped absence check; row deletion occurs only after the object is confirmed absent. File and purchase deletion retain active upload metadata/parent rows until the uploader finishes or its claim expires, preventing a late upload from losing its tracked path or becoming READY. Disposable-backend fault tests proved failed READY plus failed Storage cleanup, a no-error response that left bytes present, successful Storage cleanup plus failed row deletion, overlapping deletion and late upload, immediate authorized retry, and cross-account denial. No migration was needed because the existing claim and deletion columns are used. |

The existing creation retry, refreshed revision, reassessment, ownership filters and RLS, immutable generated versions, and signed generation evidence locks were not relaxed. The full authenticated browser suite covered their existing regressions on the final local code. A creation-retry test now obtains the current Vilnius date rather than pinning October 3, which caused a false failure after midnight.

## Verification

| Check | Result |
| --- | --- |
| Fresh `npm ci`, same-origin OCR preparation | Passed on Node 22.15.0 before the final source-only refinement; dependencies did not change |
| `npm run lint`, `npm run typecheck`, `git diff --check` | Passed |
| `npm test` | 259 passed in 20 files; four disposable-backend integration cases intentionally skipped without credentials |
| `npm run test:integration` with disposable Supabase and two ordinary accounts | 4 passed; actual Storage and database rows checked after injected failures |
| Production build using isolated `.next-sprint53-audit` output | Passed |
| Local migration application | All ten existing migrations applied to a fresh disposable database; no new migration |
| Public Chromium including real same-origin OCR | 5 passed; 15 authenticated cases intentionally skipped |
| Authenticated Chromium full suite | 15 passed against the final local build, including the new navigation regression, two-account RLS, immutable versions and evidence-lock interleaving |
| Authenticated development purchase and complaint forms | Passed |
| `npm audit --omit=dev` | Zero production dependency findings; fresh install still reported five high development-chain findings |
| GitHub CI for the first fix commit `63a235e426b5a7d44f121076b67769a12734f1c9` | [Passed](https://github.com/IgnasGaj/pirkejo_skydas/actions/runs/37138226316); historical evidence before the final A3 absence check |
| Exact-commit CI for final code commit `b1d129fcd5d59f7124cf32bd5f7dca2d85ce4dc2` | Not run: the final local commit was not pushed, per the current task instruction |

Temporary local email confirmation was disabled solely for disposable account setup, then `supabase/config.toml` was restored. The local Supabase stack was stopped without backup and temporary account credentials were removed. No production connection was used.

## Remaining limits

Storage and PostgreSQL cannot form one atomic transaction. A late upload continuing beyond its 15-minute claim or an unexpected cross-system crash/interleaving can still need operator reconciliation of private object paths against rows. The corrected handled failure path retains retryable metadata. Actual iPhone/Safari, Android, LAN HTTP and trusted HTTPS checks, and read-only production migration, bucket/RLS and signing-key readiness remain pending; browser viewport checks are not physical-device results. Dependency maintenance remains separate from A1–A3.
