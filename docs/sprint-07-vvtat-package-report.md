# Sprint 7 VVTAT evidence package completion report

Date: 2026-10-04 (Europe/Vilnius). Repository: `IgnasGaj/pirkejo_skydas`.

## Baseline and delivery

- Starting branch/SHA: `fix/sprint-06-audit` at `de4a07f061a8948799702b542540eaf1a67a1c52`. The repaired Sprint 6 F1–F7 baseline is an ancestor of `feature/sprint-07-vvtat-package`. Remote main remained `735d861cbf2d8b26534abc2cd7c2e4093cabc7b1` at the last ancestry check and does not contain Sprint 6. The feature branch therefore depends on the fix branch; no merge or deployment was performed.
- Delivered implementation SHA: `2ed98635fbfa98caa8ed9380aee35e0ffd6d3af7`. Follow-up browser regression SHA: `172e4f8dbefabdc131776ed0d109b3aa070366cb`. Final code SHA: `e822c2e4678c31ccc52b2a855cf2d4c1b52f5705` (complete package-reference pagination, sealed review findings and current evidence-object checks). The final report commit SHA is recorded in the delivery message because a commit cannot contain its own SHA.
- The unrelated untracked `docs/sprint-03-1-technical-hardening.md` was preserved and excluded.

## Delivered behavior

An owned defective-product case opens `/cases/[caseId]/vvtat`. It shows the exact generated seller complaint, recorded submission/receipt and response, current versus pinned purchase differences, missing information and qualified routing questions. The user reviews contact details, dispute facts, escalation reason, outcome and selected READY originals before explicitly saving a package. Incomplete and historical cases can still prepare a clearly labelled version. Other document families receive an unsupported explanation and official guidance.

Each saved package pins the case revision, complete bounded event history (including correction links), complaint version and canonical text, selected evidence IDs and original metadata/hash/size, reviewed input, server-derived missing/review/source-limit items, source/rule/template versions and preparation time. Creation uses a case row lock, owner/parent and evidence checks, expected revision, unique request UUID and canonical JSON comparison. An exact retry returns the same version; changed payload or revision reuse fails. Package numbers do not repeat after a deletion. Case changes require explicit new review and leave older packages historical. User edits are retained through focus refresh and ambiguous retry with the existing navigation guard. No package action writes a seller event, marks a complaint sent or changes a deadline.

Authenticated PDF and ZIP routes use owner-scoped rows and `private, no-store`/`nosniff`. The ZIP contains the reviewed summary, pinned complaint PDF and exact text, explicitly selected original evidence under numbered safe names, a byte/hash manifest and Lithuanian manual instructions. The server checks current READY metadata before any download, then actual downloaded bytes and SHA-256 for ZIP. It prepares the entire bounded archive before emitting success headers, and a missing or changed selected file fails the download without creating another version. Existing individual complaint and evidence downloads remain available for official channels that need separate files. The official VVTAT/VTIS submission remains manual.

Package deletion removes its own row. Case and purchase deletion cascade package rows. Evidence deletion remains possible through the existing cleanup coordinator and warns when a file appears in saved packages; subsequent export checks reveal its absence. No duplicate ZIP/PDF Storage objects or new secret were introduced.

Unsupported behavior: official application generation/submission, jurisdiction/admissibility certification, a portal upload-size claim, institutional submission tracking, identity/signature integration, and other document families. The user must follow the current official form and channel requirements.

## Legal source and version record

