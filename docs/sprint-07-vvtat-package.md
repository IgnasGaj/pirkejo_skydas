# PIRKĖJO SKYDAS — SPRINT 07
## VVTAT evidence package and escalation preparation

Repository: https://github.com/IgnasGaj/pirkejo_skydas.git
Repository specification path: `docs/sprint-07-vvtat-package.md`
Planning date: 2026-10-04 (Europe/Vilnius).
Verified starting dependency: `fix/sprint-06-audit` at `de4a07f061a8948799702b542540eaf1a67a1c52`.
Companion inspection: `sprint-06-post-audit-inspection.md`.

Read this specification completely. Implement it in the existing application, verify it, write the completion report, commit, push the feature branch, and inspect exact-candidate CI. Do not stop after planning. Do not merge or deploy under this specification.

All consumer-facing interface text, accessibility labels, validation and export content must be Lithuanian. Technical documentation and reports must be English. Use existing free tooling; no paid service or external account is required.

## 1. Outcome

A signed-in user can open a tracked defective-product complaint, review the dispute facts, choose relevant original evidence, generate a versioned preparation package, and download a private ZIP for manual submission through official channels.

The slice is:

**Tracked case → preparation checklist → reviewed dispute summary and evidence selection → immutable package version → private downloads → official manual-submission guidance.**

The package organises evidence. It does not itself submit an application or certify jurisdiction, admissibility, receipt, authenticity or entitlement. Make that distinction explicit in the final review and downloaded instructions.

Sprint 8 remains production readiness. Wishlist, price comparison, native applications and merchant integrations remain later work.

## 2. Establish the correct baseline

1. Read AGENTS.md when present, README, Sprint 5/Sprint 6 specifications and reports, the audit and post-audit inspection, migrations, CI, complaint exports, evidence/deletion code and relevant legal-source metadata.
2. Inspect worktree, remotes, ancestry and current main. Preserve unrelated changes.
3. Confirm the repaired Sprint 6 source exists in the chosen base. At planning time main is `735d861cbf2d8b26534abc2cd7c2e4093cabc7b1` and does not contain Sprint 6. Start `feature/sprint-07-vvtat-package` from the verified fix branch unless newer verified main includes it. Record any branch dependency; do not silently merge or start from old main.
4. Run baseline checks and preserve F1–F7. Historical hold verdicts describe older revisions; do not redo completed fixes without a newly reproduced regression.
5. Record starting and delivered SHAs. Use additive migrations after `20261004010000_case_audit_fixes.sql`; never rewrite an already-applied migration.

## 3. Preserve established guarantees

Reuse Next.js, TypeScript, Supabase Auth/Postgres/private Storage, existing validation and deterministic legal engines. Keep public return/defect flows, authentication, purchases, OCR, complaint generation and exports working.

Preserve exact complaint-version pinning, immutable saved text, reviewed price/source distinctions, original evidence bytes, READY-only attachment use, upload hash/claim protection, deletion recovery, owner isolation, database-authoritative revisions, exact request replay, qualified legal dates, and unsaved-navigation behavior.

A package must not dynamically resolve the latest complaint version, overwrite case facts, mark a complaint sent, create a seller response, restart a deadline, close a case, or imply that evidence uploaded by the user proves the event described.

## 4. Legal sources and supported scope

Planning source opened on 2026-10-04:

https://vvtat.lrv.lt/lt/kaip-pateikti-prasyma/

The page describes prior written contact with the seller, escalation after refusal/partial satisfaction/nonresponse, supporting document copies, VTIS and other submission channels. The package design follows that preparation workflow. The page was updated 2026-09-29. It does not alone establish every admission rule or timing calculation.

Before enabling a legal readiness rule, verify the current consolidated Consumer Rights Protection Act and applicable dispute-procedure rules through official e-Seimas/e-TAR and VVTAT sources. Record exact URLs, provisions, edition/effective dates, actual verification date, applicability and the rule/source version in `docs/vvtat-package-legal-sources.md` and structured metadata. Reuse existing sources where appropriate; do not describe metadata read from the repository as independent new verification.

