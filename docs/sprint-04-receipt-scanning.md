# PIRKĖJO SKYDAS — SPRINT 04
## Receipt scanning, reviewed purchase data, and evidence-safe saving

Implement this sprint in the existing repository:
https://github.com/IgnasGaj/pirkejo_skydas.git

Read this entire specification before editing. Implement the complete vertical slice, run the required checks, commit, and push the finished implementation. Keep scope limited to this document.

Conversation and developer documentation: English.
All user-facing interface text, errors, labels, statuses, and accessibility text: Lithuanian.

## 1. Product outcome

A signed-in user can select or photograph a receipt, read its text on their device, review suggested purchase details, correct them, and save one purchase with the original receipt attached privately.

A user can also scan a supported receipt already saved against their own purchase and explicitly apply selected corrections.

OCR provides suggestions. The existing deterministic return and defective-product engines remain the only source of legal decisions. No extracted text may silently change legal facts.

## 2. Repository review and exact baseline

Reviewed on 2026-10-01 using the GitHub repository, including both published branches.

| Snapshot | Verified state |
| --- | --- |
| Default branch `main` | `baacf4b4ac24477f21e13ff43640b69cecee6d5e` — persistent purchase vault |
| Newer hardening branch | `codex/sprint-03-1-hardening` at `b37d9dab3e8d3d433eb5806457e9cb154b608894` |
| Branch relationship | Hardening is one commit ahead of the reviewed main; no pull request was returned at review time |
| Main checks run during this review | `npm test`: 85/85 passing; `npm run typecheck`: passing; `npm run build`: passing |
| Hardening CI observed | GitHub CI run 36870806499 completed successfully for the exact hardening commit |
| Verification limits | No authenticated live Supabase lifecycle, live RLS test, or real-device OCR was performed in this planning review; hardening checks were observed in CI rather than rerun locally |

Relevant evidence:
- Main snapshot: https://github.com/IgnasGaj/pirkejo_skydas/tree/baacf4b4ac24477f21e13ff43640b69cecee6d5e
- Hardening snapshot: https://github.com/IgnasGaj/pirkejo_skydas/tree/b37d9dab3e8d3d433eb5806457e9cb154b608894
- Comparison: https://github.com/IgnasGaj/pirkejo_skydas/compare/baacf4b4ac24477f21e13ff43640b69cecee6d5e...b37d9dab3e8d3d433eb5806457e9cb154b608894
- CI: https://github.com/IgnasGaj/pirkejo_skydas/actions/runs/36870806499

These are historical review anchors, not an instruction to downgrade newer code. Fetch current refs and inspect the worktree before implementation.

### Required baseline handling

1. Check `git status`, repository instructions, remotes, branches, and current commits. Preserve unrelated local work.
2. Check whether the hardening commit, or equivalent changes, is already in the current implementation.
3. If it is merged into main, start from current main.
4. If it remains unmerged, start a neutral feature branch from the latest hardening branch, preserving its history. Do not discard those changes or automatically merge/push main.
5. If branches have diverged, inspect the differences and resolve only what is required for this sprint. Do not reset or force-push user work.
6. Record the actual starting SHA in the completion report.

Use a normal new branch name such as `feature/sprint-04-receipt-scanning`. The pre-existing hardening branch name is only a reference to locate existing work.

## 3. Existing architecture to reuse

The project uses Next.js App Router, React, TypeScript, Tailwind, Zod, Vitest, and Supabase.

Reuse:
- `src/features/purchases/domain/types.ts`
- `src/features/purchases/domain/validation.ts`
- `src/features/purchases/components/PurchaseForm.tsx`
- `src/features/purchases/data/actions.ts`
- `src/features/purchases/data/purchases.ts`
- `src/features/purchases/data/document-service.ts`
- `src/features/purchases/domain/upload.ts`
- `src/features/purchases/data/auth.ts`
- `src/lib/supabase/server.ts`, browser client, and middleware
- `src/lib/date.ts` and typed database definitions introduced by hardening
- `supabase/migrations/20261001000000_purchase_vault.sql`
- Existing document-access route under `/api/purchases/[id]/documents/[documentId]/access`
- Existing lint, CI, and Playwright setup from hardening

