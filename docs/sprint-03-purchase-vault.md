# PIRKĖJO SKYDAS — SPRINT 03

## PERSISTENT PURCHASE VAULT

You are continuing an existing Lithuanian consumer-rights application called **Pirkėjo Skydas**.

Sprint 01 implemented the return decision flow.

Sprint 01.1 hardened legal product classification.

Sprint 02 implemented the defective-product / warranty flow at:

`/defective-product`

The existing application already contains deterministic legal decision engines and must continue to work.

For this sprint, build only:

# “MANO PIRKINIAI” — A PERSISTENT PURCHASE VAULT

This sprint introduces real persistence, basic user accounts, purchase records, and private storage for receipts / proof-of-purchase files.

The purpose is to create the durable data layer that later sprints will use.

Sprint 04 will add receipt scanning / OCR.

Do NOT implement OCR in Sprint 03.

---

# 1. CORE PRODUCT GOAL

After Sprint 03, a user must be able to:

1. create an account;
2. sign in;
3. add a purchase manually;
4. see all saved purchases;
5. open one purchase;
6. edit it;
7. delete it;
8. upload a receipt or other proof-of-purchase file;
9. privately view/download that file later;
10. remove an uploaded file;
11. start the existing return flow from a saved purchase;
12. start the existing defective-product flow from a saved purchase.

This is the first sprint where **Pirkėjo Skydas remembers the user's data between sessions**.

---

# 2. IMPORTANT CONTINUITY RULES

Before making changes:

- inspect the existing codebase;
- preserve the current architecture where it is already good;
- preserve Sprint 01 / 01.1 behavior;
- preserve Sprint 02 behavior;
- do not rewrite working legal engines unnecessarily;
- do not replace existing UI patterns just to introduce a new style;
- do not reset or reinitialize the project;
- do not delete working tests;
- do not weaken existing legal uncertainty handling.

Existing legal flows must still work for users who are **not signed in**.

Authentication is required only for persistent purchase-vault functionality.

The app must not become account-gated globally.

---

# 3. TECH STACK

Continue using the project's existing stack:

- Next.js
- App Router
- TypeScript
- React
- Tailwind CSS
- shadcn/ui
- Zod
- Vitest

Add:

- Supabase Postgres
- Supabase Auth
- Supabase Storage
- `@supabase/supabase-js`
- the currently supported Supabase SSR integration for Next.js

Use the current official Supabase SSR approach compatible with the project's installed Next.js version.

Do not copy outdated middleware/auth examples if the installed framework version uses a newer convention.

Do NOT add:

- Prisma;
- Drizzle;
- another database;
- another authentication provider;
- another storage provider.

Supabase is the persistence platform for this project.

---

# 4. PRODUCT LANGUAGE

User-facing UI: **Lithuanian**.

Code, interfaces, tests, migrations, developer comments and developer documentation: **English**.

Tone:

- simple;
- friendly;
- calm;
- practical;
- not overly legal;
- not corporate;
- not AI-like.

---

# 5. SUPABASE ENVIRONMENT

Add an example environment file.

Required public variables:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

Use the current Supabase publishable-key approach.

Do not commit real credentials.

Do not require a Supabase service-role key in the web application.

The browser must never receive elevated credentials.

Add clear setup instructions to the README or a dedicated setup document.

---

# 6. SUPABASE CLIENT STRUCTURE

Create clearly separated Supabase utilities for:

- browser/client usage;
- server usage;
- authenticated request/session refresh.

Use cookie-based SSR authentication.

Authorization decisions must use a server-verified authenticated identity.

Do not trust a user ID coming from:

- form fields;
- URL query parameters;
- client state;
- local storage.

The authenticated user ID must come from Supabase Auth.

---

# 7. AUTHENTICATION SCOPE

Implement only basic email/password authentication.

Required functionality:

- register;
- sign in;
- sign out;
- handle email confirmation state correctly if confirmation is enabled;
- protect purchase-vault routes.

Suggested route:

`/login`

The page may contain two states/tabs:

- **Prisijungti**
- **Sukurti paskyrą**

Lithuanian UI examples:

## Prisijungti

Fields:

