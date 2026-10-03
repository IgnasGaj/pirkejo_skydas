# Sprint 5.1 hardening

Starting point: `feature/sprint-05-complaints` at `66fa50750bd22f0b629135373dc3717a08968a43`. The unrelated untracked Sprint 3.1 document in the checkout was preserved. The full inspection is stored at [sprint-05-inspection.md](sprint-05-inspection.md).

## Corrections

- F1: The reviewed form freezes all editable controls during save and generation. The same submitted facts remain in the preview after the save response; generation is available only for that saved revision. A delayed-response component test covers new and existing drafts, and a delayed authenticated browser save checks the generated text against the confirmed preview.
- F2: Price reduction and termination now have separate significance validation. Supported reduction still needs an engine-confirmed secondary ground, a confirmed product price, a bounded reduction amount, and an explanation. Termination retains a significance confirmation; the interface explains that a seller bears the burden of proving a minor defect. Older reduction drafts carrying the former declaration must be reviewed and saved once before generation; the obsolete value is cleared without changing historical versions. Secondary letters now state the structured ground reviewed by the engine.
- F3: Existing drafts explicitly reopen the legal questionnaire after a purchase change, including notes-only changes. The new additive `20261003020000_complaint_reassessment.sql` migration adds an atomic ordinary-user save function. It checks the draft version and purchase timestamp under row locks, requires explicit rebinding if the purchase version changed, and records the latest update request identity and hash for safe lost-response retry. Generated versions remain immutable. The generation replay path can return an already committed version by request ID after a later purchase change.
- F4: The server rejects future discovery dates and dates before receipt, and requires the reviewed date to match the assessment exactly, including null. A changed date requires the questionnaire again; unknown stays null. The date input has matching browser bounds.

## Setup

Apply `20261003020000_complaint_reassessment.sql` after the two Sprint 5 migrations and before running this app build. Existing Sprint 5 signing-key provisioning remains required for generation; this migration adds no new secret. `src/lib/supabase/database.types.ts` was updated from the additive schema and must be compared against generated types on a disposable migrated stack. No shared or production database was modified here.

## Separate follow-ups

Update retry recovery and structured secondary-remedy wording are addressed. A previously successful generation request can be retrieved by its request ID even when its purchase later changes. Concurrent evidence deletion/generation, historical attachment availability labeling, setup-error classification, source effective-date monitoring, and actual iPhone/Safari or Android acceptance remain separate work. Historical attachment names remain immutable snapshots; current file availability is not yet annotated. This pass does not expand legal engines, submission, or case tracking.

## Local verification

- Fresh `npm ci` and OCR asset preparation passed. ESLint, TypeScript, all 226 unit/component tests in 16 files, and production build passed.
- Public Chromium/real-OCR browser run: 5 passed; 10 authenticated tests were skipped in that public run and counted separately. Authenticated Chromium against a disposable local Supabase stack: 10 passed, including reassessment/rebinding, immutable history, delayed save, both secondary remedies, direct API date rejection, ownership, and receipt regressions. Authenticated development purchase-form check passed. All five migrations applied to that disposable stack; generated local schema types were compared with the maintained type signatures.
- Real PDF renderer produced one-page and two-page A4 samples. All three rendered page images were visually inspected for wrapping, Lithuanian glyphs, attachment names, margins, and page numbering. This does not prove every maximum-length combination.
- Full `npm audit`: 5 high package entries in one development dependency path ending at `braces@3.0.3`; nonzero exit status. `npm audit --omit=dev`: zero findings. There was no compatible patched `braces` release at this review.
- No actual iPhone/Safari or Android check was performed. The README has the manual device checklist. Production migration and signing-key readiness were not inspected or changed.