The [VVTAT request guidance](https://vvtat.lrv.lt/lt/kaip-pateikti-prasyma/) was opened on 2026-10-04; its page says it was updated 2026-09-29. It supports prior written seller contact, refusal/partial satisfaction/no-answer guidance, copies of relevant documents and the VTIS/manual submission route. The exact [e-TAR consolidated Consumer Rights Protection Act edition](https://e-tar.lt/rs/actualedition/TAR.D790096B17EE/gjHLCcpfdw/) returned HTTP 403 on this pass. No new admission, filing-period, signature, jurisdiction or threshold rule was enabled. The existing Sprint 6 response clock retains its prior verified bound through 2026-10-31 and unknown/unverified states remain explicit. `docs/vvtat-package-legal-sources.md` and `src/features/vvtat/sources.ts` hold the source record; repository metadata was not presented as a fresh independent legal verification.

## Persistence and resource contract

Apply additive migrations in order after `20261004010000_case_audit_fixes.sql`:

1. `20261004020000_vvtat_packages.sql` — owned immutable package rows, RLS/read grant, transactional creation/deletion RPCs and bounded snapshots.
2. `20261004030000_vvtat_package_validation.sql` — database boundary for field types, routing, changed outcome explanation and history/hash checks.
3. `20261004040000_vvtat_version_sequence.sql` — persistent per-case version counter, including after package deletion.
4. `20261004050000_vvtat_snapshot_review.sql` — server-derived missing, review and source-limit items sealed into each version.

All four applied successfully to local Supabase only. A fresh `supabase gen types typescript --local --schema public` output was compared with the hand-maintained application type file; package rows/RPCs and the counter relationship are represented there, while direct app writes remain typed as disallowed. No linked/shared/production migration or setting was changed.

Application limits: 20 selected files, 50 MiB original bytes, 60 MiB final archive, 100 package versions per case, 100 KB serialized history at save, 150,000 PDF characters and 120 pages at export, 30 KB HTTP mutation body and two concurrent exports per server process. ZIP uses `fflate` 0.8.3 with stored original bytes. The 50 MiB input plus output and verification buffers can approach roughly 150 MiB per export; two concurrent exports require capacity for about twice that transient memory. These are application budgets, not official portal limits. PDF pages use the bundled Lato font. An over-budget export gives an actionable error and no partial success response.

## Verification on the delivered code

- Clean `npm ci`, lint, typecheck, 276 unit/component tests passed with 7 opt-in backend tests skipped in the credential-free run; production build and `git diff --check` passed.
- Local ordinary-account Supabase integration: 7 passed, 0 skipped. Package assertions cover owner/anonymous denial, foreign and non-READY evidence, NULL revision, changed and exact replay, overlapping saves, immutable rows, monotonic versioning after deletion, complete snapshot, ZIP original hash/manifest, unavailable evidence and cascade cleanup.
- Public Chromium browser suite: 5 passed, 17 authenticated tests intentionally skipped without opt-in.
- Authenticated Chromium suite: 17 passed, including the case, complaint, receipt and VVTAT journey. The package browser test checks exact lost-response retry, retained newer edits after focus refresh, one saved version, ZIP entry bytes/hash/canonical text, historical label after a case update and failed export after selected evidence deletion. Authenticated development purchase/complaint forms passed.
- A representative 180-entry Lithuanian PDF fixture rendered to 9 A4 page images. Pages 1, 2 and 9 were visually inspected: accents, long-word wrapping, page numbers and final entry were present without clipping. An actual one-page saved-package summary was also rendered and inspected after sealing review findings.
- `npm audit --omit=dev`: 0 vulnerabilities. Full `npm audit`: 5 high dependency entries in the existing developer-tooling chain, 0 critical. No forced unrelated framework downgrade was made.

Physical iPhone/Safari, Android and LAN HTTP checks were not performed. Before launch, on actual devices: open the case and package review, scroll long filenames and chronology, use keyboard and Back/Forward with dirty fields, page through more than 50 evidence files, save/retry after network loss, download PDF/ZIP, inspect individual file fallback and verify no horizontal overflow. Repeat on trusted LAN HTTP with a reachable development Supabase endpoint and record observed behavior. Reverify official legal sources and production migration state before any launch. Further clock-controlled midnight, multi-device overlap and heavy 50 MiB export/load tests remain launch-readiness work.

## Exact-candidate CI

The final code SHA `e822c2e4678c31ccc52b2a855cf2d4c1b52f5705` passed [GitHub Actions run 37222042990](https://github.com/IgnasGaj/pirkejo_skydas/actions/runs/37222042990) on this branch. The completed run includes clean dependency installation, lint, typecheck, unit tests, production builds, public Chromium tests, disposable Supabase startup, ordinary-account integration tests, authenticated Chromium tests and the development purchase-form check. The documentation-only report commit receives its own exact-SHA CI run; its outcome is recorded in the delivery message.