- El. paštas
- Slaptažodis

CTA:

**Prisijungti**

Registration:

## Sukurti paskyrą

Fields:

- El. paštas
- Slaptažodis
- Pakartokite slaptažodį

CTA:

**Sukurti paskyrą**

If email confirmation is required, show a clear state such as:

## Patikrinkite el. paštą

Išsiuntėme paskyros patvirtinimo nuorodą.

Do not build during this sprint:

- Google login;
- Apple login;
- phone authentication;
- password reset;
- MFA;
- profile page;
- avatars;
- social features.

---

# 8. AUTHORIZATION BOUNDARY

Only these routes require authentication:

```text
/purchases
/purchases/new
/purchases/[id]
/purchases/[id]/edit
```

Existing consumer-rights flows must remain accessible without authentication:

```text
/returns
/defective-product
```

If an unauthenticated user tries to open a purchase route:

- redirect to `/login`;
- preserve a safe return destination where practical.

Do not expose whether another user's purchase ID exists.

Unauthorized access to another user's purchase should behave like a missing/not-accessible purchase.

---

# 9. MVP PURCHASE MODEL

For Sprint 03:

**one purchase record represents one product that the user may later need consumer-rights help with.**

Do not model full receipt line-item accounting yet.

Do not build an expense tracker.

Create a `purchases` table with fields equivalent to:

```ts
type Purchase = {
  id: string;
  userId: string;

  productName: string;
  sellerName: string;

  purchaseDate: string;
  receivedDate: string | null;

  purchaseChannel:
    | "PHYSICAL_STORE"
    | "DISTANCE"
    | "UNKNOWN";

  priceCents: number | null;
  currency: "EUR";

  referenceNumber: string | null;
  notes: string | null;

  createdAt: string;
  updatedAt: string;
};
```

Database column names may use snake_case.

Required database fields:

```text
id
user_id
product_name
seller_name
purchase_date
received_date
purchase_channel
price_cents
currency
reference_number
notes
created_at
updated_at
```

Rules:

- `id` = UUID;
- `user_id` references Supabase Auth user;
- `product_name` required;
- `seller_name` required;
- `purchase_date` required;
- `received_date` optional;
- `price_cents` optional;
- currency defaults to `EUR`;
- `reference_number` optional;
- `notes` optional.

Do not add legal conclusions to this table.

Do not store values such as:

- "returnable";
- "warranty valid";
- "refund allowed";
- "seller must replace";
- "legal result".

Those belong to deterministic engines, not persisted purchase data.

---

# 10. PURCHASE CHANNEL

Use the same conceptual values already used by the legal flows:

```ts
type PurchaseChannel =
  | "PHYSICAL_STORE"
  | "DISTANCE"
  | "UNKNOWN";
```

Lithuanian UI:

- Fizinėje parduotuvėje
- Internetu
- Nežinau

Do not silently map `UNKNOWN` to either physical or distance rules.

---

# 11. RECEIVED DATE

`received_date` is optional.

Purpose:

For distance purchases, the date the item was received can later be relevant to the return flow.

UI:

## Kada gavote prekę?

Show this field when the purchase channel is:

`DISTANCE`

Allow it to remain empty.

Do not invent a received date from the purchase date.

Do not use it to make a legal decision inside the purchase vault.

---

# 12. PRICE STORAGE

Store money as integer cents.

Examples:

```text
19.99 EUR -> 1999
399.00 EUR -> 39900
```

Do not store floating-point money values.

UI may accept:

```text
399,99
```

or:

```text
399.99
```

Normalize safely to cents.

Reject malformed values.

Currency for Sprint 03:

`EUR`

Do not build multi-currency conversion.

---

# 13. PURCHASE DOCUMENT MODEL

Create a second table for uploaded purchase evidence.

Equivalent TypeScript shape:

```ts
type PurchaseDocument = {
  id: string;
  userId: string;
  purchaseId: string;

  documentType:
    | "RECEIPT"
    | "INVOICE"
    | "ORDER_CONFIRMATION"
    | "WARRANTY_DOCUMENT"
    | "OTHER";

  originalFilename: string;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;

  createdAt: string;
};
```

Required database fields:

