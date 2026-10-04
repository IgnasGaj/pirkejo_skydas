# Sprint 5.3 project hardening — implementation report

Date: 2026-10-03<br>
Branch: `feature/sprint-05-3-project-hardening`<br>
Base: Sprint 5.2 commit `50c9b56ce7ca7e67982b91bf4915b1b2f2fc9317`<br>
Implementation commit: `9298604dd9b97e76d7e1d1086106dabbb25bb086`<br>
Scope: local source and disposable Supabase only. No merge, deployment, or production change.

The attached [specification](sprint-05-3-project-hardening.md) was copied into `docs` and used as the acceptance baseline. The unrelated pre-existing untracked `docs/sprint-03-1-technical-hardening.md` was left untouched.

## Finding dispositions

| ID | Disposition and behavior |
| --- | --- |
| F1 | Fixed. A creation request ID now replays only when the stored canonical answers, facts, remedy, template/source version, purchase ID, and purchase version match. Changed retries return `CREATION_CHANGED` with the owned draft identity and never report the old facts as newly saved. The composer retains edits, loads the committed revision, and offers an explicit reapply action using the existing-draft guarded update. Identical creation and update replays deduplicate. |
| F2 | Fixed. A clean composer adopts a newer server revision as one set of facts, answers, remedy, and version. A dirty composer preserves local edits and requires the user to load/review the saved revision before discarding or consciously rebasing. Complaint identity is keyed at the page boundary. |
| F3 | Fixed. Delete no longer depends on family, answers, remedy, or valid editable facts; it still requires an owned complaint ID and confirmation. |
| F4 | Fixed for new/edited purchases. Purchase and complaint validation share the 100,000,000-cent ceiling. Product, seller, and reference fields are single-line in the UI/server contract and additive `NOT VALID` database constraints. Existing incompatible values remain readable and receive field-specific correction guidance in complaint review; editing the purchase can correct them without changing old generated versions. Unknown purchase channel also receives correction guidance. |
| F5 | Fixed. The entire complaint operation is wrapped, including authentication/client and purchase lookup. Private, no-store JSON has stable codes for invalid fields, stale revisions, missing evidence, unavailable signing, missing migrations, and backend failure. Known SQL cases are mapped deliberately; other failures are service errors. The client handles non-JSON responses without clearing facts. Server diagnostics contain only an error code and category. |
| F6 | Fixed. Purchase and complaint pages throw on complaint/history query errors into a Lithuanian retry state. Export distinguishes read failure (503) from an authorized missing record (404). Successful empty histories retain the normal empty display; ownership filters remain in place. |
| F7 | Fixed. Internal links and browser Back now prompt before discarding edited complaint facts. Cancel keeps the form; explicit discard leaves; confirmed save/deletion leaves without a second unload prompt. Private text is not placed in browser storage. |
| F8 | Fixed with conservative UTF-8 budgets before persistence and generation. Facts, answers, snapshot, sections, and text are checked against their SQL limits with JSONB formatting headroom. Oversized Unicode input gets Lithuanian size guidance and remains in the form. No content is truncated. |

## Verification and bounded improvements

| ID | Result |
| --- | --- |
| V1 | Ordinary uploads now reserve PENDING metadata before Storage upload. File and purchase deletion mark a retryable tombstone before removing Storage bytes. Database guards prevent new or late uploads from becoming READY during deletion; the signed generation RPC locks selected evidence rows. An interrupted PENDING or DELETING file is visible for cleanup. Historical text/snapshot stays immutable, while the UI displays a separate current attachment label: available, removed, or temporarily unavailable. Unit fault injection and disposable-backend upload/deletion and held-lock generation interleavings passed. PostgreSQL and Storage remain separate: a process crash during their handoff may leave an orphaned private object. Operators must reconcile bucket paths against metadata; no claim of cross-system atomicity is made. |
| V2 | Disposable local migrations and two-account browser/RLS flows were checked. Actual iPhone/Safari, Android, LAN HTTP phone use, trusted HTTPS phone use, and read-only production migration/key readiness remain pending because no devices or authorized production credentials were available. No production setting was changed. |
| V3 | Full audit: five high entries in the development chain `eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch → braces`. Production-only audit: zero. The [braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) lists no patched version. Owner: repository maintainer; recheck compatible lint-tool updates before the next release. No forced audit fix or blind Next downgrade was applied. |
| I1 | Purchase, complaint, and version lists now use bounded 20-row pages with deterministic secondary ordering. Evidence badges query only the current purchase page, and latest version labels use one bounded query per listed complaint. A disposable-browser test navigated 22 purchases and verified the page-two evidence badge. |
| I2 | Existing drafts always expose reassessment. The client recomputes the current Vilnius date on focus, visibility change, and a minute interval; server evaluation remains authoritative. An unsupported outcome cannot be generated. |
| I3 | Closing an existing-receipt scan aborts its fetch, invalidates late responses, and clears suggestions, proposed fields, and price origin. Slow close/reopen and manual-price regressions passed. |

## Checks executed on this branch

| Check | Result |
| --- | --- |
| Fresh `npm ci` and same-origin OCR preparation | Passed on Node 22.15.0 |
| `npm run lint`, `npm run typecheck`, `git diff --check` | Passed |
| `npm test` | 252 tests passed in 20 files |
| Production build with isolated `.next-sprint53` and disposable backend settings | Passed |
| Local Supabase migration application | All ten migrations applied; no migration failure |
| Public Chromium suite, including real same-origin OCR | 5 passed; 13 authenticated cases intentionally skipped in this mode |
| Authenticated disposable-backend Chromium suite | 14 passed; includes purchases, receipts, complaints, exports, two-account denial, pagination, mobile viewport navigation, and a held-lock generation/deletion interleaving |
| Development purchase and complaint forms | Passed with isolated `.next-dev-sprint04` output |
| PDF layout | Short 1-page and long 2-page samples rendered to PNG and visually inspected: Lithuanian glyphs, long names, wrapping, and page breaks legible. Samples were temporary QA files, not shipped documents. |
| `npm audit` / `npm audit --omit=dev` | Five high development-package entries / zero production entries. Full audit remains open. |

The prior Sprint 5.2 exact-commit CI result is historical evidence for `50c9b56`, not a test of this branch. No final-commit CI ran because this local branch was not pushed. The desktop/mobile viewport browser checks do not substitute for actual phones. Production migration, private bucket/RLS, and signing-key agreement still require an authorized read-only readiness check before launch.

## Post-audit follow-up (2026-10-04)

The Sprint 5.3 branch was subsequently pushed and its exact commit `6635e2676f8e02f67cfb04cb866e44977e796527` [passed CI](https://github.com/IgnasGaj/pirkejo_skydas/actions/runs/37135349992). The [post-Sprint 5.3 audit](sprint-05-3-audit.md) then identified A1–A3. The fixes are on `feature/sprint-05-3-audit-fixes`, with final code commit `b1d129fcd5d59f7124cf32bd5f7dca2d85ce4dc2`; see the [audit-fix implementation report](sprint-05-3-audit-fixes-report.md) for behavior and tests. CI [passed](https://github.com/IgnasGaj/pirkejo_skydas/actions/runs/37138226316) for the earlier fix commit `63a235e426b5a7d44f121076b67769a12734f1c9`. The final code commit remains local, so it has no exact-commit CI result. No merge or deployment occurred.
