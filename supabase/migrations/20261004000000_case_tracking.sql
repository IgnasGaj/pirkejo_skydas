-- A small, append-only user-reported case journal. All writes pass through these RPCs.
alter table public.complaint_versions add constraint complaint_versions_case_parent unique (id, user_id, purchase_id);

create table public.cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  purchase_id uuid not null,
  complaint_version_id uuid not null unique,
  complaint_id uuid not null,
  family text not null check (family in ('DEFECTIVE_PRODUCT','DISTANCE_WITHDRAWAL','PHYSICAL_RETURN_REQUEST')),
  generated_at timestamptz not null,
  create_request_id uuid not null,
  progress text not null default 'PREPARED' check (progress in ('PREPARED','AWAITING_RESPONSE','RESPONSE_RECORDED','IN_SERVICE','RESOLVED','CLOSED')),
  revision integer not null default 0 check (revision between 0 and 500),
  submitted_on date,
  received_on date,
  submission_method text check (submission_method in ('EMAIL','REGISTERED_POST','IN_PERSON','VTIS','OTHER')),
  has_response boolean not null default false,
  has_substantive_response boolean not null default false,
  latest_response_outcome text check (latest_response_outcome in ('ACCEPTED','PARTLY_ACCEPTED','REFUSED','MORE_INFORMATION','OTHER')),
  service_open boolean not null default false,
  service_started_on date,
  promised_on date,
  deadline_rule_version text,
  deadline_source_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id, purchase_id),
  unique (user_id, create_request_id),
  foreign key (complaint_version_id, user_id, purchase_id) references public.complaint_versions(id, user_id, purchase_id) on delete cascade,
  foreign key (purchase_id, user_id) references public.purchases(id, user_id) on delete cascade,
  check (received_on is null or (submitted_on is not null and received_on >= submitted_on))
);
create index cases_owner_progress_idx on public.cases(user_id, progress, updated_at desc, id desc);
create index cases_purchase_idx on public.cases(purchase_id, updated_at desc);

create table public.case_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null,
  purchase_id uuid not null,
  user_id uuid not null,
  request_id uuid not null,
  kind text not null check (kind in ('SUBMITTED','SUBMISSION_CORRECTED','RECEIPT_RECORDED','RECEIPT_CORRECTED','RESPONSE_RECORDED','SERVICE_STARTED','SERVICE_RETURNED','RESOLVED','CLOSED','REOPENED')),
  occurred_on date not null,
  recorded_at timestamptz not null default now(),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 2500),
  evidence_id uuid,
  evidence_filename text check (evidence_filename is null or length(evidence_filename) <= 255),
  target_event_id uuid,
  revision integer not null check (revision between 1 and 500),
  result_snapshot jsonb not null check (jsonb_typeof(result_snapshot) = 'object'),
  unique (user_id, request_id),
  unique (case_id, revision),
  foreign key (case_id, user_id, purchase_id) references public.cases(id, user_id, purchase_id) on delete cascade,
  -- The original ID remains in history after evidence deletion. The guarded RPC
  -- validates its owned READY parent when the link is first recorded.
  foreign key (target_event_id) references public.case_events(id) on delete set null
);
create index case_events_history_idx on public.case_events(case_id, occurred_on desc, recorded_at desc, id desc);

alter table public.cases enable row level security;
alter table public.case_events enable row level security;
create policy "Read own cases" on public.cases for select to authenticated using (user_id = (select auth.uid()));
create policy "Read own case events" on public.case_events for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.cases, public.case_events from anon, authenticated;
grant select on public.cases, public.case_events to authenticated;

create function public.create_tracked_case(p_version_id uuid, p_request_id uuid)
returns public.cases language plpgsql security definer set search_path = '' as $$
declare v public.complaint_versions; c public.complaints; result public.cases;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into v from public.complaint_versions where id = p_version_id and user_id = auth.uid();
  if not found then raise exception 'Document version not found'; end if;
  select * into c from public.complaints where id = v.complaint_id and user_id = auth.uid() and purchase_id = v.purchase_id;
  if not found then raise exception 'Document parent not found'; end if;
  if exists (select 1 from public.purchases p where p.id = v.purchase_id and p.deletion_state = 'DELETING') then raise exception 'Purchase deleting'; end if;
  insert into public.cases(user_id,purchase_id,complaint_version_id,complaint_id,family,generated_at,create_request_id)
    values(auth.uid(),v.purchase_id,v.id,v.complaint_id,c.family,v.generated_at,p_request_id)
    on conflict do nothing returning * into result;
  if result.id is null then
    select * into result from public.cases where complaint_version_id = p_version_id and user_id = auth.uid();
    if result.id is null then raise exception 'Creation request differs'; end if;
  end if;
  return result;