```text
id
user_id
purchase_id
document_type
original_filename
storage_path
mime_type
size_bytes
created_at
```

`purchase_id` must cascade when a purchase database row is removed.

However:

**database cascade does not automatically clean Supabase Storage objects.**

Application deletion logic must explicitly remove storage objects.

---

# 14. DOCUMENT TYPES

Lithuanian UI:

```text
Čekis
Sąskaita faktūra
Užsakymo patvirtinimas
Garantijos dokumentas
Kitas pirkimo įrodymas
```

Internal mapping:

```ts
RECEIPT
INVOICE
ORDER_CONFIRMATION
WARRANTY_DOCUMENT
OTHER
```

Default when uploading from a purchase detail page:

`RECEIPT`

but allow the user to change it.

---

# 15. SUPABASE STORAGE

Create a private bucket:

```text
purchase-evidence
```

The bucket MUST NOT be public.

Receipts and purchase documents can contain personal information.

Use private access.

A user must only be able to access files belonging to that authenticated user.

Suggested object path format:

```text
{userId}/{purchaseId}/{randomUuid}.{extension}
```

Do not use the original filename as the storage object path.

Preserve the original filename only as metadata in the database.

Do not expose permanent public URLs.

For viewing/downloading, use authenticated access or short-lived signed URLs.

---

# 16. FILE TYPES

Accept these file types for Sprint 03:

```text
image/jpeg
image/png
image/webp
image/heic
image/heif
application/pdf
```

The application should also validate extension/type reasonably rather than trusting only the browser-provided filename.

Maximum file size:

```text
15 MB per file
```

Show a Lithuanian error if the file is too large or unsupported.

Example:

**Failas per didelis. Didžiausias leidžiamas dydis – 15 MB.**

No image compression is required in this sprint.

No OCR is required.

HEIC/HEIF may be stored even if the browser cannot render a preview.

In that case show a generic file card instead of breaking.

---

# 17. STORAGE FAILURE SAFETY

Treat file + database operations carefully.

If:

1. the file uploads successfully to Storage;
2. but inserting `purchase_documents` fails;

then remove the uploaded Storage object as compensation.

Do not leave orphan files silently.

When deleting a document:

1. remove the Storage object;
2. delete its database row;
3. surface an error if cleanup fails.

When deleting a purchase:

1. load all owned document storage paths;
2. remove those objects from Storage;
3. delete the purchase;
4. allow database cascade to remove document metadata.

Do not proceed with purchase deletion if storage cleanup fails before the database delete.

No silent data loss.

---

# 18. ROW LEVEL SECURITY

Enable Row Level Security for:

```text
purchases
purchase_documents
```

A user may only:

- SELECT their own rows;
- INSERT rows for themselves;
- UPDATE their own rows;
- DELETE their own rows.

Policy ownership must be derived from:

```sql
auth.uid()
```

Do not allow the client to choose an arbitrary `user_id`.

Also configure Storage access policies for the private `purchase-evidence` bucket.

Users must only be able to:

- upload their own objects;
- read their own objects;
- delete their own objects.

Do not create permissive policies such as:

```sql
using (true)
```

for private user evidence.

Do not use the service-role key to bypass RLS from the application.

---

# 19. DATABASE MIGRATIONS

Create reproducible SQL migrations under the repository.

Example structure:

```text
supabase/
└─ migrations/
   └─ <timestamp>_purchase_vault.sql
```

The migration must create:

- required tables;
- indexes;
- constraints;
- `updated_at` behavior;
- RLS;
- table policies;
- private storage bucket if appropriate;
- storage policies where appropriate.

Do not rely on undocumented manual Dashboard clicks for core schema setup.

If one small Supabase Dashboard configuration step is unavoidable, document it clearly.

---

# 20. VALIDATION

Use Zod for user input.

Create schemas for at least:

- registration;
- login;
- create purchase;
- edit purchase;
- upload document metadata.

Validation should exist at the server boundary.

Client validation may improve UX, but server validation is required.

Do not trust client-only validation.

---

# 21. PURCHASE DATA ACCESS LAYER

Do not scatter raw Supabase purchase queries across React components.

