# Pirkėjo Skydas — Sprint 5 inspection

Inspection date: 2026-10-02
Repository: https://github.com/IgnasGaj/pirkejo_skydas
Inspected branch: `feature/sprint-05-complaints`
Inspected commit: `66fa50750bd22f0b629135373dc3717a08968a43`
Main at inspection: `9531c3b88fa3d3e13d8efb9301993489d6f4b567`

## Verdict

**Hold the merge. Fix F1–F4 in a focused Sprint 5 hardening pass before merging or starting dependent case-tracking work.**

The feature is substantially implemented, the ordinary checks are green, and exact-commit CI includes real disposable-backend authorization and overlapping-generation tests. Nevertheless, targeted inspection found two high-priority correctness issues and two medium-priority validation/recovery issues outside that coverage.

No cross-account disclosure or ordinary-user bypass of generated-version insertion was identified in the reviewed implementation. This is not a penetration test or certification of all legal paths.

This inspection changed no application source, tracked repository files, migrations, production data, branches, or remote Git state. It used an isolated detached checkout, disposable diagnostic component tests, and synthetic PDF output. The temporary diagnostic harness was removed; the checkout has no tracked or untracked changes reported by `git status --short`.

## 1. Findings

| ID | Priority | Finding | Evidence level |
| --- | --- | --- | --- |
| F1 | P1 | Edits made during a pending save are marked clean, allowing generation from different saved facts than the visible preview | Executed the actual composer in a controlled jsdom component probe; traced server generation |
| F2 | P1 | A non-minor-defect declaration incorrectly blocks price-reduction requests | Executed actual domain validation; checked official VVTAT guidance and EU legislative text |
| F3 | P2 | An existing draft cannot be rebound/reassessed after its purchase changes | Actual UI/API/SQL control-flow review; not independently reproduced on a live database |
| F4 | P2 | When the assessment's defect date is unknown, the letter accepts an unrelated future or contradictory discovery date | Executed actual domain validation and letter rendering |

Priorities: P1 means resolve before merge because the document workflow can misrepresent the reviewed facts or legal options. P2 means required correctness/recovery behavior also needs fixing for sprint acceptance. None of these findings demonstrates unauthorized access to another account.

### F1 — Pending saves lose the distinction between saved and newly edited facts