Current purchase facts:
- One named product per purchase, not a basket accounting model.
- Required: product name, seller name, purchase date, purchase channel.
- Optional: received date for distance purchases, EUR price in integer cents, reference number, notes.
- Purchase channels: `PHYSICAL_STORE`, `DISTANCE`, `UNKNOWN`.
- Private bucket: `purchase-evidence`.
- Object path: `<authenticated-user-id>/<purchase-id>/<random-document-id>.<extension>`.
- Existing proof files support JPEG, PNG, WebP, HEIC, HEIF, and PDF, up to 15 MiB.
- Existing RLS ties documents to an owned purchase through a composite foreign key.
- Files cannot be stored under a purchase path before that purchase exists under current Storage policies.

The hardening branch separates the date helper from Zod validation, preserves failed form values with `useActionState`, adds pending controls, improves delete dialogs, removes evidence-list N+1 queries, and adds database types and CI. Preserve these improvements.

## 4. Small prerequisite fixes and checks

Before adding OCR:
- Reproduce or verify the previously reported `__webpack_require__.n is not a function` on `/purchases/new` and edit forms when a test account is available.
- Keep client components from importing server modules or runtime-heavy validation just to obtain a date helper. A type-only action-state import is acceptable.
- Run dev and production builds in separate checkouts/output contexts, or stop dev before build; concurrent writes to the same `.next` can invalidate runtime observations.
- Verify the existing file signature helper checks the full required header length. The reviewed PNG branch uses `every` on a sliced array without requiring eight bytes; a short matching prefix can pass that check. Add minimum-length checks for every supported signature and regression cases.
- Keep server-side file, ownership, metadata, and signature validation for all new uploads.
- Surface authentication email rate limiting clearly if encountered; do not bypass confirmation or repeatedly register accounts to make tests pass.

A clean build does not prove the authenticated runtime error is fixed. Report the actual reproduction result and any missing backend access honestly.

## 5. OCR technology decision

Use Tesseract.js in the browser in a Web Worker, loaded only when scanning is requested. Use Lithuanian and English language data (`lit` and `eng`), and verify the installed version's actual API.

This sprint requires no paid vision API, no LLM, no API key for OCR, and no server OCR pipeline.

Primary implementation references:
- https://github.com/naptha/tesseract.js
- https://github.com/naptha/tesseract.js/blob/master/docs/api.md
- https://github.com/naptha/tesseract.js/blob/master/docs/local-installation.md
- https://github.com/naptha/tesseract.js/blob/master/docs/tesseract_lang_list.md

Choose an exact compatible released package version and commit the lockfile. Follow documentation for that version, not old snippets.

Serve the worker, compatible core/WASM variants, and required language files from this application's origin. Add a reproducible asset-preparation script and hook it into documented install/build/dev setup. Verify files are available in production and CI. Respect upstream licenses and record origins/version/checksums for downloaded language assets. Never depend on an unversioned CDN at runtime.

Do not load OCR code or models on the homepage, login, public legal flows, or purchase listing.

Receipt pixels and OCR text stay on the device until the user intentionally saves the original proof file and confirmed purchase values. Do not send pixels/text to analytics, OCR services, or logs. OCR language assets can be cached; receipt content must not be placed in persistent browser storage.

## 6. Supported scanning formats

| Format | Evidence saving | Automatic scanning this sprint |
| --- | --- | --- |
| JPEG/JPG | Preserve | Required |
| PNG | Preserve | Required |
| WebP | Preserve | Required when browser decoding succeeds |
| PDF | Preserve | Deferred; manual entry |
| HEIC/HEIF | Preserve | Deferred; manual entry or choose a JPEG image |

Do not claim Tesseract.js directly reads PDFs. Do not add PDF rendering or HEIC conversion to this sprint.

Show clear Lithuanian fallback text:
“Šį failą galite išsaugoti kaip pirkimo įrodymą. Automatiniam nuskaitymui pasirinkite JPG, PNG arba WebP nuotrauką.”

An unsupported scan format is not an unsupported evidence format.

## 7. New purchase flow

Extend `/purchases/new`; do not create a second purchase system.

Offer:
- “Nuskaityti čekį”
- “Įvesti ranka”