Create a small purchase data-access layer.

Suggested responsibilities:

```ts
listPurchases()
getPurchaseById()
createPurchase()
updatePurchase()
deletePurchase()

listPurchaseDocuments()
createPurchaseDocument()
deletePurchaseDocument()
createPurchaseDocumentAccessUrl()
```

Exact filenames are flexible.

The important rule:

**React components render UI; persistence logic belongs in dedicated server/data modules.**

Keep legal engines separate from persistence code.

---

# 22. ROUTE — PURCHASE LIST

Create:

`/purchases`

Lithuanian title:

# Mano pirkiniai

Primary CTA:

**Pridėti pirkinį**

Show newest purchases first.

Each card should include, where available:

- product name;
- seller;
- purchase date;
- price;
- purchase channel;
- evidence status.

Evidence status examples:

If at least one document exists:

**Pirkimo įrodymas išsaugotas**

If no document exists:

**Pirkimo įrodymas nepridėtas**

Do not call a document "valid" or "legally sufficient".

The vault stores evidence.

It does not legally certify it.

---

# 23. EMPTY STATE

If the user has no purchases:

## Čia bus jūsų pirkiniai

Išsaugokite pirkinį ir jo pirkimo įrodymą, kad prireikus viską rastumėte vienoje vietoje.

CTA:

**Pridėti pirmą pirkinį**

Keep the empty state simple.

---

# 24. ROUTE — ADD PURCHASE

Create:

`/purchases/new`

Title:

# Pridėti pirkinį

Required fields:

## Ką pirkote?

Input example:

`Sony WH-1000XM6`

Required.

---

## Pardavėjas

Input example:

`Topo Centras`

Required.

---

## Kada pirkote?

Date input.

Required.

Future purchase dates must be rejected.

---

## Kaip pirkote?

Options:

- Fizinėje parduotuvėje
- Internetu
- Nežinau

Required.

---

If Internetu:

## Kada gavote prekę?

Optional date.

If provided:

- it must not be before the purchase date;
- it must not be in the future.

---

## Kaina

Optional.

Display EUR.

---

## Užsakymo / čekio numeris

Optional.

---

## Pastabos

Optional textarea.

Example:

`Pirkta su 3 metų komercine garantija.`

Important:

Do not interpret free-text notes as legal facts.

---

Primary CTA:

**Išsaugoti pirkinį**

After successful creation:

redirect to:

`/purchases/[id]`

and show a success state/toast:

**Pirkinys išsaugotas.**

---

# 25. PURCHASE DETAIL

Create:

`/purchases/[id]`

Show:

# {productName}

Then structured details:

- Pardavėjas
- Pirkimo data
- Gavau prekę
- Pirkimo būdas
- Kaina
- Užsakymo / čekio numeris
- Pastabos

Only show optional rows when they contain data.

Actions:

**Redaguoti**

**Ištrinti**

---

# 26. PURCHASE DETAIL — EVIDENCE SECTION

On the purchase detail page show:

# Pirkimo įrodymai

If no documents:

**Dar nepridėjote čekio ar kito pirkimo įrodymo.**

CTA:

**Pridėti pirkimo įrodymą**

Upload UI should let the user choose:

- document type;
- file.

After success:

**Failas išsaugotas.**

Each saved document card should show:

- type;
- original filename;
- file size;
- upload date.

Actions:

- **Peržiūrėti**
- **Atsisiųsti**
- **Pašalinti**

For file types that cannot be previewed directly:

show download/open functionality without a broken preview.

---

# 27. RECEIPT SAVING VS RECEIPT SCANNING

This distinction is critical.

Sprint 03:

```text
User uploads receipt
        ↓
file is stored privately
        ↓
document metadata is stored
```

Sprint 04:

```text
User uploads receipt
        ↓
OCR / vision reads receipt
        ↓
fields are extracted
        ↓
user reviews extracted values
        ↓
purchase can be populated automatically
```

Therefore:

Sprint 03 MUST save receipts.

Sprint 03 MUST NOT scan receipts.

No OCR libraries.

No vision API.

No AI extraction.

No fake extracted fields.

---

# 28. PURCHASE DETAIL — “TURIU PROBLEMĄ”

