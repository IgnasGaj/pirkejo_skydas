create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_name text not null check (length(trim(product_name)) between 1 and 200),
  seller_name text not null check (length(trim(seller_name)) between 1 and 200),
  purchase_date date not null,
  received_date date,
  purchase_channel text not null check (purchase_channel in ('PHYSICAL_STORE', 'DISTANCE', 'UNKNOWN')),
  price_cents bigint check (price_cents >= 0),
  currency text not null default 'EUR' check (currency = 'EUR'),
  reference_number text check (length(reference_number) <= 200),
  notes text check (length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint received_date_valid check (received_date is null or (purchase_channel = 'DISTANCE' and received_date >= purchase_date)),
  unique (id, user_id)
);

create index purchases_user_created_idx on public.purchases (user_id, created_at desc);

create function public.set_purchase_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger purchases_updated_at before update on public.purchases
  for each row execute function public.set_purchase_updated_at();

create table public.purchase_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  purchase_id uuid not null,
  document_type text not null check (document_type in ('RECEIPT', 'INVOICE', 'ORDER_CONFIRMATION', 'WARRANTY_DOCUMENT', 'OTHER')),
  original_filename text not null check (length(original_filename) between 1 and 255),
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 15728640),
  created_at timestamptz not null default now(),
  constraint purchase_documents_owned_purchase foreign key (purchase_id, user_id)
    references public.purchases (id, user_id) on delete cascade,
  constraint storage_path_owned check (storage_path like user_id::text || '/' || purchase_id::text || '/%')
);

create index purchase_documents_purchase_idx on public.purchase_documents (purchase_id, created_at desc);
create index purchase_documents_user_idx on public.purchase_documents (user_id);

alter table public.purchases enable row level security;
alter table public.purchase_documents enable row level security;

create policy "Read own purchases" on public.purchases for select to authenticated using (user_id = (select auth.uid()));
create policy "Create own purchases" on public.purchases for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Update own purchases" on public.purchases for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Delete own purchases" on public.purchases for delete to authenticated using (user_id = (select auth.uid()));

create policy "Read own purchase documents" on public.purchase_documents for select to authenticated using (user_id = (select auth.uid()));
create policy "Create own purchase documents" on public.purchase_documents for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Update own purchase documents" on public.purchase_documents for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Delete own purchase documents" on public.purchase_documents for delete to authenticated using (user_id = (select auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('purchase-evidence', 'purchase-evidence', false, 15728640,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Read own purchase evidence" on storage.objects for select to authenticated
using (bucket_id = 'purchase-evidence' and owner_id = (select auth.uid()::text)
  and exists (select 1 from public.purchases p where p.id::text = (storage.foldername(name))[2]
    and p.user_id = (select auth.uid()) and (storage.foldername(name))[1] = p.user_id::text));
create policy "Upload own purchase evidence" on storage.objects for insert to authenticated
with check (bucket_id = 'purchase-evidence' and owner_id = (select auth.uid()::text)
  and exists (select 1 from public.purchases p where p.id::text = (storage.foldername(name))[2]
    and p.user_id = (select auth.uid()) and (storage.foldername(name))[1] = p.user_id::text));
create policy "Delete own purchase evidence" on storage.objects for delete to authenticated
using (bucket_id = 'purchase-evidence' and owner_id = (select auth.uid()::text)
  and exists (select 1 from public.purchases p where p.id::text = (storage.foldername(name))[2]
    and p.user_id = (select auth.uid()) and (storage.foldername(name))[1] = p.user_id::text));
