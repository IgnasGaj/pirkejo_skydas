# Pirkėjo Skydas

A Lithuanian consumer-rights app with return and defective-product decision flows and a private purchase vault.

## Local setup

1. Install dependencies: `npm ci`.
2. Create a Supabase project. Copy its Project URL and publishable key from the project's Connect or API settings page.
3. Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. The web app does not need a service-role key.
4. Apply `supabase/migrations/20261001000000_purchase_vault.sql` to the project. You can use the Supabase CLI (`supabase link` followed by `supabase db push`) or run the migration in the SQL Editor. The migration creates both tables, indexes, constraints, RLS policies, and the private Storage bucket and policies.
5. In Authentication → Providers, enable Email/password. Choose whether email confirmation is required. If it is, configure the confirmation email template for SSR with a link to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email` instead of the default confirmation URL. Set the Authentication site URL to your app origin (for local development, `http://localhost:3000`) and allow the app's `/auth/confirm` URL in redirect URLs. Repeat for the production origin when deploying.
6. Run `npm run dev` and open `http://localhost:3000`.

The existing `/returns` and `/defective-product` flows work without Supabase configuration or an account. The purchase vault requires the Supabase project and environment variables.

## Checks

Run `npm test`, `npm run typecheck`, and `npm run build`. No lint command is configured.

## Privacy verification

After applying the migration, use two separate test accounts in the configured Supabase project. Confirm that account A can read, edit, and delete its own purchase, document, and Storage object, and that account B cannot read, edit, or delete those resources. Repeat with B's own resources. The app's routes and RLS policies both scope access to the authenticated user. These live checks require a configured Supabase project; unit tests do not substitute for them.