end;
$$;
revoke all on function public.create_tracked_case(uuid,uuid) from public;
grant execute on function public.create_tracked_case(uuid,uuid) to authenticated;

create function public.record_case_event(p_case_id uuid, p_request_id uuid, p_expected_revision integer,
  p_kind text, p_occurred_on date, p_payload jsonb, p_evidence_id uuid default null, p_target_event_id uuid default null)
returns public.cases language plpgsql security definer set search_path = '' as $$
declare c public.cases; previous public.case_events; linked public.purchase_documents; existing public.case_events;
  today date := (now() at time zone 'Europe/Vilnius')::date; note text; method text; outcome text; receipt date; current_target uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into c from public.cases where id = p_case_id and user_id = auth.uid() for update;
  if not found then raise exception 'Case not found'; end if;
  select * into existing from public.case_events where user_id = auth.uid() and request_id = p_request_id;
  if existing.id is not null then
    if existing.case_id = p_case_id and existing.revision - 1 = p_expected_revision and existing.kind = p_kind and existing.occurred_on = p_occurred_on
      and existing.payload = p_payload and existing.evidence_id is not distinct from p_evidence_id
      and existing.target_event_id is not distinct from p_target_event_id then return jsonb_populate_record(null::public.cases, existing.result_snapshot); end if;
    raise exception 'Event retry differs';
  end if;
  if c.revision <> p_expected_revision then raise exception 'Case revision changed'; end if;
  if c.revision >= 500 then raise exception 'Case history limit reached'; end if;
  if p_occurred_on is null or p_occurred_on > today or p_occurred_on < (c.generated_at at time zone 'Europe/Vilnius')::date then raise exception 'Invalid event date'; end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text) > 2500 then raise exception 'Invalid event payload'; end if;
  if c.submitted_on is not null and p_kind not in ('SUBMISSION_CORRECTED','RECEIPT_CORRECTED') and p_occurred_on < c.submitted_on then raise exception 'Event before submission'; end if;
  if p_target_event_id is not null then
    select * into previous from public.case_events where id = p_target_event_id and case_id = c.id and user_id = auth.uid();
    if not found then raise exception 'Correction target not found'; end if;
  end if;
  if p_kind = 'SUBMISSION_CORRECTED' then
    select e.id into current_target from public.case_events e where e.case_id = c.id and e.kind in ('SUBMITTED','SUBMISSION_CORRECTED') order by e.revision desc limit 1;
    if p_target_event_id is distinct from current_target then raise exception 'Stale submission correction'; end if;
  elsif p_kind = 'RECEIPT_CORRECTED' then
    select e.id into current_target from public.case_events e where e.case_id = c.id and
      (e.kind in ('RECEIPT_RECORDED','RECEIPT_CORRECTED') or (e.kind = 'SUBMITTED' and e.payload ? 'receivedOn')) order by e.revision desc limit 1;
    if p_target_event_id is distinct from current_target then raise exception 'Stale receipt correction'; end if;
  end if;
  if p_evidence_id is not null then
    select * into linked from public.purchase_documents where id = p_evidence_id and user_id = auth.uid()
      and purchase_id = c.purchase_id and upload_state = 'READY' for share;
    if not found then raise exception 'Evidence unavailable'; end if;
  end if;
  note := p_payload->>'note';
  if length(coalesce(note,'')) > 500 then raise exception 'Note too long'; end if;
  if p_kind = 'SUBMITTED' then
    if c.progress <> 'PREPARED' or p_target_event_id is not null then raise exception 'Invalid submission transition'; end if;
    method := p_payload->>'method';
    if method is null or method not in ('EMAIL','REGISTERED_POST','IN_PERSON','VTIS','OTHER') then raise exception 'Invalid method'; end if;
    c.submitted_on := p_occurred_on; c.submission_method := method; c.progress := 'AWAITING_RESPONSE';
    if p_payload ? 'receivedOn' then
      receipt := (p_payload->>'receivedOn')::date;
      if receipt < p_occurred_on or receipt > today then raise exception 'Invalid receipt date'; end if;
      c.received_on := receipt;
    end if;
  elsif p_kind = 'SUBMISSION_CORRECTED' then
    if c.submitted_on is null or previous.kind not in ('SUBMITTED','SUBMISSION_CORRECTED') or
      previous.occurred_on <> c.submitted_on then raise exception 'Invalid submission correction'; end if;
    if c.received_on is not null and p_occurred_on > c.received_on then raise exception 'Submission after receipt'; end if;
    if exists(select 1 from public.case_events e where e.case_id = c.id and e.kind in ('RESPONSE_RECORDED','SERVICE_STARTED','SERVICE_RETURNED','RESOLVED','CLOSED') and e.occurred_on < p_occurred_on) then raise exception 'Submission after later event'; end if;
    method := p_payload->>'method';
    if method is null or method not in ('EMAIL','REGISTERED_POST','IN_PERSON','VTIS','OTHER') then raise exception 'Invalid method'; end if;
    c.submitted_on := p_occurred_on; c.submission_method := method;
  elsif p_kind in ('RECEIPT_RECORDED','RECEIPT_CORRECTED') then
    if c.submitted_on is null or p_occurred_on < c.submitted_on then raise exception 'Receipt before submission'; end if;
    if p_kind = 'RECEIPT_RECORDED' and (c.received_on is not null or p_target_event_id is not null) then raise exception 'Receipt already known'; end if;
    if p_kind = 'RECEIPT_CORRECTED' and (c.received_on is null or previous.kind not in ('RECEIPT_RECORDED','RECEIPT_CORRECTED','SUBMITTED') or
      (previous.kind = 'SUBMITTED' and previous.payload->>'receivedOn' is distinct from c.received_on::text) or
      (previous.kind <> 'SUBMITTED' and previous.occurred_on <> c.received_on)) then raise exception 'Invalid receipt correction'; end if;
    if exists(select 1 from public.case_events e where e.case_id = c.id and e.kind = 'RESPONSE_RECORDED' and e.occurred_on < p_occurred_on) then raise exception 'Receipt after seller response'; end if;
    c.received_on := p_occurred_on;
  elsif p_kind = 'RESPONSE_RECORDED' then
    if c.submitted_on is null or c.progress in ('CLOSED','RESOLVED') or p_occurred_on < c.submitted_on or
      (c.received_on is not null and p_occurred_on < c.received_on) or p_target_event_id is not null then raise exception 'Invalid response transition'; end if;
    outcome := p_payload->>'outcome';
    if outcome is null or outcome not in ('ACCEPTED','PARTLY_ACCEPTED','REFUSED','MORE_INFORMATION','OTHER') or
      length(btrim(coalesce(p_payload->>'summary',''))) not between 1 and 1000 then raise exception 'Invalid response'; end if;
    c.has_response := true;
    c.latest_response_outcome := outcome;
    if outcome in ('ACCEPTED','PARTLY_ACCEPTED','REFUSED') then c.has_substantive_response := true; end if;
    if not c.service_open then c.progress := 'RESPONSE_RECORDED'; end if;
  elsif p_kind = 'SERVICE_STARTED' then
    if c.submitted_on is null or c.service_open or c.progress in ('CLOSED','RESOLVED') or p_occurred_on < c.submitted_on or p_target_event_id is not null then raise exception 'Invalid service transition'; end if;
    if length(coalesce(p_payload->>'reference','')) > 200 then raise exception 'Reference too long'; end if;
    if p_payload ? 'promisedOn' then c.promised_on := (p_payload->>'promisedOn')::date;
      if c.promised_on < p_occurred_on then raise exception 'Invalid promised date'; end if;
    else c.promised_on := null; end if;
    c.service_open := true; c.service_started_on := p_occurred_on; c.progress := 'IN_SERVICE';
  elsif p_kind = 'SERVICE_RETURNED' then
    if not c.service_open or c.progress <> 'IN_SERVICE' or p_target_event_id is not null or
      p_occurred_on < c.service_started_on then raise exception 'Invalid service return'; end if;
    if length(coalesce(p_payload->>'result','')) > 500 then raise exception 'Result too long'; end if;
    c.service_open := false; c.service_started_on := null; c.promised_on := null;
    c.progress := case when c.has_response then 'RESPONSE_RECORDED' else 'AWAITING_RESPONSE' end;
  elsif p_kind = 'RESOLVED' then
    if c.submitted_on is null or c.progress in ('CLOSED','RESOLVED') or p_target_event_id is not null then raise exception 'Invalid resolution'; end if;
    outcome := p_payload->>'outcome';
    if outcome is null or outcome not in ('REPAIRED','REPLACED','REFUND_RECEIVED','PRICE_REDUCTION','OTHER') then raise exception 'Invalid resolution'; end if;
    c.progress := 'RESOLVED';
  elsif p_kind = 'CLOSED' then
    if c.submitted_on is null or c.progress in ('CLOSED','RESOLVED') or p_target_event_id is not null then raise exception 'Invalid closure'; end if;
    c.progress := 'CLOSED';
  elsif p_kind = 'REOPENED' then
    if c.progress not in ('CLOSED','RESOLVED') or p_target_event_id is not null then raise exception 'Invalid reopen'; end if;
    c.progress := case when c.service_open then 'IN_SERVICE' when c.has_response then 'RESPONSE_RECORDED' else 'AWAITING_RESPONSE' end;
  else raise exception 'Unsupported event'; end if;
  if p_kind not in ('SUBMISSION_CORRECTED','RECEIPT_CORRECTED') and p_target_event_id is not null then raise exception 'Unexpected correction target'; end if;
  if p_kind in ('SUBMISSION_CORRECTED','RECEIPT_CORRECTED') and p_target_event_id is null then raise exception 'Correction target required'; end if;
  if p_kind in ('SUBMITTED','SUBMISSION_CORRECTED','RECEIPT_RECORDED','RECEIPT_CORRECTED') and c.received_on is not null and c.family = 'DEFECTIVE_PRODUCT' then
    if today <= date '2026-10-31' and c.received_on + 14 <= date '2026-10-31' then
      c.deadline_rule_version := 'LT-VTA-21-CK-1.118-1.121-2026-10-04.1'; c.deadline_source_version := '2026-10-04';
    else c.deadline_rule_version := null; c.deadline_source_version := null; end if;
  end if;
  c.revision := c.revision + 1; c.updated_at := clock_timestamp();
  update public.cases set progress=c.progress,revision=c.revision,submitted_on=c.submitted_on,received_on=c.received_on,
    submission_method=c.submission_method,has_response=c.has_response,has_substantive_response=c.has_substantive_response,latest_response_outcome=c.latest_response_outcome,
    service_open=c.service_open,service_started_on=c.service_started_on,promised_on=c.promised_on,deadline_rule_version=c.deadline_rule_version,
    deadline_source_version=c.deadline_source_version,updated_at=c.updated_at where id=c.id;
  insert into public.case_events(case_id,purchase_id,user_id,request_id,kind,occurred_on,payload,evidence_id,evidence_filename,target_event_id,revision,result_snapshot)
    values(c.id,c.purchase_id,c.user_id,p_request_id,p_kind,p_occurred_on,p_payload,p_evidence_id,linked.original_filename,p_target_event_id,c.revision,to_jsonb(c));
  return c;
