# Sprint 5.3 — Full-project inspection and debugging / improvement sprint

Project: **Pirkėjo Skydas**<br>
Inspection date: **2026-10-03**<br>
Repository: https://github.com/IgnasGaj/pirkejo_skydas<br>
Inspected branch: `feature/sprint-05-2-browser-compatibility`<br>
Inspected commit: `50c9b56ce7ca7e67982b91bf4915b1b2f2fc9317`<br>
Observed `main`: `9531c3b88fa3d3e13d8efb9301993489d6f4b567`

## 1. Verdict

Do a focused Sprint 5.3 before starting Sprint 6. The application builds and its existing checks pass, but complaint recovery and error handling still have gaps. The highest-priority finding is a changed creation retry that can be acknowledged as saved while the earlier facts remain stored.

Sprint 5 is not on `main` at the inspected revision. Base implementation on the inspected Sprint 5.2 branch or a descendant containing its changes. Do not start from the older `main` and accidentally omit complaints, reassessment, signing, or the browser UUID fix.

This document contains the inspection results and an implementation specification. The inspection did not fix application code, change production settings, merge branches, or push commits. Temporary diagnostic tests were used to reproduce findings and removed afterward.

## 2. Scope and evidence

Reviewed the return and defective-product engines and wizards; purchase validation, creation, editing and listing; receipt parsing, OCR worker lifecycle, upload claims, corrections and private evidence access; complaint composer, API, immutable versions, PDF/text exports and SQL functions; authentication, session handling, all five migrations, configuration, dependency lockfile, CI and tests. Compared the current code with earlier inspection and hardening records and the project roadmap.

This is a broad source and executable-check inspection, not a claim that every possible input or deployed environment was exercised. No production database or actual phone was available. Current national legal editions were not independently recertified; no new substantive legal defect is asserted in this report.

### Checks performed during this inspection

| Check | Result |
| --- | --- |
| Fresh `npm ci` and OCR asset preparation | Passed |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| Existing `npm test` | **234 passed in 17 files** |
| Production build with blank public Supabase settings | Passed |
| Additional diagnostic probes | **8 passed their defect-reproduction assertions** in 3 temporary files; these demonstrate defects, not corrected behavior |
| Local production HTTP smoke | `/`, `/returns`, `/defective-product`, `/login`: 200; purchase routes: login redirects; unauthenticated complaint POST: 401 JSON with `private, no-store` |
| Full `npm audit` | 5 high package entries in the development dependency chain ending at `braces`; audit is not clean |
| `npm audit --omit=dev` | 0 findings |
| Local Chromium browser suite | Not run: Chromium download repeatedly returned an invalid/truncated archive; no installed browser was available |
| Local authenticated browser/RLS suite | Not run: Docker and Supabase CLI were unavailable; no test backend credentials were supplied |
| Exact-commit GitHub CI | **Passed**; inspected job steps include public browser, disposable Supabase, authenticated browser, and development-form checks |
| Actual iPhone/Safari, Android, trusted HTTPS | Not performed here |
| Production migrations/signing-key readiness | Not inspected or changed |

Local runtime was Node **24.19.0**; the README and CI target Node **22**. The successful exact-commit CI supplies Node 22 verification, separate from the local run.

CI evidence: https://github.com/IgnasGaj/pirkejo_skydas/actions/runs/37121822317 . The exact-commit job completed successfully, including authenticated verification and cleanup. The older Sprint 5.2 report's statement that final CI was pending is now historical.

## 3. Confirmed findings

P1 = fix before accepting the complaint workflow and starting dependent case tracking. P2 = required correctness, recovery or usability work in this hardening sprint. No finding below demonstrates cross-account data access.

