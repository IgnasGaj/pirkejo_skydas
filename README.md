# Pirkėjo Skydas

A Lithuanian consumer-rights app with return and defective-product decision flows and a private purchase vault.

## Local setup

Use Node.js 22 LTS and npm 10 or newer.

1. Install dependencies: `npm ci`.
2. Create a Supabase project. Copy its Project URL and publishable key from the project's Connect or API settings page.
3. Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. The web app does not need a service-role key.
4. Link the project with `supabase link --project-ref <project-ref>`. Review `supabase config diff` and apply the local callback allowlist with `supabase config push`. Review pending migrations with `supabase migration list --linked` and `supabase db push --linked --dry-run`, then apply them with `supabase db push --linked`. The migration creates both tables, indexes, constraints, RLS policies, and the private Storage bucket and policies.
5. In Authentication → Providers, enable Email/password. Choose whether email confirmation is required. If it is, configure the confirmation email template for SSR with a link to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email` instead of the default confirmation URL. Set the Authentication site URL to your app origin (for local development, `http://localhost:3000`). The local `/auth/confirm` callback is listed in `supabase/config.toml`; add the production origin and callback before deploying.
6. Run `npm run dev` and open `http://localhost:3000`.

The existing `/returns` and `/defective-product` flows work without Supabase configuration or an account. The purchase vault requires the Supabase project and environment variables.

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

If another `next dev` process is running in the same checkout, its `.next` output can collide with the production build. Stop it temporarily or build and run browser tests in an isolated copy. CI uses a fresh checkout and runs all checks on pushes and pull requests. The `verify` job is the check that can later be made required by branch protection.

Database types in `src/lib/supabase/database.types.ts` are derived from `supabase/migrations/20261001000000_purchase_vault.sql`; they have not been compared with a deployed project. After applying migrations to a local Supabase stack, regenerate and review them with:

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

The opt-in `npm run test:e2e:auth` automates the two-account checks and purchase lifecycle against **local** Supabase only. Start the local stack with `supabase start` and apply the migration. Create and confirm two ordinary test accounts, A and B, using the public client or the app; local confirmation mail is at `http://127.0.0.1:54324`. Put a JSON file outside Git with this shape:

```json
{
  "url": "http://127.0.0.1:54321",
  "key": "<local publishable key from supabase status>",
  "a": { "id": "<A user UUID>", "email": "<A test email>", "password": "<A test password>" },
  "b": { "id": "<B user UUID>", "email": "<B test email>", "password": "<B test password>" }
}
```

Run the production build with `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` set to the local publishable key. Then set `E2E_AUTH_LOCAL=1` and `E2E_AUTH_CREDENTIALS_FILE` to the absolute path of that JSON file and run `npm run test:e2e:auth`. The test refuses a nonlocal API, creates uniquely named purchase and evidence records, and cleans up those records even when it fails. Missing opt-in settings produce an explicit skip. Dispose of the local test stack with `supabase stop --no-backup` when finished; do not use ordinary user data or production credentials.
