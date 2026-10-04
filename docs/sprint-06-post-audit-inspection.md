# Pirkėjo Skydas — Sprint 6 post-audit inspection

Inspection date: 2026-10-04 (Europe/Vilnius).
Repository: https://github.com/IgnasGaj/pirkejo_skydas
Inspected branch: `fix/sprint-06-audit`.
Inspected SHA: `de4a07f061a8948799702b542540eaf1a67a1c52`.
Audit-fix code SHA: `495dcbdc383bf55d87aed148dde9458316e85009`.
Original audited SHA: `ba354eef2f6e9bde7e29fe83975b06aca2e7c7de`.
Current remote main: `735d861cbf2d8b26534abc2cd7c2e4093cabc7b1`.

## Verdict

**Proceed to Sprint 7 development from the verified fix branch.** No remaining blocker from F1–F7 was identified in the inspected changes. This is acceptance of the repaired Sprint 6 development baseline, not certification of production readiness or every possible journal input.

Sprint 6 is still unmerged. Starting Sprint 7 from current main would omit case tracking and its audit fixes. Use the fix branch as the dependency unless a later main demonstrably contains it. No merge, deployment, repository write, production migration, or shared-setting change was performed during this inspection.

## Inspection evidence

Read the original audit, Sprint 6 specification, completion report, follow-up diff, case form/API/validation, list refresh, detail loader, original and additive SQL, types, domain tests, integration tests, authenticated case journey, CI workflow, and existing complaint exports. The checkout contains no AGENTS.md.

### Fresh local verification on the inspected SHA

| Check | Result |
| --- | --- |
| Clean `npm ci` | Passed |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm test` | 272 passed; 6 opt-in backend tests skipped |
| `npm run build` | Passed |
| `git diff --check` and worktree inspection | Passed; application source unchanged |
| `npm audit --omit=dev` | 0 vulnerabilities |
| Full `npm audit` | 5 high entries, 0 critical; developer-tooling dependency chain |
| Fresh local Playwright | Unavailable: Chromium installer repeatedly received a truncated/invalid archive |
| Fresh local authenticated backend / development forms | Unavailable: Docker and disposable Supabase are absent in this environment |
| Physical iPhone/Safari, Android, LAN HTTP | Not performed |

The full audit entries are `braces`, `micromatch`, `fast-glob`, `@next/eslint-plugin-next`, and `eslint-config-next`. These are five affected dependency entries in the tooling chain, not five independent production vulnerabilities. Keep maintenance tracked; do not use a forced framework downgrade as an audit repair.

### Independently inspected remote CI

Latest exact-SHA run: https://github.com/IgnasGaj/pirkejo_skydas/actions/runs/37216102883

The run is completed/success and its head SHA exactly matches `de4a07f061a8948799702b542540eaf1a67a1c52`. The jobs/steps API confirms success for clean installation, lint, typecheck, tests, production builds, public browser tests, disposable Supabase startup, ordinary test-account preparation, integration tests, authenticated browser tests, development-form check, and backend teardown.

The audit-fix code commit also passed: https://github.com/IgnasGaj/pirkejo_skydas/actions/runs/37215686780

Remote success is genuine CI evidence. It does not turn unavailable local or physical-device checks into passed checks. The completion report records 6 integration tests, 5 public browser tests, and 16 authenticated browser tests; this inspection verified CI step success, not fresh local execution of those counts.

## Findings disposition

| Original finding | Inspected repair and regression evidence | Assessment |
| --- | --- | --- |
| F1 — dirty refresh / changed retry / pending-save loss | Form no longer remounts on revision. Authored revision and immutable complete attempted request are retained. Editable controls are disabled while pending. Changed drafts after ambiguous saves survive replay and require review. Browser journey checks response loss, exact replay after another write/focus refresh, preserved edits, and stale correction review. | Addressed |
| F2 — NULL revision bypass | Additive SQL validates required arguments and revision bounds and uses `IS DISTINCT FROM`; deletion has its own boundary validation. Ordinary-account integration rejects NULL, negative, upper-bound and stale revisions and checks unchanged summary/event count. | Addressed |
| F3 — contradictory lifecycle dates | Closure/resolution, reopening, service-return and next-service boundaries are checked transactionally. Resolution requires completion of open service. Closing retains the service episode; reopening resumes it. Integration covers rejected chronology and valid same-day transitions while permitting older correspondence. | Addressed |
| F4 — action switch retains supposedly cleared fields | Confirmed switch calls form reset and resets receipt-known, dirty and edit/revision state. Outstanding ambiguous requests prevent switching. Browser journey asserts actual cleared note and clean navigation. | Addressed |
| F5 — omitted historical facts | Typed rendering exposes original submission method/receipt, service reference/promise and return result. Browser journey checks service details and older history pages. | Addressed |
| F6 — creation UUID reused for another version | Private creation receipts bind every request identity to its exact version/case, including shortcuts to existing cases. SQL checks request receipt before version shortcut and checks conflicts after insert. Integration covers changed identities and concurrent same-version creation. | Addressed |
| F7 — inconsistent Unicode limits | Payload cap deliberately increased to 8192 bytes; validation counts Unicode code points and UTF-8 size with JSONB separator headroom. SQL still checks types, field lengths and bytes. Unit tests cover maximum emoji, Lithuanian text and escaping; backend test covers accepted combined Unicode and rejected oversize payload. | Addressed |

These conclusions are based on code inspection, fresh baseline tests, inspected regression assertions, and passing exact-commit CI. They do not assert that every scenario listed in the original audit received an independent new reproduction here.

## Remaining limits and follow-up

1. Physical-device and LAN checks remain a launch-readiness task. Use the existing report's checklist and record actual results before production launch.
2. Both migrations must be deployed in order: `20261004000000_case_tracking.sql`, then `20261004010000_case_audit_fixes.sql`. Production migration state has not been inspected or changed here.
3. Existing deadline verification is bounded through 2026-10-31. Preserve unavailable states. Reverify sources before extending the window or using the calculator in new legal guidance.
4. The official VVTAT request page was opened on the inspection date: https://vvtat.lrv.lt/lt/kaip-pateikti-prasyma/ . It supports escalation preparation and evidence-copy guidance. Opening the exact e-TAR consolidated PDF recorded in code returned HTTP 403; this inspection does not newly certify every legal arithmetic or admissibility rule.
5. The browser journey provides a strong regression path but does not prove all clock-controlled midnight, timer-refresh, cancellation, collection-scale, or multi-device scenarios. Expand these where Sprint 7 depends on them; do not label them newly passed.
6. Five developer-tooling audit entries remain for maintenance before launch. Production audit is currently clean.

## Next sprint

Sprint 7 is **VVTAT evidence package and escalation preparation**, following the existing roadmap. It should reuse pinned complaint versions, the corrected journal and original private evidence, produce a reviewed private summary and ZIP, and guide manual submission. It must not infer legal admissibility, alter old documents, automatically submit to VTIS, or add wishlist/price comparison features.

Read `sprint-07-vvtat-package.md` for the implementation handoff. Starting development from the verified dependency does not require merging the fix branch into main first.
