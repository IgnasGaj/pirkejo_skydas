# PIRKĖJO SKYDAS — SPRINT 06
## Case tracking, seller responses, and procedural timelines

Repository: https://github.com/IgnasGaj/pirkejo_skydas.git
Repository specification path: `docs/sprint-6.md`
Planning date: 2026-10-04 (Europe/Vilnius)

Read this entire specification before editing. Implement the sprint in the existing project, verify the result, commit it, and push a feature branch. Continue through implementation and verification; a plan alone is not the deliverable. Do not merge into main or deploy under this specification.

All interface text, accessibility labels, validation errors, and consumer-facing guidance must be Lithuanian. Code, technical documentation, and implementation reports must be English. Use the existing stack and free tooling; no paid service or new external account is required.

## 1. Outcome

A signed-in user can turn an existing generated complaint into a tracked case, record actual submission and seller receipt, see an applicable response deadline, record responses and service progress, and close or reopen the case without losing its history.

The complete slice is:

**Owned purchase → generated complaint version → recorded submission → response tracking → service/outcome history → next-step guidance.**

Document preparation is already delivered in Sprint 5. This sprint starts where that work ends: the user has a document and needs to know what happened after presenting it to the seller.

The roadmap remains:

- Sprint 6: case tracking and in-app reminders.
- Sprint 7: VVTAT evidence package and escalation preparation.
- Sprint 8: production readiness and launch hardening.

## 2. Baseline and continuity

The user confirms that the earlier defects and follow-up rounds are fixed. Treat that as the planning baseline. Historical hold verdicts describe older revisions; they are not instructions to redo those rounds.

This specification builds on:

- Sprint 1 / 1.1: deterministic return rules and conservative product classification.
- Sprint 2: defective-product remedies and warranty distinctions.
- Sprint 3 / 3.1: authentication, owned purchase vault, private evidence, and runtime hardening.
- Sprint 4 / 4.1 / 4.2 and pre-Sprint 5 corrections: same-origin OCR, reviewed facts, EUR safeguards, original evidence bytes, claim tokens, retry identity, and guarded purchase edits.
- Sprint 5 / 5.1 / 5.2 / 5.3 and subsequent audit fixes: reviewed complaints, immutable generated versions, private exports, reassessment, revision-based dirty state, browser compatibility, navigation protection, bounded lists, and recoverable evidence deletion.

Before editing:

1. Read `AGENTS.md`, README, existing sprint documents/reports, migrations, current CI, and relevant domain/API code.
2. Inspect worktree, remotes, branch ancestry, and current main. Preserve unrelated changes.
3. Confirm where the completed Sprint 5 fixes actually live. Base `feature/sprint-06-case-tracking` on their current verified source. If they are only on an unmerged branch, retain that dependency and report it; do not silently merge or return to an older SHA.
4. Run the existing baseline checks. Fix regressions introduced by this sprint. If a genuine existing blocker is reproduced, report the exact behavior and handle the smallest necessary correction; do not initiate another broad audit.
5. Record starting branch/SHA and the delivered candidate SHA.

This planning document is based on supplied sprint files and project history, including the Sprint 5 complaint specification and later hardening/inspection documents. It is not a fresh inspection of the remote repository or proof of production readiness.

## 3. Preserve existing guarantees

Reuse Next.js, TypeScript, Supabase Auth/Postgres/private Storage, existing validation patterns, and the deterministic legal engines. Inspect current versions rather than pinning old versions from historical reports.

Preserve:

- Public return/defect flows for signed-out users.
- Conservative unknown-category and special-review results.
- Separate distance withdrawal, physical returns, defect remedies, and commercial warranties.
- Reviewed product price versus receipt total and explicit missing facts.
- Original evidence bytes, READY-only usable attachments, hash/claim protections, and cleanup tombstones.
- Server-authoritative validation and legal assessment.
- Immutable complaint versions, canonical saved text, PDF/text export, and current document integrity/signing behavior.
- Stable request identity, exact-payload replay checks, optimistic concurrency, truthful errors, and unsaved-edit protection.
- Secure UUID fallback on LAN HTTP; do not introduce unconditional `crypto.randomUUID()` usage in browser code.

