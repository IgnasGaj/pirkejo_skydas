# Pirkėjo Skydas

A Lithuanian consumer-rights app with return and defective-product decision flows and a private purchase vault.

## Local setup

Use Node.js 22 LTS and npm 10 or newer.

1. Install dependencies: `npm ci`.
2. Create a Supabase project. Copy its Project URL and publishable key from the project's Connect or API settings page.
3. Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. The web app does not need a service-role key.
4. Link the project with `supabase link --project-ref <project-ref>`. Review `supabase config diff` and apply the local callback allowlist with `supabase config push`. Review pending migrations with `supabase migration list --linked` and `supabase db push --linked --dry-run`, then apply them with `supabase db push --linked`. The migrations create the purchase vault, private Storage policies, and the reviewed-receipt upload claim. Apply both migrations before running the updated app.
5. In Authentication → Providers, enable Email/password. Choose whether email confirmation is required. If it is, configure the confirmation email template for SSR with a link to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email` instead of the default confirmation URL. Set the Authentication site URL to your app origin (for local development, `http://localhost:3000`). The local `/auth/confirm` callback is listed in `supabase/config.toml`; add the production origin and callback before deploying.
6. Run `npm run dev` and open `http://localhost:3000`.

The existing `/returns` and `/defective-product` flows work without Supabase configuration or an account. The purchase vault requires the Supabase project and environment variables.

### Phone preview on a trusted Wi-Fi

Find the computer's active Wi-Fi IPv4 address, then run `LOCAL_DEV_HOSTNAME=<that-ip> npm run dev -- --hostname 0.0.0.0 --port 3000` on a free port. Open `http://<that-ip>:3000` on the phone and `http://localhost:3000` on the computer. `LOCAL_DEV_HOSTNAME` adds only that host to Next.js development origins; it is optional if the browser does not encounter a development-origin restriction. Keep the computer awake. The phone must use the same trusted Wi-Fi; firewall rules or router client isolation can block access. Do not open router ports for this preview.

For authenticated phone use, the existing backend must have **both** migrations, including `20261002000000_receipt_upload_claims.sql`, and must be reachable from the phone. A `NEXT_PUBLIC_SUPABASE_URL` using `localhost` or `127.0.0.1` on the computer points to the phone itself in browser calls and will not work there; use an authorized reachable development endpoint. Auth confirmation redirects must allow the exact phone origin and `/auth/confirm` callback, or use an already confirmed account. Local HTTP can limit camera and other secure-context browser features. Test file selection and scanning on the actual phone before relying on them.

## Receipt scanning

`/purchases/new` offers manual entry or scan-assisted entry. JPEG, PNG, and browser-decodable WebP images can be scanned; JPEG, PNG, WebP, HEIC, HEIF, and PDF remain valid private evidence files (up to 15 MiB). PDF and HEIC/HEIF require manual entry this sprint. Switching to manual entry after choosing a receipt keeps that file attached until the user removes it. A camera-oriented file input is available alongside ordinary file selection; camera formats vary by device. Existing saved `RECEIPT` images can be scanned from their purchase detail page. Only explicitly selected corrections are applied, and a changed purchase must be reviewed again.

The browser loads Tesseract.js **7.0.0** and its Web Worker only when the user selects **Nuskaityti**. The worker, Tesseract core/WASM **7.0.0**, and Lithuanian and English language files are served from this application's `/ocr/` path. `npm ci` runs `scripts/prepare-ocr.mjs`; `npm run prepare:ocr` can repeat it. The script copies the pinned npm worker/core files and verifies SHA-256 of the checked-in language archives and their decompressed data. OCR has no runtime third-party requests. `assets/ocr/{lit,eng}.traineddata.gz` came from [tessdata_fast commit 8741641](https://github.com/tesseract-ocr/tessdata_fast/tree/87416418657359cb625c412a48b6e1d6d41c29bd) (Apache 2.0). Raw SHA-256: `lit` `1e383df5b055583bc01cb5764ecdf74c540753f2cb3f8205e7105361da4bc989`; `eng` `7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2`. Archive checksums are in the preparation script. [Tesseract.js](https://github.com/naptha/tesseract.js) and [tesseract.js-core](https://github.com/naptha/tesseract.js-core) are Apache 2.0; their package licenses are installed under `node_modules`.

