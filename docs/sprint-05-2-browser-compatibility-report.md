# Sprint 5.2 browser compatibility report

Date: 2026-10-03

Branch: `feature/sprint-05-2-browser-compatibility`

Base: `0794a5554e1e135821a5e3bad22a9e95f45db145` (`feature/sprint-05-1-hardening`)

## Finding and cause

F5 is recorded as a later P1 follow-up in [the Sprint 5 inspection](sprint-05-inspection.md). The reported actual iPhone/Safari session showed `crypto.randomUUID is not a function` while opening the complaint composer. The screenshot did not establish its URL scheme. The Sprint 5.1 composer called `crypto.randomUUID()` directly in four places: initial save and generation IDs, and both success rotations. The first two calls occurred during component initialization, before the questionnaire rendered. Other remaining application calls are in server-side purchase/receipt actions or a server page, so they do not share this browser assumption.

The secure-context explanation is consistent with [MDN randomUUID](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID), [getRandomValues](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/getRandomValues), and [secure contexts](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Secure_Contexts). It was confirmed for a desktop Chromium session at the actual development LAN origin `http://192.168.0.82:3102`: `isSecureContext === false`, `typeof crypto.randomUUID === "undefined"`, and `typeof crypto.getRandomValues === "function"`. This does not retrospectively prove the screenshot used HTTP. An older browser can also lack `randomUUID`.

## Fix and request behavior

`src/lib/browser-uuid.ts` feature-detects a callable native `randomUUID` and invokes it on the Crypto receiver. If unavailable or throwing, its fallback obtains 16 secure bytes using `getRandomValues`, sets the UUID v4 version and RFC variant bits, and returns a UUID accepted by the server's UUID schema. If neither API works, it returns `null`; the composer retains entered values and disables requests with a Lithuanian explanation. It never sends an invalid ID. IDs are allocated after hydration, so server rendering does not depend on browser Crypto or produce different ID-dependent markup.

The composer uses this path for both initial request IDs and both success rotations. A failed or lost-response retry keeps the same logical request ID; a successful save or generation marks success and prepares a fresh ID. If a later rotation fails, the completed operation remains visibly successful, its facts remain in the form, and a subsequent operation requiring that ID is disabled. Existing backend idempotency, optimistic concurrency, reassessment, edit locks, immutable versions, authorization, and clipboard fallback remain in place.

## Verification

| Check | Local result |
| --- | --- |
| `npm ci` | Passed; prepared same-origin OCR assets. npm reported five existing high-severity development dependency advisories, as documented in Sprint 5.1. |
| `npm run lint` | Passed after removing isolated generated Next build directories. |
| `npm run typecheck` | Passed. |
| `npm test` | 234 tests passed in 17 files. |
| `npm run build` | Passed in public and disposable-backend modes, using isolated `NEXT_DIST_DIR` because another dev server occupied the default output directory. |
| `git diff --check` | Passed. |
| Public Chromium Playwright | 5 passed; 10 authenticated cases intentionally skipped in this mode. |
| Authenticated Chromium Playwright with disposable local Supabase | 10 passed. All five migrations applied locally. The complaint browser test removes `randomUUID` before navigation and covers legal questionnaire, save/reopen/edit/save, generation, immutable version, PDF/text API export, and selectable-text copy fallback. Existing API tests cover duplicate generation and lost-response save retry. This is automated Chromium testing, not an iPhone or Android result. |
| Actual insecure desktop browser origin | Chromium loaded `http://192.168.0.82:3102/login`; observed insecure context, missing `randomUUID`, and available `getRandomValues`. The development server was started with `npm run dev -- --hostname 0.0.0.0 --port 3102`. |
| CI disposable stack startup correction | `supabase start -x mailpit` applied all five migrations locally; `scripts/prepare-local-e2e.mjs` created ordinary synthetic accounts successfully without the mail container. The stack was stopped without backup. |

The local Supabase stack was disposable and was stopped without backup after testing. No production database, Auth configuration, or deployment settings were changed. The unrelated untracked Sprint 3.1 document was preserved.

## Device acceptance still pending

No physical iPhone/Safari or Android device was available for this pass. A trusted HTTPS origin was also unavailable. These checks remain **pending**, and the Chromium tests above are not substitutes for them.

To repeat on phones, start the app with a disposable local backend and `LOCAL_DEV_HOSTNAME=192.168.0.82 npm run dev -- --hostname 0.0.0.0 --port 3102`, updating the host IP if it changes. On the same LAN, open `http://192.168.0.82:3102/purchases/<synthetic-owned-purchase-uuid>/complaints/new?flow=defect` in iPhone/Safari and Android. Use synthetic consumer and purchase data. Complete an eligible legal questionnaire; enter and review facts; save, reopen, edit/save, generate, inspect the preview, download PDF/text, and try copy or its selectable-text fallback. Check for the runtime error, value retention after recoverable errors, mobile keyboard and layout behavior. Repeat at a trusted HTTPS origin when available. LAN HTTP development is not the production hosting setup.

## Push and CI record

The first pushed fix commit was `a524e864c59ddb1df3e6e06337dd866b07f433b7`. [CI run 37121487527](https://github.com/IgnasGaj/pirkejo_skydas/actions/runs/37121487527) passed install, lint, typecheck, unit tests, build, and public browser checks, then failed while starting the disposable Supabase stack: the runner's port `54324` was already occupied by another process. The authenticated CI stage did not run. The local authenticated suite above passed independently.

The workflow now excludes the unused mail inbox container when starting its disposable stack; email confirmation is already disabled for its synthetic accounts. The exact final commit SHA and its GitHub Actions result are recorded in the task handoff after the second push, because a tracked report cannot contain the hash of its own commit. CI was pending for that second commit when this report was updated. The branch remains unmerged and undeployed.