Scan sequence:
1. Select one image or optionally use a camera-oriented file input.
2. Show its preview and an explicit “Nuskaityti” control.
3. Read text in a worker with visible preparation/recognition progress.
4. Parse suggestions with a pure deterministic parser.
5. Show the original preview and editable review fields.
6. User completes required fields and confirms “Išsaugoti pirkinį ir čekį”.
7. Validate confirmed values server-side, create the purchase, and attach the original file through existing private storage behavior.
8. Navigate to purchase detail only with truthful full/partial success status.

Manual entry remains available before and after any scan failure. A failed scan must not force the user to repeat already typed data.

Before explicit save, do not create purchases, upload files, or store OCR text. Refreshing/closing loses an unsaved draft; communicate this when necessary without introducing a draft database.

Use “Nuskaitytus duomenis patikrinkite prieš išsaugodami.” above the review.

## 8. Scan an existing saved receipt

For supported `RECEIPT` image documents on an owned purchase:
- Add “Nuskaityti čekį”.
- Load only the requested document after authenticated ownership verification of both purchase ID and document ID.
- Reuse the authenticated document-access boundary. If a same-origin binary route is needed to load the image safely, keep it narrowly scoped, private/no-store, and backed by the user's RLS-respecting client.
- Resolve object paths from trusted database metadata. Never accept a client-supplied storage path or arbitrary remote URL.
- Verify declared size and actual file data before decoding; bound response size.
- Keep the existing file intact. Scanning must neither re-upload nor duplicate it.
- Present current values alongside proposed corrections; apply only fields explicitly selected by the user.
- Detect a stale purchase version at save time using an `updated_at` guard or equivalent so a scan review cannot silently overwrite newer edits.
- Failed updates retain the reviewed edits for retry.
- Deleting the document or purchase during scanning must produce a safe unavailable state on save.

Do not scan invoices, warranty documents, or arbitrary files automatically; this sprint's parser targets receipts.

## 9. Extraction contract and parser

Place OCR interaction, parsing, and UI in separate modules under a feature such as `src/features/receipts/`.

Suggested separation:
- `domain/types.ts`
- `domain/parseReceiptText.ts`
- `domain/parseReceiptText.test.ts`
- `client/ocr.ts`
- `components/ReceiptScanner.tsx`
- `components/ReceiptReview.tsx`

Adapt names to existing conventions. Do not duplicate purchase schemas or legal engines.

A parser result should carry:
- Candidate seller name, purchase date, reference number.
- Candidate product lines and amounts only where supported by the text.
- Receipt total separately from a product price.
- Field warnings and source snippets.
- Raw OCR text only in ephemeral memory.

Use nullable/missing candidates, never fabricated defaults. Accept an explicit `asOfDate` for date validation rather than reading a hidden clock inside the parser.

Distinguish recognition confidence reported by the OCR library from deterministic parser ambiguity. Do not invent field-specific confidence percentages.

Render OCR text as plain escaped text in a collapsed “Nuskaitytas tekstas” section. Never execute it, render HTML from it, follow extracted links, or use it as instructions.

## 10. Extraction rules

### Seller
Suggest a plausible seller header, preserving Lithuanian characters. Do not treat a VAT number, address, card terminal/acquirer, payment brand, or cashier line as the seller. If uncertain, leave it blank or show clearly labeled alternatives.

### Dates
Support unambiguous `YYYY-MM-DD`, `YYYY.MM.DD`, and Lithuanian day-first `DD.MM.YYYY` / `DD-MM-YYYY` receipt dates. Validate real calendar dates.

Reject impossible and future dates as usable suggestions; explain why. Preserve date-only values without timezone conversion. If multiple plausible transaction dates conflict, require user selection. Do not substitute warranty-expiry, print, invoice-due, or card-validity dates.

Do not silently repair OCR digit substitutions into a confirmed date.

### Money
Normalize common EUR comma/dot decimal amounts to safe integer cents through a bounded parser. Support grouping separators only when unambiguous. Reject negative refund amounts as ordinary purchase-price suggestions; distinguish returns/refunds.

Do not mistake VAT/PVM, subtotal, discount, paid cash, change/grąža, unit price, or loyalty savings for the final product price. Ambiguous amounts remain suggestions requiring review. Do not treat another currency as EUR or perform currency conversion.