A case state is an administrative record of user-reported progress, not a new legal entitlement. Recording a seller response must not automatically change a selected remedy or rewrite an old complaint.

## 4. Entry points and private screens

Reuse the existing visual language and private navigation.

Suggested routes:

- `/cases`: **„Mano kreipimaisi“**, a paginated owned case list.
- `/cases/[caseId]`: case overview, timeline, evidence links, and actions.
- Entry from an owned purchase and its generated complaint version: **„Sekti kreipimąsi“**.

Route names may follow established repository conventions. Do not duplicate the complaint composer or create a second questionnaire.

The case list shows product/seller, submission status, latest meaningful update, and an applicable deadline or missing-date explanation. Provide filters for active and closed cases, with stable bounded pagination and accurate counts. A backend error is not an empty list.

Case detail includes:

1. Purchase and seller context.
2. The exact generated document version being tracked, with existing private download controls.
3. Current user-reported progress and applicable deadline information.
4. Explicit next action.
5. Chronological history and currently available evidence.

A draft with no generated version leads to **„Pirmiausia parenkite dokumentą“**. Never create a legal complaint from free-form case notes.

## 5. Create and bind a case

Create a case from one owned generated complaint version belonging to the same owned purchase.

- Pin the exact version ID, document family, generation time, and existing provenance. Do not resolve “latest version” dynamically after creation.
- Reuse its canonical content; do not copy sensitive letter text into another editable field.
- Default to prepared/unsubmitted. Saving, copying, downloading, or opening a mail application is not submission.
- Enforce one case per generated version with database uniqueness. Retrying or double-clicking creation opens the existing case.
- Different generated versions may have separate cases. Warn when a purchase already has an active case so the user can open it instead. Do not prevent genuinely different matters.
- Purchase edits and later complaint generation do not rebind an existing case or reset its dates.

For this sprint, cases originate from existing generated documents. Tracking manually written external complaints can be a later feature.

## 6. Submission and receipt capture

Use an explicit **„Pažymėti, kad pateikiau pardavėjui“** action.

Collect:

- Actual submission civil date.
- Method: email, registered post, in person, VTIS, or other.
- Optional short reference/note.
- Optional selected proof from owned READY purchase evidence.
- Seller receipt date when known, with an explicit indication that the user knows it; otherwise leave it unknown.

Explain: **„Ši programa dokumento neišsiunčia. Įrašykite, kada jį pateikėte pardavėjui.“**

Known seller receipt must not precede submission. Reject impossible/future dates and invalid civil dates at both client and server boundaries. Do not infer receipt from sending, attachment upload, document date, generation date, or purchase date. Same-day receipt is allowed when explicitly confirmed by the user.

If receipt is unknown, show **„Pardavėjo gavimo data nežinoma“** and allow recording it later. Never show a definitive overdue badge based only on submission. This sprint does not need an estimated legal countdown.

Correcting a date preserves the prior entry as a visible correction and recalculates the operational deadline. It must not alter the sent document or silently create another submission. A follow-up message does not automatically restart a statutory response period.

## 7. Deadline policy and legal provenance

Implement deadline calculation in a pure, independently tested domain module, separate from React and persistence. Use server-controlled Europe/Vilnius civil dates; timestamps are UTC, user-entered dates are validated date-only values.

Official guidance checked during planning:

https://vvtat.lrv.lt/lt/kaip-pateikti-prasyma/

On 2026-10-04 this page states that the seller's written response period runs from receipt of the consumer's request, and describes escalation after refusal, partial satisfaction, or no response within the period. This confirms the need to distinguish submission from receipt. It does not establish every deadline arithmetic rule or applicability to every document family.