A saved purchase should connect to the legal workflows already built.

Add a section:

# Reikia pagalbos su šiuo pirkiniu?

Buttons:

**Ar galiu grąžinti?**

Target:

```text
/returns?purchaseId={purchaseId}
```

Button:

**Prekė sugedo**

Target:

```text
/defective-product?purchaseId={purchaseId}
```

Do not build new legal rules here.

---

# 29. PURCHASE CONTEXT IN LEGAL FLOWS

Update the existing `/returns` and `/defective-product` flows so they can safely receive an optional:

```text
purchaseId
```

If:

- a user is signed in;
- the purchase exists;
- the purchase belongs to that user;

the flow may load purchase context.

Show a small context card such as:

```text
Sony WH-1000XM6
Topo Centras · 2026-09-14

Naudojamas išsaugotas pirkinys
```

Prefill only factual fields with identical meaning.

Examples:

- product name;
- seller name;
- purchase date;
- received date;
- purchase channel.

Important rules:

- never infer a legal answer;
- never infer seller type;
- never infer product legal category;
- never infer whether a product is defective;
- never infer whether packaging was opened;
- never skip a legal question unless the existing flow explicitly supports a safe factual prefill;
- the user must be able to change prefilled answers.

If the purchase cannot be accessed:

- ignore the purchase context;
- do not leak existence;
- allow the legal flow to continue normally.

---

# 30. EDIT PURCHASE

Create:

`/purchases/[id]/edit`

Use the same schema as creation.

Prepopulate existing values.

CTA:

**Išsaugoti pakeitimus**

After success:

redirect to the purchase detail page.

Show:

**Pakeitimai išsaugoti.**

A user must not be able to edit another user's purchase.

---

# 31. DELETE PURCHASE

On purchase detail:

**Ištrinti pirkinį**

Require explicit confirmation.

Lithuanian confirmation:

## Ištrinti pirkinį?

Bus pašalinti ir prie šio pirkinio išsaugoti failai. Šio veiksmo atšaukti nepavyks.

Buttons:

- **Atšaukti**
- **Ištrinti**

After successful deletion:

redirect to:

`/purchases`

Show:

**Pirkinys ištrintas.**

---

# 32. HOME SCREEN INTEGRATION

Preserve the existing home screen and legal actions.

Add or activate a clear purchase section.

For a signed-in user:

# Mano pirkiniai

Show up to 3 most recent purchases.

Actions:

**Pridėti pirkinį**

**Visi pirkiniai**

If no purchases, show the purchase-vault empty state.

For a signed-out user:

show a lightweight block:

# Mano pirkiniai

Išsaugokite čekius ir pirkimo informaciją vienoje vietoje.

CTA:

**Prisijungti**

Do not hide the existing return or defective-product flows from signed-out users.

---

# 33. EXISTING HOME ACTIONS

Keep these concepts distinct:

- Ar galiu grąžinti?
- Prekė sugedo
- Nerandu čekio
- Pardavėjas nepadeda

`Ar galiu grąžinti?` remains active.

`Prekė sugedo` remains active and routes to:

`/defective-product`

`Nerandu čekio` remains a future consumer-rights/help flow unless it has already been implemented.

`Pardavėjas nepadeda` remains future functionality unless already implemented.

Do not pretend Sprint 03 implements those legal flows merely because receipt storage now exists.

---

# 34. LOADING / ERROR UX

Do not expose raw Supabase errors to normal users.

User-facing Lithuanian errors should be understandable.

Examples:

**Nepavyko išsaugoti pirkinio. Bandykite dar kartą.**

**Nepavyko įkelti failo. Bandykite dar kartą.**

**Šis failo formatas nepalaikomas.**

**Pirkinio rasti nepavyko.**

Log enough technical detail for development, but do not leak:

- SQL;
- access tokens;
- secrets;
- internal stack traces.

---

# 35. SECURITY / PRIVACY BASELINE

Purchase records and receipts are private user data.

Required:

- Row Level Security;
- private Storage bucket;
- authenticated ownership checks;
- no public receipt URLs;
- no service-role key in browser code;
- no secrets committed;
- no arbitrary client-provided ownership;
- no cross-user access.