### Reference number
Read only a recognizable receipt/document reference when present. Do not confuse it with card digits, terminal IDs, company codes, or bank details.

### Product
The user must explicitly identify the single product to save. Offer plausible OCR product-line choices where practical and always allow manual typing. Do not infer the product from a seller name or choose the first numeric line.

Do not build a complete line-item accounting system, merchant template database, or bulk purchase creation.

## 11. Critical multiple-item receipt behavior

A receipt can contain many products while the current model stores one product.

Therefore:
- Show receipt total separately, labeled “Bendra čekio suma”.
- Do not populate a selected product's price with the receipt total.
- Require the user to choose/name the product.
- Offer a product amount only when that line is clearly associated with the selected product and its quantity/discount interpretation is clear.
- Otherwise leave purchase price empty for manual entry; it is already optional.
- Quantity greater than one or unclear discounts must trigger a warning; do not invent a per-unit final price.
- Save only one purchase per confirmation. No “create every line as a purchase” feature.
- Keep the complete original receipt attached as evidence.

Even a one-item receipt requires review; “one item” cannot be assumed because OCR failed to recognize other lines.

## 12. Facts that scanning must never infer

Leave these to explicit user answers:
- Purchase channel: initialize new scan drafts to `UNKNOWN`.
- Received/delivery date.
- Consumer/business buyer status and professional/private seller status.
- Product category/subtype and statutory legal classification.
- Product condition, seal opening, use, defect cause.
- Commercial guarantee duration, statutory guarantee end, repair-extension eligibility.
- Seller claim date, response deadline, remedy, or escalation eligibility.

A merchant URL or online-looking company name does not establish a distance contract. A receipt date does not prove delivery.

Existing saved purchase context can continue to suggest verified dates in legal wizards exactly as before. OCR candidates may reach those flows only after explicit review and server-validated saving. Preserve unanswered legal questions.

## 13. OCR lifecycle, resources, and mobile UX

Implement states such as idle, preparing, reading, review, failed, cancelled, saving, and partial success.

Required:
- Lazy worker creation; only one active scan at a time.
- Progress based on actual worker status; do not fake a countdown.
- Explicit cancellation, worker termination on cancel/unmount, and ignored stale callbacks/results.
- New image selection cancels the old scan and cannot overwrite edits with an old result.
- A bounded scan timeout, initially 90 seconds, with retry/manual fallback.
- A documented decoded-image limit, initially 20 megapixels, checked before canvas processing. Reject overly large dimensions safely.
- If resizing is used, preserve aspect ratio, readable text, and the untouched original upload file. Explain any quality limitations.
- Revoke temporary object URLs and free decoded image/canvas resources.
- Do not block navigation or the main thread during recognition.
- No automatic repeated OCR attempts on failure.
- Honor image orientation when decoding and inspect rotated receipt behavior.
- Do not retain decoded images/OCR text after leaving or completing the workflow.

Preserve the current mobile visual design. Provide usable 44px-or-larger controls, keyboard access, labeled fields, visible focus, accessible progress/status messages, and error focus.

Provide a camera shortcut without preventing normal file selection. Actual iPhone/Safari and Android behavior must be reported separately from browser emulation; HEIC capture may need the format fallback above.

## 14. Failure safety and duplicate prevention

Storage and PostgreSQL are not one atomic transaction. Design and test partial failures explicitly.

New purchase saving must:
1. Retain a stable per-draft UUID/request identifier across retries.
2. Derive ownership from the authenticated server session, never hidden form user IDs.
3. Prevent repeated clicks, retries, or a lost response from creating multiple purchases for the same confirmation.
4. Reuse the same owned saved purchase after partial success.
5. Prevent evidence duplication during retry. Use a stable document identifier/path for that save attempt and verify existing metadata/object state rather than blindly treating “already exists” as success.
6. Keep the existing cleanup behavior when Storage upload succeeds but metadata insertion fails.
7. Preserve the original failure if cleanup also fails, without leaking file contents or signed URLs.
8. Never delete unrelated existing purchases or evidence as compensation.

Use the smallest implementation compatible with current schema. Stable UUID primary keys plus ownership-scoped lookups may be sufficient; if a new request-token column/constraint is required, add an additive migration and update types. Do not introduce a draft/job system.