Before enabling the calculator, verify current consolidated Vartotojų teisių apsaugos įstatymas, relevant Civil Code term-calculation provisions, and applicable official VVTAT guidance. Resolve current editions through official e-Seimas/e-TAR sources. Record exact sections, effective dates, real verification date, and applicability in `docs/case-tracking-legal-sources.md` and existing structured legal-source metadata.

The implementation must explicitly determine:

- Which existing document families and request types use the seller-response rule.
- The triggering event, exclusion/inclusion of days, and final-day treatment.
- Whether relevant weekends/public holidays extend that particular period.
- Which source version and calculation version support the result.

Do not copy the distance-withdrawal helper indiscriminately. Do not convert calendar periods to working-day counts. Do not assume that a withdrawal notice or voluntary return request has the same procedural timetable as a defect complaint.

For a verified applicable case with known receipt, show the final response date and civil days remaining. On the final day show **„Atsakymo terminas baigiasi šiandien“**; overdue begins only after the verified final day. Show the source and **„Pagal jūsų nurodytą gavimo datą“**.

Unknown receipt or unavailable legal verification returns a structured unavailable state with a reason, not a guessed date. Complete submission/history features independently if a specific deadline policy cannot be verified.

Persist the deadline basis and rule/source version used. Any later rule-driven recalculation is explicit and recorded; do not silently rewrite history. Refresh date-dependent display after Vilnius midnight, tab focus, and server mutations. A device clock cannot establish server-side eligibility.

## 8. Progress states and seller responses

Keep progress and deadline state separate. Suggested progress states:

| State | Lithuanian label | Meaning |
| --- | --- | --- |
| `PREPARED` | Dokumentas parengtas | No confirmed submission. |
| `AWAITING_RESPONSE` | Laukiama pardavėjo atsakymo | Submission recorded; receipt may still be unknown. |
| `RESPONSE_RECORDED` | Gautas pardavėjo atsakymas | User recorded correspondence; resolution is not assumed. |
| `IN_SERVICE` | Prekė taisoma / tikrinama | User recorded a service handover. |
| `RESOLVED` | Išspręsta | User explicitly confirmed the outcome. |
| `CLOSED` | Uždaryta | User stopped tracking without asserting resolution. |

Deadline state is derived separately, such as unavailable, pending, due today, expired, or response recorded. Do not persist an “overdue” flag that becomes stale.

**„Įrašyti pardavėjo atsakymą“** collects response date, bounded summary, optional evidence, and a user-selected outcome: accepted, partly accepted, refused, requested more information, or other. Label this as the user's description; do not classify email text with AI.

A request for more information or an acknowledgement is not automatically a complete motivated answer. Preserve the original deadline basis and show qualified guidance when the user reports only an interim response. An accepted request does not mean the repair or refund has already happened.

Support multiple responses. Validate their chronology against submission, while allowing a response to establish previously unknown receipt only through explicit confirmation. An overdue notice says **„Atsakymo neužregistravote“**, not “the seller definitely ignored you”. Late responses remain recordable; history retains what happened.

Explicit resolve/close actions collect date and optional outcome/note. Resolution choices include repaired, replaced, refund received, price reduction agreed, or other, without promising their legality. Allow reopen with confirmation and retain all previous events. Reopening does not reset the original response clock.

## 9. Service tracking

Provide **„Pažymėti, kad perdaviau prekę taisyti / tikrinti“** within a submitted case.

Record handover date, optional seller/service reference, optional evidence, and an optional date the seller actually promised. Label it **„Pardavėjo nurodyta data“**, separate from statutory deadlines.

Show elapsed civil days and recorded updates. Support **„Prekę atgavau“**, return date, and a short result. Permit further service episodes after return without losing earlier episodes.

Do not invent a universal 14-, 30-, or 45-day repair limit. A missed promised date may produce a factual reminder, not an automatic refund right. Ending service does not close the case unless the user confirms resolution.