| ID | Priority | Finding | Evidence |
| --- | --- | --- | --- |
| F1 | P1 | Edited creation retry can report success for earlier stored facts | Actual composer and API probes, with injected network/database outcomes |
| F2 | P2 | Refreshed draft props do not update its editable facts/version | Actual component rerender probe |
| F3 | P2 | Delete can become an enabled no-op after reassessment | Actual component interaction probe |
| F4 | P2 | Purchase and complaint validation disagree on supported values | Actual domain probes |
| F5 | P2 | Complaint API errors are incomplete or misclassified | Actual exception probe plus API/SQL review |
| F6 | P2 | Complaint/history query errors are shown as empty or missing data | Server-page and export-route review |
| F7 | P2 | Unsaved complaint edits lack protection on internal navigation | Composer/page navigation review |
| F8 | P2 | Valid Unicode facts can exceed the database byte limit | Actual domain/UTF-8 probe plus migration constraints |

### F1 — Creation retries must represent the same facts

Files: `src/features/complaints/ComplaintComposer.tsx`, especially `change`, `submit` and request-ID rotation; `src/app/api/purchases/[id]/complaints/route.ts`, creation insert and `23505` retry path.

Reproduction:

1. Prepare a new eligible complaint and save facts A.
2. The database commits, but the response is lost. The composer retains the save request ID and allows editing again.
3. Change the consumer name or other facts to B and save again.
4. The composer sends B with the same creation request ID. The duplicate-insert path reads only `id,draft_version` and returns success for the already-created draft A.

The probes confirmed the changed payload uses the same ID and the actual API duplicate path reports 200 without comparing stored facts. The combined network/database scenario was simulated, not reproduced against live Supabase. It can discard the user's later edits when the composer navigates to the existing draft.

**Required fix:** Bind idempotency to a canonical operation payload, including reviewed facts, assessment, remedy and purchase binding. A retry of that same operation must recover its result. A different payload must not be acknowledged as saved under the previous identity. After an ambiguous outcome, preserve local edits, recover the committed draft, and offer an explicit way to apply those edits to it. Blindly generating a new creation ID after any network error can create duplicate complaints and is not sufficient.

Existing-draft SQL already hashes its update payload. Keep that guard, but make edited retries recoverable rather than trapping the user in repeated conflicts.

**Acceptance:** Drop the first creation response after commit, change facts, retry, and verify the screen and stored revision agree. Verify identical creation/update retries deduplicate, different payloads cannot silently succeed, and no duplicate complaint is created during recovery.

### F2 — Refresh does not resolve a stale draft revision

File: `src/features/complaints/ComplaintComposer.tsx`, initial `useState` values for facts, family, answers, remedy and `draftVersion`.

The probe rerendered draft version 1 with server props for version 2 and a changed consumer name. The component still displayed version 1's name and submitted `expectedVersion: 1`. A Next client refresh can preserve the component and its state; the instruction to refresh is therefore incomplete recovery guidance.

**Required fix:** Provide an explicit conflict recovery action. If there are no local edits, adopt the current server revision coherently. If edits exist, retain them and explain the conflict before loading/reapplying. Never adopt only a newer version number while leaving old facts marked clean. Reset correctly when complaint identity changes.

**Acceptance:** Two tabs edit the same draft. The second detects the conflict, can load/review the current saved revision without a full-page restart, and can save a consciously reviewed revision. Generated text matches the revision shown as saved.

### F3 — Deletion should not require a selected remedy

File: `src/features/complaints/ComplaintComposer.tsx`, `prepared` and the opening guard in `submit`.

Reassessment sets `remedy` to null. The delete button remains enabled, but `submit("delete")` exits at `if (!family || !answers || !remedy) return`. The probe confirmed the confirmation dialog runs and no network request follows.

**Required fix:** Validate requirements per operation. Deleting an owned existing complaint requires its identity and the deletion request context, not eligibility, completed facts or a remedy. Preserve ownership checks and the existing confirmation.

**Acceptance:** Delete an existing draft after reassessment before choosing a remedy, with invalid editable facts, and with a currently unsupported assessment. Each authorized deletion works; cancelled confirmation changes nothing; another account cannot delete it.

### F4 — Align purchase and complaint input contracts

Files: `src/features/purchases/domain/validation.ts`, `src/features/complaints/domain.ts`, purchase/complaint database constraints.

Two probes demonstrated mismatches:

- Purchase validation accepts `1000000.01` EUR, but complaint `priceCents` is capped at `100_000_000` cents. That purchase cannot pass complaint validation.
- Purchase validation accepts embedded line breaks in product/seller names; complaint single-line facts reject them, and facts must equal the saved purchase. This concerns server-accepted input, including crafted requests or existing rows; ordinary single-line HTML inputs limit the normal typing path.