The exact e-TAR PDF used by Sprint 6 returned 403 during planning. If a required source remains unavailable, keep that rule unavailable and continue implementing evidence organisation. Do not invent legal thresholds, filing periods, exception rules, minimum dispute values, signature requirements or portal limits.

This sprint supports existing `DEFECTIVE_PRODUCT` generated complaints concerning the application's existing goods workflow. Other document families show a clear unsupported reason and the official guidance link; they must not inherit the defect response clock. Do not expand into financial/energy/communications services, food complaints, non-delivery, business purchases, private sellers, representation or cross-border jurisdiction.

Include a short routing check for whether the user is preparing their own consumer goods dispute with a professional seller in Lithuania, whether the matter is already before another body/court, and whether special jurisdiction may apply. Treat unknown facts as unknown. An out-of-scope answer provides qualified official routing guidance, not an invented rejection decision.

Do not automatically extend `CASE_VERIFIED_THROUGH` beyond 2026-10-31. Any extension requires source verification and date regressions. Evidence organisation must continue when the deadline rule is unavailable.

## 5. Entry point and preparation checklist

Add **„Parengti dokumentų paketą VVTAT“** to an owned supported case. Use the existing visual language and mobile navigation. Suggested route: `/cases/[caseId]/vvtat`; adapt to repository conventions if needed.

Show a compact checklist covering:

- The exact complaint version and its written demand.
- Recorded submission, known seller receipt or its explicit absence.
- The user's stated escalation reason and existing response record.
- Purchase/transaction proof, submission proof, seller correspondence and relevant service evidence.
- Reviewed applicant/seller details, disputed issue, requested outcome and unresolved facts.
- Verified legal/source availability and any unsupported or uncertain context.

Use factual states such as **„Parengta peržiūrai“**, **„Trūksta duomenų“**, **„Reikia patikrinti“** and **„Šis atvejis nepalaikomas“**. Never display “VVTAT will accept this case”. Selecting a checkbox is a user declaration, not verification.

For a supported case, allow package preparation before every readiness item is satisfied. Clearly label incomplete packages and list missing information; do not turn evidence organisation into a legal admission gate. Missing facts must not be filled with plausible defaults.

Refusal and partial satisfaction must not impose an automatic further waiting period. For a no-response reason, reuse only a verified applicable clock with known receipt. Unknown receipt, unverified/expired source windows and interim answers produce a precise review reason. Never infer no response just because the user has not entered one.

Resolved/closed cases may prepare a historical package after an explicit explanation; preparing it must not reopen tracking or claim the dispute remains unresolved.

## 6. Review facts and requested outcome

Read the pinned generated version's snapshot and canonical text. Show its generation date and provenance. Current purchase/case facts may be displayed separately with differences called out; do not silently rewrite what was sent.

Collect the minimum applicant/contact details needed for a useful preparation summary, seller identity/contact details when available, a bounded factual dispute summary, the user's stated reason for seeking further review, and the requested outcome. Reuse previously supplied details only as reviewable input. Account email is not assumed to be the preferred contact address; unknown seller legal identity is not fabricated.

Keep requested outcome consistent with the sent complaint by default. If the user states a changed outcome, show both with an explicit explanation; do not invent escalation rights or silently alter the old demand. Preserve actual case events and original correspondence.

Avoid collecting personal codes, identity documents, bank details or representative data for the preparation package. Any claim that an official channel requires a field must be verified first. The official portal remains authoritative for its required form fields.

Require explicit final review of the summary, factual declarations, selected files, missing items and source limitations. Protect dirty fields across focus/timer/server refresh and Back/Forward navigation. Use the corrected guard and immutable attempted-request pattern; no second navigation sentinel or sensitive localStorage drafts. Session expiry should explain recovery honestly.

## 7. Evidence selection

Reuse owned READY purchase evidence and the pinned complaint export. Paginate selection beyond the backend's default page and preserve selections across pages. Show filename, category, size and present availability. Let the user assign a package purpose: transaction proof, seller-submission proof, correspondence, service record or other relevant material. These labels must not trigger receipt OCR automatically.