## 10. In-app reminders and next steps

Deliver reminders inside authenticated screens, calculated from current case facts. No email, push provider, cron, or background queue is required.

Examples:

- Missing seller receipt date: prompt to record it.
- Verified response deadline approaching: show days remaining.
- Verified deadline passed with no substantive response recorded: suggest checking correspondence and retaining submission proof.
- Refused/partly accepted response: explain that the user may consult the official dispute procedure; do not force a further waiting period where it is not required.
- Service ongoing: show elapsed time and any user-entered promised date.

Use current official VVTAT/VTIS links and qualified wording. Deadline expiry alone does not prove jurisdiction, admissibility, or entitlement. Do not display “VVTAT will accept your case”, create an application, or add a disabled evidence-package button. Evidence bundling and the complete eligibility checklist remain Sprint 7.

Never show a response countdown as a guarantee deadline, withdrawal deadline, reimbursement deadline, or repair limit. Closed/resolved cases do not show active action reminders. No misleading claim that reminders arrive when the app is closed.

## 11. Evidence reuse and document lifecycle

Reuse the existing purchase evidence infrastructure for submission proof, correspondence, and service records. Add narrowly named evidence categories only if needed; retain current MIME/size/signature validation, private access, and original bytes. OCR remains explicitly user-triggered on supported receipts; correspondence must not become an OCR receipt by default.

Case-event evidence links validate same owner and same purchase. Only READY evidence is selectable. Preserve metadata snapshots for historical descriptions and show current availability separately: available, removed, or temporarily unavailable. A snapshot filename is not authorization to retrieve a deleted file.

Do not duplicate evidence objects, store signed download URLs, or embed evidence pixels in complaint exports. Reuse guarded upload/cleanup paths. Validate deletion/upload overlap against a disposable backend.

A tracked complaint version cannot be deleted while a case references it. Explain the dependency and offer an explicit case-deletion path; do not silently cascade away active tracking from an ordinary complaint deletion. Purchase deletion must clearly include cases/history, complaints, and evidence in its confirmation, and reuse the recoverable deletion coordinator.

Whole-case deletion requires confirmation, removes case-owned rows/links, and leaves shared purchase evidence and complaint versions intact. Recording a correction is not a way to edit immutable generated content. No unreferenced private Storage objects may be created by failed case mutations.

## 12. Persistence, authorization, and concurrency

Use additive migrations and regenerate typed schema through the established workflow. Suggested minimum tables:

- `cases`: owner, purchase, pinned complaint version, progress, revision, timestamps, and relevant current facts/deadline provenance.
- `case_events`: bounded typed events, actual occurrence date, server recording timestamp, validated payload, request identity, and optional correction reference.
- Evidence links if needed, constrained to the same ownership/purchase chain.

This is a small case journal, not a generic event-sourcing framework. Define an explicit server/domain transition matrix. Keep any summary rows consistent with the event inserted in the same database transaction. Sort by occurrence date with server timestamp/ID tie-breakers; identify backdated entries and corrections clearly. Paginate event history without calculating status from only the visible page.

All mutations authenticate, validate, load owned parents, check expected revision, and commit atomically. Mutation request IDs have database-backed uniqueness and canonical payload equality: identical replay returns its result, changed-payload replay is a recoverable conflict. A stale-tab change cannot overwrite newer receipt dates, responses, service state, or closure. Preserve entered values on conflict and offer reload/review.

Corrections append a typed correction targeting an event in the same case and update current derived facts atomically. Reject cross-case targets, correction cycles, invalid resulting chronology, and unsupported state transitions. Keep the original entry visible as superseded. Bound event counts/payloads and use existing UTF-8/database size limits consistently.

Enable RLS on every new table, enforce owner/parent combinations in database constraints, and restrict direct writes so they cannot bypass transition, revision, or replay guarantees. Harden any RPC grants, search_path, and authentication checks. No service-role key in application code.

