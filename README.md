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

## Privacy verification

Use a disposable, migrated local or dedicated test Supabase project and two ordinary accounts, A and B. Use only the public URL and publishable key; never use a service-role key for the verification. Do not run destructive checks against ordinary user data.

1. Sign in as A and create a uniquely named test purchase. Upload a synthetic valid PDF or PNG with no personal data. Record the purchase ID, document ID, and Storage path. Verify A can read and update the purchase and metadata, and can read its Storage object and receive a signed download redirect from `/api/purchases/<purchase-id>/documents/<document-id>/access`.
2. Sign in as B with a separate browser session. Query A's purchase and metadata by ID with the public Supabase client. Try to update and delete each row, and try inserting document metadata that references A's purchase. Check both errors and persisted state: an RLS-filtered mutation can return no error while affecting zero rows. A's rows must remain unchanged.
3. As B, try to read, upload to, and delete A's Storage path. Request A's document access endpoint in B's browser. All attempts must be denied or return no accessible row; the endpoint must issue no signed URL.
4. Repeat direct purchase, metadata, and Storage reads without a session; they must be denied. Verify B can perform the same allowed operations on B's own test purchase and evidence.
5. Sign back in as A, verify A's records are still intact, then delete only the test-created evidence and purchase. Clean up B's test records as well. Inspect the database and Storage bucket to confirm cleanup.

An issued signed URL is a temporary bearer link and generally remains usable until expiry; test unauthorized issuance and direct Storage access separately. Unit and browser smoke tests do not prove live RLS. Authenticated lifecycle automation is deferred until a dedicated test backend and credentials outside Git are available.