- Select exact owned evidence IDs, never caller-provided storage paths or URLs.
- Validate same owner and same purchase at application and database boundaries.
- Keep uploaded originals byte-for-byte. Do not downsample, recompress, annotate, convert or merge them into a PDF.
- Deduplicate repeated evidence references. Show which events refer to each chosen file.
- Removed/unavailable evidence is visible as unavailable; it cannot be selected as downloadable proof.
- Do not select all purchase files by default. The user chooses what is relevant and sees exactly what will be exported.
- Reuse existing upload/MIME/signature/size validation and recoverable cleanup. No arbitrary remote URLs, mailbox import or new unsupported file types.

Do not make package references permanently prevent legitimate evidence deletion. A saved package records historical identity/metadata; current export access is checked separately. Warn on deletion about affected packages, preserve the existing deletion coordinator, and make subsequent unavailability truthful.

## 8. Immutable package versions and concurrency

Use a minimal server-owned persistent package-version record associated with the exact owned case, purchase and complaint version. Add tables/child selections only where necessary. Define the implementation's data model before migration; avoid a generic workflow framework or duplicating Storage objects.

A saved version records reviewed summary/contact fields, case revision, selected evidence identities and metadata/hash/size/purpose/order, source/rule/template versions, server preparation time, missing/review items and a bounded consistent snapshot of relevant case history. Include all journal events needed for the chronology, not only the currently visible 20-row page. Preserve corrections with original versus corrected facts.

Creation is an explicit mutation with expected case revision, database-backed unique request identity and canonical payload comparison. Validate owned parent chains and assemble the authoritative snapshot transactionally under appropriate locks. Client-provided progress, deadlines, owner IDs, document text and legal decisions are not trusted. Define what is included in request identity and replay checks; exact lost-response retry returns the original saved version, changed-payload reuse fails.

Concurrent case changes during preparation return a conflict with entered values preserved. Explicit review allows a new attempt. Disable controls during pending saves or use tested edit-revision tracking so older success cannot erase newer edits. Reconcile a possibly committed attempt before creating a new logical version.

Later case updates do not rewrite old package versions. Show **„Kreipimosi eiga pasikeitė nuo paketo parengimo“** and offer an explicit new version. Older versions remain labelled historical; present legal guidance must not silently present an old source as newly verified.

Authenticate and scope every read/export/delete. Enable RLS, composite owner/parent constraints, restrictive grants, hardened RPC search_path and direct boundary validation including NULL/malformed inputs. Use ordinary accounts for verification; no application service-role key.

Define lifecycle rules: package deletion removes only its own records; whole-case/purchase deletion includes package records explicitly; complaint deletion remains blocked while tracking depends on its version. Preserve recoverable purchase/evidence cleanup. Regenerate typed schema through the established workflow.

## 9. Downloads and contents

Provide **„Atsisiųsti santrauką PDF“** and **„Atsisiųsti dokumentų paketą ZIP“** with private authenticated server routes. A supported ZIP contains:

1. `01-ginco-santrauka.pdf` — reviewed preparation summary and bounded complete chronology, identifying user-reported facts, recorded versus occurrence dates, corrections, missing items and package preparation/source versions.
2. `02-kreipimasis-pardavejui.pdf` and `.txt` — the pinned complaint's existing canonical content rendered through established export functions.
3. `irodymai/` — the explicitly selected original evidence bytes under safe numbered names.
4. `priedu-sarasas.txt` — attachment index with original names, package names, purpose, byte size and SHA-256 of files actually included, plus selected evidence identity.
5. `pateikimo-instrukcija.txt` — Lithuanian instructions directing the user to current official channels and explaining missing/review items and that this archive has not been submitted.

The summary is preparation material, not an automatically completed official VVTAT application. Do not impersonate official forms or insert a signature. If formal application generation is later proposed, it requires separately verified form requirements and scope.

Use an appropriately bounded PDF renderer. The existing complaint renderer accepts at most 24 sections/24000 characters; do not feed a 500-event journal into it or silently cut off history. Define explicit version/history/text/page budgets, enforce them before save/export, and give an actionable error if exceeded. Render Lithuanian characters, long unbroken text and supported Unicode cleanly, with truthful fallback for unsupported glyphs. Verify representative multi-page PDFs visually.