Account B and anonymous users cannot read or modify account A's cases, events, evidence links, or document exports through either application routes or direct ordinary-client database calls. Do not accept caller-provided owner IDs, storage paths, legal decisions, or derived deadlines as authoritative.

## 13. Mobile, accessibility, and recovery

Keep the existing mobile layout, visible focus, associated labels, accessible feedback, touch target sizes, and escaped text rendering. Long seller names, notes, and many events must wrap without horizontal overflow. Do not rely on colour alone.

Actions are explicit saves. Protect unsaved response/service/date corrections using the fixed navigation conventions; preserve Back/Forward/hash navigation, StrictMode lifecycle, and modifier/new-tab behavior. Do not add a new history sentinel implementation.

Handle session expiry with narrow validated return paths and stable saved identities. Never put contact data, response summaries, or complaint text in URLs or localStorage. Explain when unsaved data must be reentered. A database failure must not masquerade as missing records or successful tracking.

Verify core interaction on desktop and mobile viewports. Actual iPhone/Safari and Android checks are performed only when devices are available; otherwise provide a short manual checklist and label them pending. Verify the current LAN HTTP compatibility as well as supported HTTPS behavior.

## 14. Required verification

Keep the existing legal, purchase, OCR, complaint, export, auth, navigation, and deletion regressions passing. Add meaningful coverage for these behaviors:

### Domain and date tests

- Prepared document has no submission/response countdown.
- Submission alone does not infer receipt; explicit receipt enables only an applicable verified policy.
- Invalid/future dates and receipt-before-submission are rejected.
- Verified period boundary, last-day inclusion, month/year change, leap day, relevant holidays/weekends, and Vilnius DST/midnight are tested with a controlled clock.
- Unknown dates and non-applicable document families produce truthful unavailable states.
- Interim response, substantive response, late response, service, closure, resolution, and reopening produce correct independent progress/deadline state.
- Date correction recalculates current guidance and preserves history/provenance.
- A follow-up or reopen does not silently restart the response period.
- User-entered promised service date is distinct from statutory response deadline.

### Disposable-backend checks

- Create/reopen/list/filter/paginate a case and bind the correct immutable version.
- Two genuinely overlapping creations produce one case for the same version.
- Identical mutation replay succeeds once; changed-payload replay is rejected.
- Two-tab concurrent mutations detect stale revisions without lost facts/events.
- Atomic event/summary failure rolls back both; response-loss retry preserves one event.
- Owner/cross-account/anonymous access, forged parent combinations, foreign evidence, and direct transition-bypass attempts are checked with ordinary accounts.
- Correction ownership/chronology, generated-version immutability, pinned-version deletion protection, and coordinated purchase deletion are verified.
- Evidence upload/deletion failures retain existing cleanup/retry guarantees.
- Synthetic collections beyond a single backend page remain navigable with accurate current statuses.

### Browser journey

- Existing purchase → questionnaire → generated document → case → submission with unknown receipt → add receipt → response → service episode → explicit resolution → reopen.
- Refresh and logout/login preserve saved progress and pinned document identity.
- Download alone never starts tracking; newer complaint versions do not replace a pinned version.
- Error/retry/stale-tab paths retain form values; unsaved navigation protections remain correct.
- Long text, keyboard/focus, mobile overflow, pagination, and evidence availability labels are inspected.
- Open-tab/focus refresh after a controlled Vilnius date change updates the deadline display.

Use synthetic data, isolate destructive tests, and clean test-owned records. Mock adapters do not prove database atomicity/RLS. Mobile emulation does not prove physical-device behavior.