Location: [ComplaintComposer.tsx, lines 63–86 and 100–116](https://github.com/IgnasGaj/pirkejo_skydas/blob/66fa50750bd22f0b629135373dc3717a08968a43/src/features/complaints/ComplaintComposer.tsx#L63-L86); [generation API, lines 62–83](https://github.com/IgnasGaj/pirkejo_skydas/blob/66fa50750bd22f0b629135373dc3717a08968a43/src/app/api/purchases/%5Bid%5D/complaints/route.ts#L62-L83).

The buttons become disabled while saving, but the fields remain editable. The save captures one version of `facts`. A subsequent field change sets `dirty=true`, but completion of the earlier save unconditionally calls `setDirty(false)`. `router.refresh()` does not itself reset this component's useState-initialized facts to the saved record.

Executed component sequence:

1. Open an existing valid draft with consumer name `Original Name`.
2. Click save and hold the mocked HTTP response pending.
3. Change the visible name to `New Unsaved Name`.
4. Resolve the successful save for the original payload.
5. The input still shows `New Unsaved Name`, the success message appears, and the generation button is enabled.

The probe asserted the exact payload still contained `Original Name`. The server generation path ignores the newly submitted client facts and loads the saved draft, so it will generate with the old saved name while the current preview shows the new one. The same race can affect a defect description, remedy, reference, or selected attachments. For first-time draft saves, automatic navigation can also discard edits made while the request was pending.

The probe used the actual React component with a deferred HTTP response and a mocked router; it was not a live browser/backend reproduction.

Required fix: disable editing while a save/generation is in flight, or track a submitted revision and mark clean only if no newer edits exist. Preserve newer edits and prevent generation until those exact facts have been saved. Do not rely on router refresh to reconcile local state. Use a consistent canonical saved revision for preview and generation confirmation.

Acceptance: delay a save response, edit facts/remedy/evidence during the delay, and prove that edits are either prevented or remain dirty and preserved. Generation must never become available against an unsaved preview. Cover both first-time and existing-draft saves; compare generated text with the facts the user actually confirmed.

### F2 — Minor-defect restriction is applied to price reduction as well as termination

Location: [domain.ts, lines 76–82](https://github.com/IgnasGaj/pirkejo_skydas/blob/66fa50750bd22f0b629135373dc3717a08968a43/src/features/complaints/domain.ts#L76-L82) and [ComplaintComposer.tsx, line 109](https://github.com/IgnasGaj/pirkejo_skydas/blob/66fa50750bd22f0b629135373dc3717a08968a43/src/features/complaints/ComplaintComposer.tsx#L109).

Both `TERMINATION_REFUND` and `PRICE_REDUCTION` require `confirmedNotMinor=true`. The shared checkbox asks the user to affirm that the defect is not minor.

Executed example:

- Ordinary consumer/professional-seller purchase, within the statutory period.
- Prior repair failed or the defect recurred.
- Actual engine output: `SECONDARY_REMEDIES_MAY_BE_AVAILABLE` with `DEFECT_PERSISTS_AFTER_ATTEMPT`.
- Confirmed EUR product price, a bounded reduction amount, and a sufficient explanation.
- `PRICE_REDUCTION`, `confirmedNotMinor=false`.

Actual result: rejected with `Patvirtinkite, kad trūkumas nėra nedidelis, arba pasirinkite kitą prašymą.`

The official [VVTAT rights-and-guarantees guidance](https://vvtat.lrv.lt/lt/veiklos-sritys-54/ne-maisto-produktai-55/vartotoju-teises-ir-garantijos-714/) lists conditions for the secondary remedies and attaches the minor-defect prohibition specifically to contract termination. [Directive (EU) 2019/771, Article 13(4)–(5)](https://eur-lex.europa.eu/eli/dir/2019/771/oj/eng/pdf) likewise distinguishes conditional price reduction from the minor-defect limit on termination. The application adds a broader restriction and can force an inaccurate declaration to prepare an otherwise supported reduction request.

Required fix: separate the remedy-specific validation and UI. Do not require a non-minor declaration for price reduction where its verified secondary-remedy grounds are met. Retain proportionate amount validation, truthful grounds, and the appropriate termination restriction. Reconcile wording with the current national provision and its burden-of-proof rule; do not imply that checking a box proves legal eligibility.

Acceptance: a minor defect after failed repair can proceed with a supported proportionate price-reduction request without a false declaration; termination remains guarded appropriately. Cases without a secondary-remedy ground remain blocked. Exercise both domain and authenticated UI/API paths.

Legal verification limitation: the repository's exact consolidated e-TAR Civil Code PDF returned HTTP 403 here. Its complete current edition was not independently reverified in this inspection. The specific restriction above is supported by the accessible official VVTAT page and EU legislative source; this does not certify every article/effective date in the repository's legal-source record.

### F3 — Purchase changes permanently strand an existing draft

Location: [ComplaintComposer.tsx, lines 29–45, 88–98 and 116](https://github.com/IgnasGaj/pirkejo_skydas/blob/66fa50750bd22f0b629135373dc3717a08968a43/src/features/complaints/ComplaintComposer.tsx#L29-L45); [save API, lines 43–51](https://github.com/IgnasGaj/pirkejo_skydas/blob/66fa50750bd22f0b629135373dc3717a08968a43/src/app/api/purchases/%5Bid%5D/complaints/route.ts#L43-L51); [generation RPC, lines 39–43](https://github.com/IgnasGaj/pirkejo_skydas/blob/66fa50750bd22f0b629135373dc3717a08968a43/supabase/migrations/20261003010000_signed_complaint_generation.sql#L39-L43).

The UI says to edit the purchase and repeat the legal assessment, but the existing-draft route cannot reopen the assessment: the wizard is only rendered when `!initialDraft && !family`. Existing facts/answers are loaded from the old draft, and the edit link only scrolls to its contact/description form.

Moreover, the save-update query requires the draft's stored `purchase_updated_at` to equal the purchase's current timestamp. Once the purchase changes, this condition is permanently false even if a caller supplies correctly reassessed current facts and the current draft version. Generation separately rejects that old purchase binding, as it should.

Consequences:

- Changing seller/product/date/price leaves old draft facts invalid and provides no recovery assessment.
- Even a notes-only purchase edit changes its version and makes saves/generation return conflicts despite unchanged legal facts.
- Reloading does not rebind the draft. Creating a separate complaint is a workaround, not the specified existing-draft review/regeneration path.

The existing CI test checks that stale generation is rejected after a seller change, then deletes the complaint. It does not test recovering that same complaint.

Required fix: add an explicit reassessment/review action for existing drafts and an atomic rebinding save that validates newly reviewed facts against the current purchase while checking the expected old draft version. Preserve all generated versions unchanged. Do not remove the stale-generation guard or silently refresh legal facts.

Acceptance: create and generate a draft, edit the underlying seller/date/price, reopen it, explicitly reassess/reconfirm, save the same complaint, and generate version 2. Version 1 remains identical. Cover a notes-only edit and concurrent updates during rebinding; stale users must still be rejected.

### F4 — Unknown assessment date can become a future discovery date in the letter

Location: [factsSchema and validateReviewed, domain.ts lines 19–24 and 76–79](https://github.com/IgnasGaj/pirkejo_skydas/blob/66fa50750bd22f0b629135373dc3717a08968a43/src/features/complaints/domain.ts#L76-L79); [composer discovery-date input, line 108](https://github.com/IgnasGaj/pirkejo_skydas/blob/66fa50750bd22f0b629135373dc3717a08968a43/src/features/complaints/ComplaintComposer.tsx#L108).

`facts.defectDiscoveredAt` is checked for ISO calendar-date syntax, but compared with the assessment only if `answers.defectDetectedAt` exists. When the user chose an unknown date in the questionnaire, the review field can introduce a different date without rerunning the engine. The input also lacks minimum/maximum date bounds.

Executed example, using `today=2026-10-02`:

```text
Purchase: 2026-09-20
Received: 2026-09-22
Assessment defectDetectedAt: absent
Actual engine code: CONTACT_SELLER_REPAIR_OR_REPLACE
Reviewed defectDiscoveredAt: 2030-01-01

validateReviewed: accepted
Generated letter: Trūkumą pastebėjau: 2030-01-01
```

Required fix: validate the factual discovery-date sequence on the server even when the assessment previously had no date. An introduced/changed date is a material assessment input and must be incorporated into a fresh engine evaluation and confirmation. Keep unknown as null rather than producing a false precision. Browser bounds help UX but cannot replace server validation.

Acceptance: reject future discovery dates and dates preceding receipt; accept a coherent date only after matching reassessment; preserve the explicit unknown-date route without fabricating a date. Test direct API input as well as the form.

## 2. Verification results

| Check | This inspection, local | Exact-commit CI evidence |
| --- | --- | --- |
| Fresh `npm ci` and OCR asset preparation | Passed | Passed |
| ESLint | Passed | Passed |
| TypeScript | Passed | Passed |
| Unit/component suite | 219 passed in 15 files | 219 passed |
| Production build | Passed | Passed in public and configured-backend modes |
| Dependency audit | Zero reported vulnerabilities | `npm ci` reports zero vulnerabilities |
| Public Playwright/real OCR suite | Could not execute browsers: Chromium download returned truncated/empty ZIPs; command reports five launch failures and ten auth skips | Five passed in public mode |
| Disposable database migrations | Not independently run: Docker/PostgreSQL tooling unavailable | All four migrations applied |
| Authenticated browser suite | Not independently run | Ten passed, including three complaint test groups |
| Authenticated development purchase forms | Not independently run | Passed |
| F1 deferred-save component probe | Passed its defect-reproduction assertions | Not covered by existing CI tests |
| F2/F4 actual domain probes | Reproduced both defects | Not covered by existing CI tests |
| Synthetic PDF inspection | Real one-page and two-page PDFs generated; all three pages rendered and visually inspected; selectable Lithuanian text extracted | Real PDF unit test and authenticated download-signature checks |
| `git diff --check` / final worktree | Passed / clean | — |
| Actual iPhone/Safari and Android | Not performed | No actual-device result established |
| Production migration/signing-key readiness | Not inspected or changed | Disposable setup only |

[CI run 37002460398](https://github.com/IgnasGaj/pirkejo_skydas/actions/runs/37002460398) completed successfully for exactly `66fa50750bd22f0b629135373dc3717a08968a43`. Its decoded job logs were inspected, not only its green badge.

The local browser failures are environment/browser-installation failures, not evidence of an application regression. Conversely, observed CI successes are not a claim that the same live workflows were rerun independently in this environment.

PDF inspection used the repository's real renderer/font and existing synthetic test fixtures. Lithuanian glyphs, A4 dimensions, wrapping, long attachment names, two-page pagination, and footers rendered without clipping in those samples. This is not verification of every possible user character or maximum-length combination.

## 3. Prerequisites and positive findings

- Main contains hardening commit `59c0652caee6d3c01c3f050730e0c869123b5e5c`, and it is an ancestor of the inspected feature commit. The earlier pre-Sprint 5 findings are not simply left unresolved.
- Deadline code now calculates a Lithuania-aware final working day; the prior distance deadline example is covered by new engine tests. The repository records separate national deadline reasoning for physical returns and seller response.
- Currency parsing recognizes standalone nearby foreign codes while retaining ordinary-word controls.
- Receipt save validates UUIDs before constructing its reauthentication destination; CI includes the partial-save/login/retry recovery case.
- Ordinary purchase edits use `updatePurchaseIfCurrent`; CI exercises a real stale two-tab edit.
- Complaint eligibility is explicitly mapped from structured engine codes. The server reruns the engine with a server-selected Vilnius civil date rather than trusting a submitted decision.
- All three document families are present. A supported physical route requests exchange rather than assuming an unconditional refund; seller-consent wording is qualified.
- Drafts and versions have ownership foreign keys and RLS. The server signs validated generation payloads; the private database key is inaccessible to ordinary users, and CI checks unsigned/direct version insertion denial.
- The RPC locks the complaint and purchase before version checks/insertion. The actual CI test launches two generation API requests concurrently with the same request ID and checks one generated version.
- Generated content is immutable; versions are read through parent/owner filters. Export routes use private/no-store headers, a bundled font, and sanitized date/version filenames.
- Evidence is selected explicitly, confined to owned READY documents, checked for Storage availability before generation, and listed separately rather than embedded or duplicated.
- No automatic sending, sent status inferred from export, case tracking, LLM, or VVTAT submission expansion was introduced.
- The PostCSS override and lockfile resolve the formerly reported audit entries in the inspected install. README still contains an earlier contradictory audit section; consolidate it.

## 4. Additional follow-ups and coverage limits

1. **Existing-draft update retry:** the save request ID deduplicates creation, but is unused for existing-draft updates. If an update commits and its response is lost, retrying the same request with the old expected version yields a conflict rather than recovering that successful update. Improve recovery without accepting genuinely different stale payloads; add a dropped-response test. Generation's database replay branch is likewise reached only after the API revalidates current facts/eligibility, so a later purchase change or expiry can block retrieval of a previously successful generation request. Existing downloads still work when the version is known.
2. **Secondary-remedy explanation:** the generated refund/reduction letter does not automatically express the verified prior-repair/refusal facts that opened that remedy. `renderLetter` receives facts but no decision/history, so two different secondary grounds can generate the same demand. Add structured, reviewed grounds/history wording rather than assuming users will independently write the justification in their defect description.
3. **Concurrent evidence removal:** CI covers already-deleted metadata and a missing Storage object before generation. It does not overlap deletion with generation. The RPC checks READY metadata with a count but does not lock those document rows; Storage availability is checked earlier outside the database transaction. Treat stronger evidence-at-generation guarantees as unverified, not as a demonstrated disclosure or confirmed live race. Add a synchronized deletion/generation scenario and define the truthful boundary for historical attachment snapshots.
4. **Source provenance:** `sources.ts` records editions/articles but is not imported into runtime generation; saved rows identify a source-version label and the repository documents its mapping. Maintain that version mapping and verify source/effective-date changes before new releases. The exact national consolidated PDFs were not fully retrievable here; do not call this inspection full legal certification.
5. **Generated attachment availability:** saved versions show historical text but do not annotate which listed evidence is now deleted. The immutable snapshot is correct to remain unchanged; the current UI should distinguish historical listing from currently retrievable evidence.
6. **Setup and error observability:** generation needs both new migrations and a matching server/private-database HMAC key. The README documents this, and disposable CI provisions it. Production readiness remains unknown. A missing database key or SQL failure is generally translated to a change/conflict message, which can obscure setup failures; improve safe diagnostics and user-facing classification without exposing secrets.
7. **Accessibility/mobile acceptance:** the existing viewport test checks overflow, not actual mobile keyboard, error focus, document-viewer behavior, or camera/device acceptance. Error alerts do not establish that focus moves to the error. Use actual iPhone/Safari and Android checklists after hardening.

## 5. Recommended next work package

Create a focused Sprint 5.1 hardening change on top of the inspected feature history:

1. Fix F1–F4 and add the specific regression cases above.
2. Exercise both secondary remedies and the seller-consent document path end to end; current complaint CI mainly covers primary repair, distance withdrawal, and statutory exchange.
3. Verify existing-draft rebinding preserves prior generated versions and still rejects concurrent stale users.
4. Add a delayed-response browser case proving the visible confirmed preview matches the actual generated text.
5. Rerun fresh install, lint, typecheck, all unit tests, build, audit, public/real-OCR browser tests, authenticated disposable-backend tests, and development-form checks.
6. Render representative final PDFs and perform actual-device review/download/copy checks where available.
7. Inspect the final diff and exact-head CI before recommending merge. Keep production database/key changes and deployment as separately authorized work.

**Merge recommendation for this inspected SHA: not yet.** The implementation is a strong base for a focused corrective pass, not a reason to rebuild Sprint 5 from scratch.