end;
$$;
revoke all on function public.record_case_event(uuid,uuid,integer,text,date,jsonb,uuid,uuid) from public;
grant execute on function public.record_case_event(uuid,uuid,integer,text,date,jsonb,uuid,uuid) to authenticated;

create table public.case_deletion_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  case_id uuid not null,
  request_id uuid not null,
  expected_revision integer not null,
  deleted_at timestamptz not null default now(),
  primary key(user_id, request_id),
  unique (user_id, case_id)
);
alter table public.case_deletion_receipts enable row level security;
revoke all on public.case_deletion_receipts from anon, authenticated;

create function public.delete_tracked_case(p_case_id uuid, p_expected_revision integer, p_request_id uuid) returns boolean language plpgsql security definer set search_path = '' as $$
declare c public.cases; receipt public.case_deletion_receipts;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into receipt from public.case_deletion_receipts where user_id = auth.uid() and request_id = p_request_id;
  if found then
    if receipt.case_id = p_case_id and receipt.expected_revision = p_expected_revision then return true; end if;
    raise exception 'Case deletion retry differs';
  end if;
  select * into c from public.cases where id = p_case_id and user_id = auth.uid() for update;
  if not found then
    select * into receipt from public.case_deletion_receipts where user_id = auth.uid() and request_id = p_request_id;
    if found then
      if receipt.case_id = p_case_id and receipt.expected_revision = p_expected_revision then return true; end if;
      raise exception 'Case deletion retry differs';
    end if;
    return false;
  end if;
  if c.revision <> p_expected_revision then raise exception 'Case revision changed'; end if;
  insert into public.case_deletion_receipts(user_id,case_id,request_id,expected_revision)
    values(auth.uid(),c.id,p_request_id,p_expected_revision);
  delete from public.cases where id = c.id;
  return true;
end;
$$;
revoke all on function public.delete_tracked_case(uuid,integer,uuid) from public;
grant execute on function public.delete_tracked_case(uuid,integer,uuid) to authenticated;

create function public.guard_tracked_version_delete() returns trigger language plpgsql set search_path = '' as $$
begin
  if exists(select 1 from public.cases c where c.complaint_version_id = old.id) and
    not exists(select 1 from public.purchases p where p.id = old.purchase_id and p.deletion_state = 'DELETING') then
    raise exception 'Tracked document version: delete the case first';
  end if;
  return old;
end;
$$;
create trigger complaint_version_case_delete before delete on public.complaint_versions
for each row execute function public.guard_tracked_version_delete();