Receipt pixels and extracted text stay in browser memory until the user intentionally saves the original file and confirmed purchase values. The app stores the original evidence privately; it does not store OCR text. Refreshing discards an unsaved review. The scanner rejects decoded images above 20 megapixels and cancels after 90 seconds; it does not resize images. Large or rotated images may recognize poorly, so the manual form remains available. A multi-item receipt still creates one named product per confirmation. Its total is shown separately and never copied into the chosen product's price.

Currency detection uses a checked-in, bounded subset of ISO 4217 codes based on [SIX's official current currency list](https://www.six-group.com/en/products-services/financial-information/market-reference-data/data-standards.html), checked on 2026-10-02. The historical BGN code is retained because older receipts may use it; SIX lists it as historical after Bulgaria adopted EUR in 2026. Symbols and unresolved uppercase amount suffixes also prevent an EUR assumption. Explicit non-EUR or mixed currency evidence keeps product names available but leaves OCR amount and total suggestions empty with a Lithuanian warning. The list is a receipt safeguard, not a conversion or full currency catalog; ordinary EUR and unmarked Lithuanian receipts keep their usual amount suggestions.

A save uses stable purchase and document IDs in the new-purchase URL for retries; the URL contains no receipt content or OCR text. If the purchase succeeds but receipt upload fails, the form says **“Pirkinys išsaugotas, tačiau čekio įkelti nepavyko.”**, keeps a link to that purchase, and retries the attachment against it. Reloading restores the owned saved purchase, though the browser requires selecting the file again. A reviewed receipt first reserves its document row with an expiring database claim and SHA-256 of the original bytes. Only the claim owner uploads; another tab waits, and an interrupted claim can be recovered without removing an object that another request saved. Pending rows are hidden from the evidence list. Ordinary evidence uploads retain their metadata-failure cleanup. Both the server-action and middleware request-body limits are 16 MiB so a multipart file close to the 15 MiB evidence limit can pass through the app.

## Checks

Run these commands in order:

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

`npm test` runs Vitest once and does not watch. The browser suite starts `next start` against the production build on port 3100. It covers public legal flows and unauthenticated purchase redirects without credentials or mocks. Build with blank public Supabase settings for this mode, for example:

```bash
NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY= npm run build
npm run test:e2e
```

The `tests/e2e/ocr.spec.ts` browser test runs the **real** Tesseract worker against a synthetic receipt and checks that OCR assets are requested only after invocation, from the application origin. Parser and retry unit tests use synthetic data and injected adapters; the existing-receipt review interaction tests use a mocked OCR result. Authenticated scan/create/update/delete and RLS checks require the disposable local Supabase setup below; browser tests without it skip those cases. A production build prepares OCR assets automatically, and CI runs the real worker test.

If another `next dev` process is running in the same checkout, its `.next` output can collide with the production build and cause misleading webpack runtime errors. Stop it temporarily, use an isolated copy, or set `NEXT_DIST_DIR=.next-sprint04` for both `npm run build` and `npm run test:e2e`. CI uses a fresh checkout and runs all checks on pushes and pull requests. Its authenticated production browser suite checks purchase creation and editing; `scripts/check-dev-purchase-forms.mjs` checks those routes with a separate `.next-dev-sprint04` output directory. The `verify` job is the check that can later be made required by branch protection.

Database types in `src/lib/supabase/database.types.ts` are derived from both local migrations; they have not been compared with a deployed project. After applying migrations to a local Supabase stack, regenerate and review them with:

```bash
supabase gen types typescript --local --schema public > src/lib/supabase/database.types.ts
```

The current type file preserves the SQL checks' literal values for purchase channel, document type, and currency. Review generated differences against the migration before committing them.

### Dependency audit

`npm audit` currently reports two entries, `next` and its nested `postcss@8.4.31`, for one underlying PostCSS dependency. The [XSS advisory](https://github.com/advisories/GHSA-qx2v-qp2m-jg93) requires attacker-controlled CSS to be parsed, stringified, and embedded in an HTML `<style>` element. The [source-map advisories](https://github.com/advisories/GHSA-6g55-p6wh-862q), [follow-up](https://github.com/advisories/GHSA-r28c-9q8g-f849), and [incomplete-fix report](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp) require attacker-controlled CSS with a `sourceMappingURL` to reach the vulnerable processor. In this application Next's PostCSS runs for CSS imports during development and production builds. The app imports its own `src/app/globals.css`; purchase evidence accepts images and PDF, not CSS, and no route parses user CSS. These conditions make the reported paths inapplicable to the current application inputs, but the nested vulnerable package remains installed.

Next.js 15.5.27 still pins PostCSS 8.4.31, while the app's Tailwind/Vite dependencies resolve a patched PostCSS. A [15.5 backport proposal](https://github.com/vercel/next.js/pull/97336) for PostCSS 8.5.23 was closed after upstream test failures. No published 15.5 patch containing that bump was available at this review. We did not override Next's exact dependency pin; review a supported 15.5 patch when released and rerun `npm audit` and the full check suite. The Vitest redirect-mock advisory was resolved by upgrading Vitest from 3.2.7 to the first patched stable release, 4.1.11.

## Privacy verification

Use a disposable, migrated local or dedicated test Supabase project and two ordinary accounts, A and B. Use only the public URL and publishable key; never use a service-role key for the verification. Do not run destructive checks against ordinary user data.

1. Sign in as A and create a uniquely named test purchase. Upload a synthetic valid PDF or PNG with no personal data. Record the purchase ID, document ID, and Storage path. Verify A can read and update the purchase and metadata, and can read its Storage object and receive a signed download redirect from `/api/purchases/<purchase-id>/documents/<document-id>/access`.
2. Sign in as B with a separate browser session. Query A's purchase and metadata by ID with the public Supabase client. Try to update and delete each row, and try inserting document metadata that references A's purchase. Check both errors and persisted state: an RLS-filtered mutation can return no error while affecting zero rows. A's rows must remain unchanged.
3. As B, try to read, upload to, and delete A's Storage path. Request A's document access endpoint in B's browser. All attempts must be denied or return no accessible row; the endpoint must issue no signed URL.
4. Repeat direct purchase, metadata, and Storage reads without a session; they must be denied. Verify B can perform the same allowed operations on B's own test purchase and evidence.
5. Sign back in as A, verify A's records are still intact, then delete only the test-created evidence and purchase. Clean up B's test records as well. Inspect the database and Storage bucket to confirm cleanup.

An issued signed URL is a temporary bearer link and generally remains usable until expiry; test unauthorized issuance and direct Storage access separately. Unit and credential-free browser smoke tests do not prove live RLS.

The opt-in `npm run test:e2e:auth` runs sequentially against **local** Supabase only. It covers the two-account purchase lifecycle, a concurrent database claim, real scan-assisted save and cancellation, a forced upload conflict followed by attachment retry, private receipt loading, selected corrections, stale or deleted-document rejection, a near-15 MiB upload, and PDF manual fallback. CI starts a disposable local Supabase stack and creates two ordinary accounts with email confirmation disabled only in its temporary checkout. For a manual run, start the local stack with `supabase start` and apply both migrations. Create and confirm two ordinary test accounts, A and B, using the public client or the app; local confirmation mail is at `http://127.0.0.1:54324`. Put a JSON file outside Git with this shape:

```json
{
  "url": "http://127.0.0.1:54321",
  "key": "<local publishable key from supabase status>",
  "a": { "id": "<A user UUID>", "email": "<A test email>", "password": "<A test password>" },
  "b": { "id": "<B user UUID>", "email": "<B test email>", "password": "<B test password>" }
}
```

Run the production build with `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` set to the local publishable key. Then set `E2E_AUTH_LOCAL=1` and `E2E_AUTH_CREDENTIALS_FILE` to the absolute path of that JSON file and run `npm run test:e2e:auth`. Set `NEXT_DIST_DIR=.next-sprint04` for both commands if development is using `.next`. The tests refuse a nonlocal API, create uniquely named purchase and evidence records, and clean up those records even when a check fails. Missing opt-in settings produce an explicit skip. Set `E2E_CAPTURE_REVIEW=1` to save desktop and mobile Chromium review screenshots under `/tmp`; these are browser viewport checks, not actual iPhone/Safari or Android device tests. Dispose of the local test stack with `supabase stop --no-backup` when finished; do not use ordinary user data or production credentials.