Avoid unnecessary personal data collection.

Do not ask for:

- personal code;
- home address;
- phone number;
- payment card number.

They are not required for this sprint.

---

# 36. ACCESSIBILITY / MOBILE UX

Continue the existing mobile-first direction.

Forms must work well on a phone.

Requirements:

- associated labels;
- visible focus states;
- touch-friendly buttons;
- readable error messages;
- no horizontal scrolling;
- no tiny icon-only destructive actions;
- confirmation for deletion.

Receipt upload must work with mobile file/photo selection.

Do not require desktop drag-and-drop.

Drag-and-drop may exist as enhancement, but a normal file picker is required.

---

# 37. TESTING

Keep all existing Sprint 01 / 01.1 / 02 tests passing.

Add unit tests for new pure helpers and validation.

Minimum cases:

### Test 1

Create-purchase schema accepts valid required values.

### Test 2

Create-purchase schema rejects empty product name.

### Test 3

Create-purchase schema rejects empty seller name.

### Test 4

Future purchase date is rejected.

### Test 5

Received date before purchase date is rejected.

### Test 6

Future received date is rejected.

### Test 7

Valid comma-decimal EUR input converts correctly to cents.

Example:

```text
399,99 -> 39999
```

### Test 8

Malformed price input is rejected.

### Test 9

Unsupported document MIME type is rejected.

### Test 10

Document larger than 15 MB is rejected.

### Test 11

Purchase-channel values remain limited to:

```text
PHYSICAL_STORE
DISTANCE
UNKNOWN
```

### Test 12

A legal flow with no `purchaseId` behaves exactly as before.

### Test 13

A legal flow never treats inaccessible purchase context as valid input.

### Test 14

A failed document database insert triggers storage cleanup in the document service logic.

Mock external Supabase calls where appropriate.

If the project has or can reliably use local Supabase integration tests without excessive setup, additional RLS tests are welcome.

Do not make local Supabase/Docker a mandatory prerequisite merely to run the ordinary unit test suite unless the project already uses it.

---

# 38. DEVELOPMENT CHECKLIST FOR RLS

Because unit tests alone cannot prove production RLS correctness, manually verify policies against these cases:

```text
User A can read User A purchase       -> YES
User A can update User A purchase     -> YES
User A can delete User A purchase     -> YES

User A can read User B purchase       -> NO
User A can update User B purchase     -> NO
User A can delete User B purchase     -> NO

User A can read User A document       -> YES
User A can read User B document       -> NO

User A can read User A storage object -> YES
User A can read User B storage object -> NO
```

Document the verification in the Sprint 03 completion summary.

---

# 39. DO NOT BUILD YET

Absolutely do not implement during Sprint 03:

- OCR;
- receipt text extraction;
- vision models;
- LLM purchase extraction;
- AI legal decisions;
- complaint generator;
- complaint PDF generation;
- seller email sending;
- seller response tracking;
- 14-day complaint-response timer;
- case timeline;
- VVTAT submission package;
- VTIS integration;
- push notifications;
- warranty reminders;
- merchant integration;
- automatic retailer receipt delivery;
- email receipt import;
- bank integration;
- payment system;
- subscriptions;
- admin panel;
- native mobile app.

Do not expand the sprint because the database now exists.

---

# 40. ARCHITECTURAL GUARDRAILS

Keep these boundaries explicit:

```text
purchase data
    ↓
database/storage

legal answers
    ↓
deterministic rule engines

receipt extraction
    ↓
future Sprint 04

complaint generation
    ↓
future Sprint 05
```

Never move legal decision-making into:

- Supabase;
- database triggers;
- React components;
- OCR;
- AI.

The existing deterministic engines remain the authority for app decisions.

---

# 41. SOURCE CONTROL / REPOSITORY REQUIREMENTS

Continue working in the existing project.

Target repository:

`https://github.com/IgnasGaj/pirkejo_skydas.git`

Do not create a new repository.

Do not replace project history.

Before implementation:

- inspect the current repository;
- pull/rebase as appropriate;
- preserve existing Sprint 01 / 01.1 / 02 work.