Use a vetted maintained free ZIP library if one is necessary; check official documentation and its current dependency audit. Choose explicit app limits before implementation: maximum 20 selected files and 50 MiB combined original bytes, plus bounded generated documents and a maximum 60 MiB final archive. These are application resource limits, **not claims about VTIS or email attachment limits**. Check metadata then actual received bytes, enforce per-request/time/concurrency limits and document expected server memory/streaming behavior. Do not buffer arbitrary unbounded files.

Generate exports on demand without persistent duplicate ZIP/PDF Storage objects. Repeated downloads must use the saved package content and actual evidence hashes; byte-identical container timestamps are not required, immutable semantic content is. Safe archive paths must reject traversal, separators, control characters and collisions. Headers and download names cannot contain injected content. No executable HTML evidence viewer or external resources in the archive.

Verify owner, purchase deletion state, package/version identity and each file's current READY/hash/size state on every export. Download through the authenticated storage client, never arbitrary fetch URLs. Fail clearly when selected evidence is deleted, missing, changed, temporarily unavailable or fails hash/size checks. Do not silently omit selected proof or label a partial ZIP complete. Do not emit final download headers/body until the export can succeed; any streaming design must prevent a truncated archive masquerading as success.

A saved metadata version may remain after a failed export; explain **„Paketas parengtas, atsisiuntimas nepavyko“** and allow retry without a duplicate version. Export rollback/cleanup must leave no persistent private artifacts. Set `Cache-Control: private, no-store`, safe content disposition and appropriate content type/nosniff. Do not store signed URLs, expose sensitive file contents in logs, or place contact details in query parameters.

## 10. Manual submission guidance

Link to the official VVTAT request page and its current VTIS destination. Explain that the user must complete the official application's current required fields, select/upload relevant documents, follow the channel's signing/identity instructions, and submit personally. Do not claim a ZIP can be uploaded directly unless current official guidance confirms that; provide individual existing downloads as needed.

When a user wants to note actual submission to an institution, do not reuse the seller `SUBMITTED` event or reset the seller clock. Institution submission tracking is outside this sprint unless a strictly separate informational record is essential and explicitly documented; downloading is never proof of submission.

No portal automation, email sending, electronic-signature provider, identity login, third-party message or background reminder is added. Existing document integrity behavior must not be marketed as a qualified signature.

## 11. Required verification

Keep purchase/OCR/legal/complaint/export/auth/navigation/deletion and Sprint 6 regressions passing. Add focused tests for new behavior rather than rewriting tests to match implementation.

### Domain and validation

- Unknown receipt, unsubmitted cases, interim answers, refusal/partial satisfaction, expired source windows, unsupported families and resolved cases produce truthful checklist states.
- No source-unavailable rule becomes a positive legal-admission decision.
- Pinned versus current facts and changed outcomes remain distinct.
- Text, Unicode/JSON byte limits, selected-file/count/total budgets and safe names are enforced consistently.
- Complete multi-page history, original/corrected dates and attachment deduplication are correct.
- Missing facts remain missing; all consumer export labels are Lithuanian.

### Ordinary-account disposable backend

- Owner/cross-account/anonymous tests cover records, selections, exports, mutations and deletion.
- Forged parent combinations and foreign/non-READY evidence fail through both API and direct RPC.
- NULL/stale revisions, malformed arguments, changed replay, exact replay and genuinely overlapping saves are checked. Failure rolls back authoritative records together.
- Snapshot case revision/history and pinned version are consistent during concurrent events.
- Evidence deletion/replacement/upload overlap with preparation and export fails safely or produces the verified selected bytes; deleted files never reappear from stored links.
- Whole-case and purchase deletion clean package records while retaining established Storage recovery behavior.
- Collections beyond one backend page remain navigable with stable selection/counts.

### Authenticated browser and export tests

