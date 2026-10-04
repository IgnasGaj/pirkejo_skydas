-- Immutable, owner-scoped preparation records. Originals remain in purchase-evidence.
create table public.vvtat_packages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  purchase_id uuid not null,
  case_id uuid not null,
  complaint_version_id uuid not null,
  version_no integer not null check (version_no between 1 and 100),
  request_id uuid not null,
  request_payload jsonb not null check (jsonb_typeof(request_payload) = 'object' and octet_length(request_payload::text) <= 22000),
  case_revision integer not null check (case_revision between 0 and 500),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object' and octet_length(snapshot::text) <= 800000),
  created_at timestamptz not null default now(),
  unique (case_id, version_no),
  unique (user_id, request_id),
  unique (id, user_id, purchase_id, case_id),
  foreign key (case_id, user_id, purchase_id, complaint_version_id)
    references public.cases(id, user_id, purchase_id, complaint_version_id) on delete cascade
);
create index vvtat_packages_case_idx on public.vvtat_packages(case_id, version_no desc);
alter table public.vvtat_packages enable row level security;
create policy "Read own VVTAT preparation packages" on public.vvtat_packages
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.vvtat_packages from anon, authenticated;
grant select on public.vvtat_packages to authenticated;

create function public.reject_vvtat_package_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Preparation versions are immutable';
end;
$$;
create trigger vvtat_packages_immutable before update on public.vvtat_packages
  for each row execute function public.reject_vvtat_package_update();

create function public.create_vvtat_package(p_case_id uuid, p_expected_revision integer,
  p_request_id uuid, p_payload jsonb) returns public.vvtat_packages