**Required fix:** Share explicit limits and single-line validation where appropriate. Decide the supported monetary range once and apply it consistently in UI, server, database and exports. Existing inconsistent records must get a clear correction path; do not silently rewrite historical documents or truncate factual values.

**Acceptance:** Boundary prices and line-break/control-character inputs are handled consistently. A supported saved purchase can reach complaint review. Existing incompatible records show a field-specific explanation and can be corrected.

### F5 — Return useful, truthful API errors

Files: `src/app/api/purchases/[id]/complaints/route.ts`, complaint SQL functions and composer response handling.

The purchase lookup and authentication/client setup precede the route's `try`. The diagnostic probe confirmed a purchase-query exception escapes the JSON error wrapper. The composer unconditionally calls `response.json()`, so an unstructured server response can expose a parsing error instead of a useful Lithuanian recovery message.

Other confirmed code paths collapse different causes:

- Validation failures become a generic 400 without the useful domain explanation or field issue.
- Any generation RPC error becomes “purchase/draft/evidence changed” with 409, even if the private key is missing/mismatched, the function/migration is missing, a size constraint fails, or the backend is unavailable.
- No safe diagnostic logging exists in the complaint route's general catch.

**Required fix:** Wrap the full operation; use stable machine-readable error codes and appropriate statuses for validation, stale revision, missing evidence, authentication, unavailable configuration and backend failure. Map known SQL failures deliberately and handle unknown errors as service errors. Handle non-JSON responses in the client and retain entered facts. Add minimal server diagnostics without consumer text, email, tokens, payloads or signing secrets. Readiness checks must never reveal key material.

**Acceptance:** Exercise backend exceptions, missing/mismatched signing configuration, missing migrations, invalid fields and genuine concurrency conflicts. Each returns structured private/no-store JSON with truthful Lithuanian guidance. Repeated retries do not lose facts. No secret or complaint body appears in logs.

### F6 — Do not display query failure as an empty history

Files: `src/app/purchases/[id]/page.tsx`, `src/app/purchases/[id]/complaints/[complaintId]/page.tsx`, `src/app/api/purchases/[id]/complaints/[complaintId]/versions/[versionId]/route.ts`.

The purchase page discards errors from complaint/version queries. The complaint page discards draft/version query errors and uses `versions ?? []`; a draft query failure can become `notFound()`. Export queries likewise ignore error fields. A missing migration or backend failure can therefore appear as “no documents,” “no prepared versions,” or an ordinary missing document.

**Required fix:** Distinguish successful empty results, authorized missing records and backend failure. Keep unauthorized access opaque; show an appropriate retry/unavailable state to an authorized user when reads fail. Never claim history is empty because its query failed.

**Acceptance:** Inject complaint and history query failures; previously saved documents are not represented as nonexistent. Successful empty histories still show the normal empty state; cross-account queries reveal no record details.

### F7 — Protect edits during in-app navigation

Files: complaint composer `beforeunload` effect and page-level back/edit links.

Only `beforeunload` is registered. Next links and client routing can unmount the composer without unloading the document. Following “← Pirkinys” or the purchase edit link can discard unsaved complaint facts without the browser warning. This is a source-flow finding; a real-browser navigation reproduction was not run here.

**Required fix:** Protect the relevant internal leave actions as well as full-page unload. Let the user remain, save where supported, or explicitly discard. Do not warn after a confirmed save or successful deletion. Do not persist private complaint text to browser storage as an incidental workaround.

**Acceptance:** Type unsaved facts and exercise back, purchase-edit and other internal exit paths. Cancelling retains all facts; confirmed discard navigates; successful save navigates normally. Verify keyboard and mobile usability.

### F8 — Validate byte budgets before persistence

Files: complaint facts schema, API serialization, and `20261003000000_complaints.sql` JSONB size constraints.