If purchase creation succeeds but proof saving fails, explicitly show:
“Pirkinys išsaugotas, tačiau čekio įkelti nepavyko.”
Offer attachment retry against that saved purchase and a link to its detail. Do not present full success or create a second purchase on retry.

Server errors retain reviewed text values. The browser may require reselecting a file after a reload or expired session; explain that honestly. Once a purchase has been saved, cancelling an attachment retry must not silently remove it.

## 15. Privacy, auth, and database scope

- Keep the bucket private, current ownership-scoped queries, composite FK, and RLS.
- No service-role key in the application or tests of ordinary user authorization.
- No anonymous upload/scanning route tied to private documents.
- Unauthorized document requests return a generic unavailable result and issue no signed URL.
- For private binary responses use `Cache-Control: private, no-store`; do not put receipt responses in a service-worker cache.
- No raw OCR logs, card-number persistence, extracted text analytics, or permanent raw-text tables.
- Do not put OCR text, file contents, or temporary bearer URLs in query strings.
- Retain original-file evidence support and the 15 MiB server limit, including signature checks.
- Existing upload body limit is 16mb. Verify multipart requests near 15 MiB remain accepted; never remove server limits.
- Revalidate home/purchase list/detail after relevant saves.
- Preserve safe login destinations. If new purchase subroutes are added, update `safeReturnPath` narrowly; never allow arbitrary redirect targets.
- Do not change historical migrations already applied. Any needed schema change gets a new migration.
- Update hardening's typed Supabase definitions for schema changes; distinguish migration-derived types from types verified against a running backend.

No persistent OCR/job/draft table is required for this MVP.

## 16. Required automated tests

Keep all return, defect, purchase, date, data-access, lint, and smoke checks passing.

### Parser tests
Use synthetic Lithuanian-style fixtures with known expected values:
1. Clear EUR receipt with seller, ISO date, product line, receipt number, and total.
2. Lithuanian diacritics and comma decimal amounts.
3. Day-first and dotted ISO dates.
4. Impossible/future dates and competing dates.
5. VAT, subtotal, cash tendered, and change are not product prices.
6. Multiple products: receipt total cannot become selected product price.
7. Quantity/discount ambiguity leaves amount for review.
8. Missing product, seller, or date remains missing.
9. Non-EUR currency does not convert silently to EUR.
10. Refund/negative values and ambiguous money separators.
11. Empty/noisy OCR, oversized text bounds, and literal HTML/script content.
12. No inferred channel, delivery date, category, guarantee, or legal decision.

### Lifecycle/service tests
13. Cancellation/timeout terminates the worker and ignores late results.
14. Rescanning does not overwrite manually reviewed fields with stale output.
15. Unsupported scan format still permits evidence saving.
16. Minimum-length signature validation rejects truncated prefixes.
17. Server validation rejects invalid confirmed values.
18. Repeated confirmation/lost-response retry creates at most one purchase/document.
19. Upload failure gives partial success and attachment retry targets the existing purchase.
20. Metadata failure cleans up; cleanup failure remains explicit.
21. Existing-document scan cannot access another user's purchase/path.
22. Applying selected corrections preserves unselected values and rejects stale updates.

Use injected OCR/storage adapters for deterministic unit tests. These do not substitute for a real worker test or live RLS.

### Browser and actual OCR tests
- Preserve existing credential-free public-route smoke suite.
- Add a real worker/browser test against a synthetic high-contrast receipt image with locally served OCR assets. Assert a small known text subset to prove recognition actually runs; avoid exact full-text snapshots.
- Test lazy loading, progress, cancellation, review editing, and error/manual fallback using appropriate fixtures/adapters. Clearly distinguish mocked UI tests from actual OCR.
- Authenticated create/attach/update/delete and cross-account cases require a disposable local or dedicated test Supabase backend. Keep credentials outside Git. If unavailable, report those cases as unverified.
- Add only synthetic fixtures without personal data or paid-provider access.
- Inspect the review screen on desktop and a mobile viewport; include actual iPhone/Safari testing if available, otherwise mark it pending.

## 17. Live verification checklist