Add this specification to:

```text
docs/sprint-03-purchase-vault.md
```

When implementation is complete:

1. run all tests;
2. run TypeScript checks;
3. run lint if configured;
4. run the production build;
5. fix failures;
6. review `git diff`;
7. ensure no secrets are tracked;
8. commit the completed Sprint 03 work;
9. push it to the repository.

Use a normal project commit message, for example:

```text
feat: add persistent purchase vault
```

The repository must contain **no attribution or trace that Codex performed the implementation**.

Do not add:

- "Generated by Codex";
- "Created with Codex";
- AI attribution comments;
- Codex-specific documentation;
- Codex-specific branch names;
- Codex-specific commit messages;
- automated co-author lines identifying Codex;
- unnecessary agent scratch files.

Code and documentation should look like normal project work.

---

# 42. REQUIRED SETUP DOCUMENTATION

Because Sprint 03 introduces Supabase, document exactly what the developer must do to run the project.

Include:

1. install dependencies;
2. create/configure a Supabase project;
3. obtain project URL;
4. obtain publishable key;
5. set `.env.local`;
6. apply database migrations;
7. confirm Auth email/password provider configuration;
8. confirm callback/redirect URL configuration if required;
9. run development server;
10. run tests;
11. run build.

Do not include real secrets.

---

# 43. DEFINITION OF DONE

Sprint 03 is complete when:

1. Existing Sprint 01 / 01.1 return functionality still works.
2. Existing Sprint 02 defective-product functionality still works.
3. Legal flows remain usable without signing in.
4. Users can register.
5. Users can sign in.
6. Users can sign out.
7. Purchase routes are protected.
8. Signed-in users can create a purchase.
9. Purchases persist in Supabase Postgres.
10. Users can list their own purchases.
11. Users can view one of their purchases.
12. Users can edit their purchase.
13. Users can delete their purchase.
14. Users cannot access another user's purchase.
15. Users can upload receipt/evidence files.
16. Evidence files are stored in a private Supabase Storage bucket.
17. Users can view/download their own evidence.
18. Users can remove evidence.
19. Users cannot access another user's evidence.
20. Upload/database failure cleanup is handled.
21. Purchase deletion removes associated Storage objects.
22. Purchase detail links to `/returns`.
23. Purchase detail links to `/defective-product`.
24. Existing legal flows can safely accept optional purchase context.
25. No legal answer is inferred from stored purchase metadata.
26. No OCR is implemented.
27. No AI is implemented.
28. No complaint generator is implemented.
29. `.env.example` exists without real credentials.
30. Reproducible Supabase migrations exist.
31. Setup instructions exist.
32. All existing and new tests pass.
33. TypeScript checks pass.
34. Production build passes.
35. No secrets are committed.
36. Sprint 03 spec exists at `docs/sprint-03-purchase-vault.md`.
37. Completed code is committed and pushed to `https://github.com/IgnasGaj/pirkejo_skydas.git`.
38. The repository contains no Codex attribution/traces.

---

# 44. COMPLETION REPORT

When finished, provide a concise completion report containing:

## Implemented

Short list of functionality created.

## Database

- migration filename;
- tables created;
- RLS summary.

## Storage

- bucket name;
- allowed file types;
- access-control summary.

## Auth

- sign-up/sign-in behavior;
- route protection summary.

## Tests

Report:

```text
npm test
typecheck
lint
npm run build
```

with pass/fail status.

## Manual setup required

List only steps that actually require the developer's Supabase account/dashboard.

## Manual verification

Confirm the cross-user RLS checks performed.

## Git

Report:

- branch;
- commit hash;
- commit message;
- push status.

Do not include AI/Codex attribution.

---

# 45. FINAL IMPLEMENTATION PRINCIPLE

Sprint 03 is not an expense tracker.

Sprint 03 is the persistence layer for the Pirkėjo Skydas workflow:

```text
I bought something
        ↓
I saved the purchase
        ↓
I saved the proof
        ↓
something happens later
        ↓
Pirkėjo Skydas already has the facts
        ↓
the correct legal workflow can begin
```

Build that foundation cleanly.

Do not expand scope beyond this specification.