language plpgsql security definer set search_path = '' as $$
declare c public.cases; v public.complaint_versions; p public.purchases;
  existing public.vvtat_packages; result public.vvtat_packages;
  selected jsonb := '[]'::jsonb; history jsonb; entry jsonb; doc public.purchase_documents;
  total_bytes bigint := 0; next_number integer; i integer := 0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_case_id is null or p_request_id is null or p_expected_revision is null or
    p_expected_revision < 0 or p_expected_revision > 500 or p_payload is null or
    jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text) > 22000 then
    raise exception 'Invalid package arguments';
  end if;
  select * into c from public.cases where id = p_case_id and user_id = auth.uid() for update;
  if not found then raise exception 'Case not found'; end if;
  select * into existing from public.vvtat_packages where user_id = auth.uid() and request_id = p_request_id;
  if found then
    if existing.case_id = p_case_id and existing.case_revision = p_expected_revision and
      existing.request_payload = p_payload then return existing; end if;
    raise exception 'Package retry differs';
  end if;
  if c.family <> 'DEFECTIVE_PRODUCT' then raise exception 'Unsupported complaint family'; end if;
  if c.revision is distinct from p_expected_revision then raise exception 'Case revision changed'; end if;
  select * into p from public.purchases where id = c.purchase_id and user_id = auth.uid() and deletion_state = 'ACTIVE' for share;
  if not found then raise exception 'Purchase unavailable'; end if;
  select * into v from public.complaint_versions where id = c.complaint_version_id and
    user_id = auth.uid() and purchase_id = c.purchase_id and complaint_id = c.complaint_id for share;
  if not found then raise exception 'Complaint version unavailable'; end if;
  if exists (select 1 from jsonb_object_keys(p_payload) k where k not in
    ('applicantName','applicantEmail','sellerName','sellerContact','disputeSummary','escalationReason',
     'requestedOutcome','outcomeChangedExplanation','routing','selected','reviewed')) then
    raise exception 'Invalid package fields'; end if;
  if p_payload->>'reviewed' is distinct from 'true' then raise exception 'Final review required'; end if;
  if jsonb_typeof(p_payload->'routing') <> 'object' or
    jsonb_typeof(p_payload->'selected') <> 'array' or jsonb_array_length(p_payload->'selected') > 20 then
    raise exception 'Invalid package selection'; end if;
  if exists (select 1 from jsonb_object_keys(p_payload->'routing') k where k not in
    ('ownGoodsDispute','professionalSeller','inLithuania','anotherBody','specialJurisdiction')) then
    raise exception 'Invalid routing fields'; end if;
  if exists (select 1 from jsonb_each_text(p_payload->'routing') f where f.value not in ('YES','NO','UNKNOWN')) then
    raise exception 'Invalid routing answer'; end if;
  if length(coalesce(p_payload->>'applicantName','')) > 120 or
    length(coalesce(p_payload->>'applicantEmail','')) > 254 or
    length(coalesce(p_payload->>'sellerName','')) > 200 or
    length(coalesce(p_payload->>'sellerContact','')) > 300 or
    length(coalesce(p_payload->>'disputeSummary','')) > 4000 or
    length(coalesce(p_payload->>'escalationReason','')) > 2000 or
    length(coalesce(p_payload->>'requestedOutcome','')) > 2000 or
    length(coalesce(p_payload->>'outcomeChangedExplanation','')) > 1000 then
    raise exception 'Package text too long'; end if;
  for entry in select value from jsonb_array_elements(p_payload->'selected') loop
    if jsonb_typeof(entry) <> 'object' or
      (select count(*) from jsonb_object_keys(entry) k where k not in ('id','purpose')) > 0 or
      coalesce(entry->>'purpose','') not in ('TRANSACTION','SUBMISSION','CORRESPONDENCE','SERVICE','OTHER') or
      (entry->>'id') is null then raise exception 'Invalid selected evidence'; end if;
    if exists(select 1 from jsonb_array_elements(selected) s where s->>'id' = entry->>'id') then
      raise exception 'Duplicate selected evidence'; end if;
    select * into doc from public.purchase_documents where id = (entry->>'id')::uuid and
      user_id = auth.uid() and purchase_id = c.purchase_id and upload_state = 'READY' for share;
    if not found or doc.content_sha256 is null then raise exception 'Selected evidence unavailable'; end if;
    total_bytes := total_bytes + doc.size_bytes;
    if total_bytes > 52428800 then raise exception 'Selected evidence too large'; end if;
    i := i + 1;
    selected := selected || jsonb_build_array(jsonb_build_object('id',doc.id,'purpose',entry->>'purpose',
      'ordinal',i,'filename',doc.original_filename,'documentType',doc.document_type,
      'mimeType',doc.mime_type,'sizeBytes',doc.size_bytes,'sha256',doc.content_sha256));
  end loop;
  select coalesce(jsonb_agg(to_jsonb(e) - 'result_snapshot' order by e.revision), '[]'::jsonb)
    into history from public.case_events e where e.case_id = c.id and e.user_id = auth.uid();
  if octet_length(history::text) > 100000 then raise exception 'Case history too large'; end if;
  select coalesce(max(version_no),0) + 1 into next_number from public.vvtat_packages where case_id = c.id;
  if next_number > 100 then raise exception 'Package version limit reached'; end if;
  insert into public.vvtat_packages(user_id,purchase_id,case_id,complaint_version_id,version_no,
    request_id,request_payload,case_revision,snapshot)
  values(auth.uid(),c.purchase_id,c.id,v.id,next_number,p_request_id,p_payload,c.revision,
    jsonb_build_object('case',to_jsonb(c),'purchase',to_jsonb(p),'complaintVersion',
      jsonb_build_object('id',v.id,'versionNo',v.version_no,'generatedAt',v.generated_at,
        'documentDate',v.document_date,'snapshot',v.snapshot,'sections',v.sections,
        'plainText',v.plain_text,'templateVersion',v.template_version,'sourceVersion',v.source_version),
      'events',history,'selected',selected,'sourceVersion','2026-10-04',
      'ruleVersion',c.deadline_rule_version,'templateVersion','2026-10-04.1')) returning * into result;
  return result;
end;
$$;
revoke all on function public.create_vvtat_package(uuid,integer,uuid,jsonb) from public;
grant execute on function public.create_vvtat_package(uuid,integer,uuid,jsonb) to authenticated;

create function public.delete_vvtat_package(p_package_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare item public.vvtat_packages;
begin
  if auth.uid() is null or p_package_id is null then raise exception 'Invalid deletion request'; end if;
  select * into item from public.vvtat_packages where id = p_package_id and user_id = auth.uid();
  if not found then return false; end if;
  delete from public.vvtat_packages where id = item.id and user_id = auth.uid();
  return true;
end;
$$;
revoke all on function public.delete_vvtat_package(uuid) from public;
grant execute on function public.delete_vvtat_package(uuid) to authenticated;