With two ordinary test accounts A and B:
- A can create a scan-assisted purchase and privately save its original receipt.
- A can reload the detail, view/download proof, scan it again, and apply selected changes.
- B and anonymous users cannot query/mutate A's rows, load its private binary route, or obtain a document access URL.
- Forged purchase/document ID combinations and storage paths cannot expose files.
- Test ownership through direct Supabase access as well as app routes; RLS-filtered updates/deletes may affect zero rows without an error.
- Save retries do not duplicate rows or Storage objects.
- Removing a receipt removes its metadata/object; deleting the purchase removes its evidence.
- Use only test-created records and clean them up.

Signed URLs are temporary bearer links; verify unauthorized issuance separately from access to a URL already issued legitimately. Do not claim unit tests prove live RLS.

## 18. Out of scope

Do not implement:
- Paid vision APIs, LLM extraction, AI legal advice.
- PDF OCR/rendering or HEIC conversion.
- Multi-page/multi-file scans and bulk line-item imports.
- Complaint generation or sending, case tracking, VVTAT packages.
- Guarantee calendars, reminders, email imports, payments.
- Merchant databases, background OCR queues, admin tooling.
- A visual redesign or replacement auth/database architecture.

Do not modify legal rules simply because OCR is being added. Any newly discovered legal concern goes into the existing review documentation and remains conservative pending verification.

## 19. Implementation order and verification commands

1. Resolve the hardening baseline and run existing checks.
2. Fix the short-signature validation and verify the purchase-form runtime boundary.
3. Add reproducible same-origin OCR assets and lazy client adapter.
4. Implement pure parser and fixture tests.
5. Add review UX to the new purchase form and safe save/attachment retry.
6. Add existing-document scanning with explicit selected updates.
7. Add browser/worker and service regression tests.
8. Run final checks, inspect diff and secret handling, update README, commit, and push.

Expected commands, adjusted only where the actual repository has equivalent scripts:
```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Keep Vitest excluding Playwright tests as hardening does. OCR assets must be ready before production build/browser checks. Ensure CI runs the new real OCR smoke test without third-party runtime asset requests.

Never claim checks passed when blocked or skipped. Do not silently drop slow tests or replace actual recognition with mocked output to obtain green CI.

## 20. Documentation and Git delivery

Store this implementation specification at:
`docs/sprint-04-receipt-scanning.md`

Update README with:
- OCR setup, exact dependencies, asset preparation, licenses.
- Supported scan formats versus proof-storage formats.
- Browser-side processing and what is persisted.
- Multiple-item limitations and required review.
- Timeout/image-size limits and fallback behavior.
- Full checks, actual OCR test, live-backend prerequisites.
- Partial-save recovery behavior.

Use normal project documentation, comments, branch names, and commit messages. Do not add assistant attribution, generated-by banners, assistant co-author trailers, or agent scratch files. Preserve existing history; do not rewrite old commits or claim historical attribution has been removed.

Example commit: `feat: add reviewed receipt scanning`.

Push the finished feature branch to the existing repository. Do not force-push, merge into main, deploy, or mutate a production Supabase instance as part of this sprint.

## 21. Definition of done and completion report

Complete only when:
- New purchase scanning and existing saved-receipt scanning work end to end.
- Suggestions are editable, explicit, and never silently trusted.
- Receipt total and product price remain distinct.
- No legal facts are inferred by OCR.
- Manual entry and all existing evidence formats still work.
- Original evidence is private and retained unchanged.
- Cancelling/failing OCR leaves a usable form.
- Partial saves and retries do not duplicate purchases/evidence.
- Required checks pass, and any unavailable live/device checks are clearly identified.
- Code, docs, lockfile, asset setup, and necessary migrations/types are committed and pushed.

Report concisely:
1. Starting branch/SHA and how hardening was preserved.
2. Features delivered and format/multiple-item limitations.
3. Purchase-form runtime-error reproduction result.
4. OCR package/version, language assets, and privacy behavior.
5. Exact check results; mocked versus actual OCR verification.
6. Live RLS/authenticated lifecycle and actual-device verification status.
7. Any migration/setup steps and remaining blockers.
8. Pushed branch, commit SHA, and repository link.

Do not mark the sprint fully verified when live backend or device checks remain unperformed.