Application field limits use string length while SQL limits `facts` to 16,000 bytes. A diagnostic used valid 4,000-character defect text, 1,000-character explanation and 500-character alternative proof with three-byte Unicode characters, plus other valid fields. Domain validation succeeded, but even compact UTF-8 JSON exceeded the SQL facts limit. PostgreSQL JSONB adds formatting overhead. An ordinary field-valid request can therefore fail only at save time and receive the generic error from F5.

**Required fix:** Define shared document budgets for facts, answers, snapshots, sections and text. Check accepted payloads against their database representation conservatively, or revise constraints through a justified additive migration. Explain excessive size before marking a draft saved. Keep controls bounded; never silently truncate legal facts. Clear irrelevant remedy-specific facts only with an explicit, reviewed rule.

**Acceptance:** Test long Lithuanian text, other valid Unicode text and near-limit combinations at domain, API and database levels. Every accepted save fits the constraints, or returns actionable size guidance while retaining input. Saved valid content can still generate and export.

## 4. Required verification and improvements

### V1 — Evidence deletion and generation consistency

Files: `src/features/purchases/data/document-service.ts`, receipt upload/save paths, Storage policies, signed generation RPC.

This is an **unverified concurrency/failure risk**, not a demonstrated live data-loss incident. Storage removal occurs before metadata/purchase deletion, with no durable deletion state. If the subsequent database operation fails, metadata can still describe a READY document whose object has gone. Purchase removal lists documents once; concurrent upload can add an object after that list. The generation RPC checks selected metadata without locking document rows, while Storage availability was checked earlier in a separate request.

Define the guarantees and test synchronized interleavings: deletion versus generation; deletion versus ordinary/reviewed upload; successful Storage deletion followed by failed metadata deletion. Implement recoverable deletion coordination/cleanup where needed. Do not promise that PostgreSQL locks make Storage operations atomic. After purchase deletion, cleanup must not depend solely on the deleted purchase still satisfying current Storage RLS. Use only a disposable backend and synthetic records.

Keep generated historical text immutable. Add a separate current availability label for each historical attachment where useful: available, removed, or temporarily unavailable. A filename in an old document is not proof that the file is currently downloadable. Never mutate the snapshot to reflect today's attachment state.

### V2 — Phone and environment acceptance

Run the complete purchase → receipt → questionnaire → save/reopen/edit → generate → PDF/text/copy → delete journey on actual iPhone/Safari and Android, including the reported LAN HTTP setup and a trusted HTTPS origin. Test camera format, cancellation, upload retry, keyboard, scrolling, layout and clipboard fallback. Keep the secure UUID fallback from Sprint 5.2.

Check production migration/signing readiness read-only if authorized credentials are available: all five existing migrations plus any new additive migrations, private bucket/RLS, and agreement between application and database signing configuration. Report missing access as pending. Do not modify production configuration to make tests pass.

### V3 — Dependency maintenance

The latest branch already overrides PostCSS to `8.5.28`; the old “two PostCSS findings” state does not describe this revision. Fresh audit found five high development-package entries through `eslint-config-next` → `@next/eslint-plugin-next` → `fast-glob` → `micromatch` → `braces`. Production-only audit was clean.

Advisory checked on inspection date: https://github.com/advisories/GHSA-vfj7-8cjw-p6xm . It lists affected `braces <=3.0.3` and no patched version. This inspection did not establish an application-request exploit through that development toolchain. Investigate compatible remediation; do not run `npm audit fix --force` or downgrade Next tooling blindly. If no compatible fix exists, document exposure, owner and follow-up instead of reporting audit as passed. Record both full and production-only audit results.

### I1 — Pagination and accurate lists

`listPurchases` and complaint histories fetch without page controls; evidence badges also rely on one multi-ID query. Add bounded, stable pagination and appropriate aggregate/latest-version queries before larger collections become slow or incomplete under backend row limits. This is a scalability improvement, not a reproduced missing-row incident. Synthetic large collections must remain fully navigable, with accurate evidence badges and latest-version labels.

### I2 — Reassessment and date freshness

Make legal reassessment deliberately accessible on an existing draft even when its purchase timestamp/discovery date has not changed. Currently the composer offers reassessment only for those changes, despite unsupported-result text asking the user to repeat it. Refresh date-sensitive assessment state after a Vilnius date change or return to an old tab. Keep server evaluation authoritative; never restore an expired entitlement merely to enable generation. Provide clear guidance when the result is no longer supported.

