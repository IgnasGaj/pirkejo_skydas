create table public.complaints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  purchase_id uuid not null,
  family text not null check (family in ('DEFECTIVE_PRODUCT','DISTANCE_WITHDRAWAL','PHYSICAL_RETURN_REQUEST')),
  request_id uuid not null,
  answers jsonb not null check (jsonb_typeof(answers) = 'object' and octet_length(answers::text) <= 12000),
  facts jsonb not null check (jsonb_typeof(facts) = 'object' and octet_length(facts::text) <= 16000),
  remedy text not null,
  purchase_updated_at timestamptz not null,
  template_version text not null,
  source_version text not null,
  draft_version integer not null default 1 check (draft_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id, purchase_id),
  unique (user_id, request_id),
  foreign key (purchase_id, user_id) references public.purchases (id, user_id) on delete cascade
);

create table public.complaint_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  purchase_id uuid not null,
  complaint_id uuid not null,
  version_no integer not null check (version_no > 0),
  request_id uuid not null,
  document_date date not null,
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object' and octet_length(snapshot::text) <= 32000),
  sections jsonb not null check (jsonb_typeof(sections) = 'array' and octet_length(sections::text) <= 24000),
  plain_text text not null check (length(plain_text) between 1 and 24000),
  template_version text not null,
  source_version text not null,
  generated_at timestamptz not null default now(),
  unique (complaint_id, version_no),
  unique (complaint_id, request_id),
  foreign key (complaint_id, user_id, purchase_id) references public.complaints (id, user_id, purchase_id) on delete cascade
);

create index complaints_purchase_idx on public.complaints(purchase_id, updated_at desc);
create index complaint_versions_parent_idx on public.complaint_versions(complaint_id, version_no desc);

create function public.bump_complaint_version() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.id <> old.id or new.user_id <> old.user_id or new.purchase_id <> old.purchase_id or new.request_id <> old.request_id then
    raise exception 'Complaint identity is immutable';
  end if;
  new.draft_version := old.draft_version + 1;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
create trigger complaints_bump before update on public.complaints for each row execute function public.bump_complaint_version();

create function public.reject_complaint_version_update() returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Generated documents are immutable';
end;
$$;
create trigger complaint_versions_immutable before update on public.complaint_versions for each row execute function public.reject_complaint_version_update();

alter table public.complaints enable row level security;
alter table public.complaint_versions enable row level security;
create policy "Read own complaints" on public.complaints for select to authenticated using (user_id = (select auth.uid()));
create policy "Create own complaints" on public.complaints for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Update own complaints" on public.complaints for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Delete own complaints" on public.complaints for delete to authenticated using (user_id = (select auth.uid()));
create policy "Read own complaint versions" on public.complaint_versions for select to authenticated using (user_id = (select auth.uid()));