- Existing purchase → generated complaint → tracked case → checklist → reviewed summary → selected evidence → saved package → PDF/ZIP download.
- Inspect ZIP entries, extracted original hashes, canonical complaint text and manifest correspondence; do not test only HTTP 200 or file extension.
- Lost-save response followed by focus/case refresh and exact replay creates one version. Changed later edits survive; stale review and cancelled navigation/action changes preserve values.
- Session expiry, failed file fetch, missing selected file, size overflow and retry give truthful errors with no duplicate version or incomplete success download.
- Old package after case update is labelled stale/historical and a new version is explicit.
- Desktop, keyboard/focus and mobile overflow are checked. Render multi-page PDF fixtures to images and inspect accents, wrapping, page breaks and completeness.
- Public/regression suites, authenticated integration/browser suites and development-form checks pass on disposable Supabase.

Run `npm ci`, lint, typecheck, full tests, production build, public browser tests, integration tests, authenticated browser tests, development forms, `git diff --check`, full and production dependency audits. Isolate build/dev directories, use synthetic records and clean test-owned data. Inspect CI for the final pushed SHA. An opt-in skip is not a passed backend test.

Physical iPhone/Safari, Android and LAN HTTP checks remain pending unless actual devices are available; give the precise manual checklist and report what was actually done. Sprint 6 carried five developer-tooling audit entries and a clean production audit; rerun rather than copying old counts. No forced unrelated dependency changes.

## 12. Delivery sequence and definition of done

1. Establish verified repaired baseline; verify legal-source availability and define checklist semantics.
2. Define immutable version and bounded snapshot/export contracts, lifecycle and resource limits.
3. Add minimal additive persistence/RLS/RPC/type changes and ordinary-account tests.
4. Build reviewed preparation, evidence selection and explicit version generation with correct draft/retry behavior.
5. Implement safe private PDF/ZIP generation, actual-byte manifest verification and failure handling.
6. Add manual official-submission guidance and old-version/update/deletion UI.
7. Complete regression/backend/browser/export/visual checks and dependency audits.
8. Update README, migration rollout, source metadata and `docs/sprint-07-vvtat-package-report.md`.
9. Commit and push `feature/sprint-07-vvtat-package` normally and inspect exact-candidate CI.

Done means the complete reviewed preparation/download path works privately from the corrected Sprint 6 baseline; immutable versions and exact retries are consistent; selected originals and pinned complaint content survive unchanged; export failures are honest and bounded; legal limitations are visible; required checks pass with unavailable checks explicitly labelled; and the feature branch/report are pushed with inspected CI.

Use neutral project commit messages, for example `feat: add VVTAT evidence preparation packages`. Add no generated-by banners, assistant attribution, automated co-author trailers or agent scratch artifacts. Preserve history; no force push. Main, production settings and shared Supabase migrations remain unchanged under this handoff.

The report must include starting/final SHAs, branch dependency, delivered/unsupported behavior, source verification and unavailable rules, exact migrations/order, schema/type provenance, ownership/replay/snapshot guarantees, PDF/ZIP limits, deletion behavior, actual local/CI/device results, dependency audits and remaining launch work.

## Kickoff prompt

> Read `docs/sprint-07-vvtat-package.md` and `sprint-06-post-audit-inspection.md` completely. Inspect current remotes/worktree and start from the repaired Sprint 6 source: `fix/sprint-06-audit` at `de4a07f061a8948799702b542540eaf1a67a1c52`, or verified newer main that contains it. Create `feature/sprint-07-vvtat-package`. Implement the reviewed VVTAT preparation checklist, immutable package versions, owned evidence selection, private summary PDF and ZIP with original evidence bytes, and official manual-submission guidance. Keep user-facing content Lithuanian and preserve Sprint 6 F1–F7, pinned complaint content, exact replay, dirty-draft protection, RLS and recoverable deletion. Verify official rules before enabling legal readiness guidance; unavailable sources must remain explicit. Complete bounded export, database/browser/regression and visual PDF checks, write `docs/sprint-07-vvtat-package-report.md`, commit and push normally, and inspect exact-candidate CI. Do not merge, deploy, change shared/production settings, automate official submission or expand into Sprint 8. Continue through implementation and verification.