### I3 — Existing-receipt scan recovery

`ExistingReceiptScanner.load` lacks request cancellation or a generation guard. Closing a scan clears the file, but an earlier fetch can subsequently resolve and set it again. Proposed correction values and price origin also survive closing. Improve cancellation/session reset and make reopening a clear review session, preserving explicitly intentional values only. Test close/reopen during a slow fetch and repeat scans with selected/manual prices. This is a source-review improvement; it was not reproduced on a real phone here.

## 5. Implementation boundaries

- Keep application text Lithuanian and technical handoff/report English.
- Repair the existing workflow. Do not implement Sprint 6 case tracking, timers, automatic email submission, VVTAT packaging, retailer integrations or unrelated redesign in this sprint.
- Preserve deterministic legal decisions, explicit reviewed facts, one remedy, immutable generated versions, original evidence bytes, ownership isolation and private Storage.
- Retain the corrected Sprint 5.1 remedy validation, reassessment/rebinding and discovery-date checks, and Sprint 5.2 secure browser UUID fallback.
- Use additive migrations for database changes. Do not edit applied migrations to conceal history or alter old generated documents.
- Use synthetic data and an isolated backend for destructive/concurrency checks. Production inspection is read-only unless separately authorized.
- Work in a new branch such as `feature/sprint-05-3-project-hardening`, based on the correct latest Sprint 5 source. Inspect the working tree and preserve unrelated changes.
- For this handoff, finish code, tests and a concrete report. Do not merge to `main` or deploy as part of the inspection/implementation instruction alone.

## 6. Completion and testing

Implement F1–F8 first; complete V1–V3 verification and the bounded I1–I3 improvements where feasible within this sprint. Every unresolved item must remain explicit with its reason and consequence. Do not describe skipped device, database, or audit checks as passed.

Required checks on the final revision:

1. Fresh install, lint, typecheck, all existing and new targeted tests, production build and `git diff --check`.
2. Public browser checks including real same-origin OCR, plus authenticated disposable-backend checks for purchases, receipts, complaints, exports and two-account access denial.
3. New regressions for ambiguous creation retry with changed facts; identical replay; stale refresh recovery; deletion after reassessment; shared validation/UTF-8 limits; truthful read/write errors; internal leave protection; synchronized evidence lifecycle failures.
4. Development purchase and complaint forms, with isolated Next output directories to avoid dev/build collisions.
5. PDF export samples for Lithuanian glyphs, long text/names, wrapping and page breaks. Visually inspect rendered pages; a `%PDF-` assertion alone does not prove layout or text completeness.
6. Actual-device checks and read-only deployment readiness when available; mark pending otherwise.
7. Full and production-only dependency audit with accurate outcomes; exact final-commit CI if the branch is pushed under the user's repository workflow.

Write `docs/sprint-05-3-project-hardening-report.md` with the final commit/branch, each finding's disposition, concrete behavior changes, test results and limitations. Update setup instructions and generated database types if migrations change. The report must distinguish tests executed now from earlier CI evidence.

**Done means:** save/retry cannot falsely acknowledge different facts; conflicts are recoverable; deletion works independently of assessment; accepted data fits the persistence/export contracts; failures give truthful guidance; edits survive recoverable errors and protected navigation; evidence lifecycle guarantees are tested and documented. Remaining launch-only checks are named explicitly.

## 7. Kickoff prompt

> Read `docs/sprint-05-3-project-hardening.md` completely. Verify repository/branch ancestry and inspect the current code before editing. Implement this focused hardening sprint from the latest Sprint 5.2 source, preserving unrelated work. Prioritize F1–F8, then the specified verification and bounded improvements. Add meaningful regression tests, run the required checks, and write `docs/sprint-05-3-project-hardening-report.md` with exact results and any unavailable checks. Keep all user-facing text Lithuanian. Do not expand into Sprint 6, change production data, merge to main, or deploy. Continue through implementation and verification; do not stop after planning.