Run the actual repository commands, typically:

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
git diff --check
```

Also run current authenticated disposable-Supabase integration/browser tests and development-form checks. Keep development/build output directories isolated. Run and report current full and production-only dependency audits; do not describe old findings as current or force unrelated upgrades.

After pushing, inspect exact-candidate CI and distinguish passed, failed, pending, and skipped checks. A skipped authenticated suite is not verification. Document unavailable legal-source, device, or backend checks explicitly.

## 15. Scope boundaries

Do not add:

- Automatic seller email sending, delivery detection, mailbox import, or messages to third parties.
- Push/email notifications, paid scheduling, external background jobs, or reminders outside the app.
- VVTAT evidence ZIP/PDF packages, official application generation, VTIS automation, or automatic escalation.
- New legal workflows for services, non-delivery, private sellers, business buyers, or cross-border jurisdiction.
- Qualified electronic signatures or identity providers; preserve existing document integrity behavior.
- LLM legal decisions, AI response classification, payments, family accounts, merchant integrations, warranty-expiry calendars, native apps, or a broad redesign.

## 16. Implementation sequence and delivery

1. Establish the current completed Sprint 5 baseline and preserve existing fixes.
2. Verify applicable deadline sources; define pure date policy, typed states, and transitions.
3. Add minimal additive schema, constraints, RLS, guarded mutation/replay handling, and backend tests.
4. Implement pinned-version case creation, submission/receipt recording, and list/detail pages.
5. Add response history, evidence references, service episodes, corrections, resolution/closure/reopen.
6. Add derived in-app reminders, date refresh, and official next-step links.
7. Complete browser/backend/regression verification and mobile visual inspection.
8. Update README, setup/migration/type provenance, source documentation, and completion report.
9. Review the diff for secrets and unrelated changes, commit, push the feature branch normally, and inspect its CI.

Use neutral project branch/commit names, for example `feature/sprint-06-case-tracking` and `feat: add consumer case tracking`. Add no generated-by banners, assistant attribution, automated co-author trailers, or agent scratch artifacts. Preserve existing history; do not force-push.

Do not modify production database/auth/signing settings or deploy. Provide exact new migration names and rollout order. Historical migration/device gaps must not be presented as fresh failures or freshly passed checks.

Write `docs/sprint-06-case-tracking-report.md` with starting/final SHAs, implemented behavior, deadline policy/applicability/source dates, schema/RLS changes, retry/concurrency/deletion guarantees, actual local and CI results, device results or manual checklist, current audit findings, and limitations. State whether the branch push succeeded and that main/production were not changed.

## 17. Definition of done

Sprint 6 is complete when:

- An owned generated complaint version can be tracked privately and remains pinned.
- Actual submission and known seller receipt are recorded separately; no export is mistaken for delivery.
- An applicable verified deadline is correct and current, or its precise unavailability is explained.
- Responses, service progress, corrections, and outcomes persist with truthful history.
- Closure/reopen and retry/concurrent edits cannot lose facts or restart deadlines silently.
- Evidence remains private, original-byte protections remain intact, and deletion behavior is explicit and recoverable.
- Lists/history are bounded and fully navigable; Lithuanian mobile UI and existing workflows remain usable.
- Required checks pass for the delivered candidate, with unavailable checks stated rather than claimed passed.
- Code, migrations, documentation, and report are committed and pushed to the feature branch with exact-candidate CI inspected.

## 18. Kickoff prompt

> Read `docs/sprint-6.md` completely and implement Sprint 6 in the existing Pirkėjo Skydas repository. Start from the latest completed Sprint 5 source, preserve its fixes and unrelated changes, and treat historical audit hold verdicts as historical. Build case tracking linked to an exact generated complaint version, explicit submission/receipt recording, verified applicable response deadlines, response/service history, corrections, outcomes, and in-app reminders. Keep all user-facing text Lithuanian. Preserve immutable documents, original private evidence, ownership, retry identity, guarded writes, and fixed navigation behavior. Complete the required tests and exact-candidate CI, write `docs/sprint-06-case-tracking-report.md`, then commit and push `feature/sprint-06-case-tracking` normally. Do not merge, deploy, modify production settings, or expand into Sprint 7. Continue through implementation and verification rather than stopping after planning.
