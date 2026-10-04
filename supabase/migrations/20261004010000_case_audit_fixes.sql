-- Sprint 6 audit fixes. Additive migration for databases that already applied the case journal.
-- The 8192-byte JSONB cap accommodates the existing 1000-character summary
-- and 500-character note even when both contain four-byte Unicode characters.
alter table public.case_events drop constraint case_events_payload_check;
alter table public.case_events add constraint case_events_payload_check
  check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 8192);

alter table public.cases add constraint cases_creation_receipt_parent
  unique (id,user_id,purchase_id,complaint_version_id);
create table public.case_creation_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  complaint_version_id uuid not null,
  case_id uuid not null,
  purchase_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, request_id),
  foreign key (case_id,user_id,purchase_id,complaint_version_id)
    references public.cases(id,user_id,purchase_id,complaint_version_id) on delete cascade
);
alter table public.case_creation_receipts enable row level security;
revoke all on public.case_creation_receipts from anon, authenticated;
insert into public.case_creation_receipts(user_id,request_id,complaint_version_id,case_id,purchase_id)
  select user_id,create_request_id,complaint_version_id,id,purchase_id from public.cases;

create or replace function public.create_tracked_case(p_version_id uuid, p_request_id uuid)
returns public.cases language plpgsql security definer set search_path = '' as $$
declare v public.complaint_versions; c public.complaints; result public.cases; receipt public.case_creation_receipts;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_version_id is null or p_request_id is null then raise exception 'Invalid creation request'; end if;
  select * into v from public.complaint_versions where id = p_version_id and user_id = auth.uid();
  if not found then raise exception 'Document version not found'; end if;
  select * into c from public.complaints where id = v.complaint_id and user_id = auth.uid() and purchase_id = v.purchase_id;
  if not found then raise exception 'Document parent not found'; end if;
  select * into receipt from public.case_creation_receipts where user_id = auth.uid() and request_id = p_request_id;
  if found then
    if receipt.complaint_version_id is distinct from p_version_id then raise exception 'Creation request differs'; end if;
    select * into result from public.cases where id = receipt.case_id and user_id = auth.uid();
    if result.id is null then raise exception 'Creation receipt missing case'; end if;
    return result;
  end if;
  if exists (select 1 from public.purchases p where p.id = v.purchase_id and p.deletion_state = 'DELETING') then raise exception 'Purchase deleting'; end if;
  insert into public.cases(user_id,purchase_id,complaint_version_id,complaint_id,family,generated_at,create_request_id)
    values(auth.uid(),v.purchase_id,v.id,v.complaint_id,c.family,v.generated_at,p_request_id)
    on conflict do nothing returning * into result;
  if result.id is null then
    select * into result from public.cases where complaint_version_id = p_version_id and user_id = auth.uid();
    if result.id is null then raise exception 'Creation request differs'; end if;
  end if;
  insert into public.case_creation_receipts(user_id,request_id,complaint_version_id,case_id,purchase_id)
    values(auth.uid(),p_request_id,p_version_id,result.id,result.purchase_id) on conflict do nothing;
  select * into receipt from public.case_creation_receipts where user_id = auth.uid() and request_id = p_request_id;
  if receipt.complaint_version_id is distinct from p_version_id or receipt.case_id is distinct from result.id then
    raise exception 'Creation request differs';
  end if;
  return result;
end;
$$;

create or replace function public.record_case_event(p_case_id uuid, p_request_id uuid, p_expected_revision integer,
  p_kind text, p_occurred_on date, p_payload jsonb, p_evidence_id uuid default null, p_target_event_id uuid default null)
returns public.cases language plpgsql security definer set search_path = '' as $$
declare c public.cases; previous public.case_events; linked public.purchase_documents; existing public.case_events;
  allowed_keys text[]; latest_boundary date; today date := (now() at time zone 'Europe/Vilnius')::date; note text; method text; outcome text; receipt date; current_target uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_case_id is null or p_request_id is null or p_expected_revision is null or p_expected_revision < 0 or p_expected_revision >= 500 or p_kind is null or p_occurred_on is null then
    raise exception 'Invalid case event arguments';
  end if;
  select * into c from public.cases where id = p_case_id and user_id = auth.uid() for update;
  if not found then raise exception 'Case not found'; end if;
  select * into existing from public.case_events where user_id = auth.uid() and request_id = p_request_id;
  if existing.id is not null then
    if existing.case_id = p_case_id and existing.revision - 1 = p_expected_revision and existing.kind = p_kind and existing.occurred_on = p_occurred_on
      and existing.payload = p_payload and existing.evidence_id is not distinct from p_evidence_id
      and existing.target_event_id is not distinct from p_target_event_id then return jsonb_populate_record(null::public.cases, existing.result_snapshot); end if;
    raise exception 'Event retry differs';
  end if;
  if c.revision is distinct from p_expected_revision then raise exception 'Case revision changed'; end if;
  if c.revision >= 500 then raise exception 'Case history limit reached'; end if;
  if p_occurred_on is null or p_occurred_on > today or p_occurred_on < (c.generated_at at time zone 'Europe/Vilnius')::date then raise exception 'Invalid event date'; end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text) > 8192 then raise exception 'Invalid event payload size'; end if;
  allowed_keys := case p_kind
    when 'SUBMITTED' then array['method','receivedOn','note']
    when 'SUBMISSION_CORRECTED' then array['method','note']
    when 'RECEIPT_RECORDED' then array['note']
    when 'RECEIPT_CORRECTED' then array['note']
    when 'RESPONSE_RECORDED' then array['summary','outcome','note']
    when 'SERVICE_STARTED' then array['reference','promisedOn','note']
    when 'SERVICE_RETURNED' then array['result','note']
    when 'RESOLVED' then array['outcome','note']
    when 'CLOSED' then array['note']
    when 'REOPENED' then array['note']
    else null end;
  if allowed_keys is null or exists(select 1 from jsonb_each(p_payload) field where field.key <> all(allowed_keys) or jsonb_typeof(field.value) <> 'string') then
    raise exception 'Invalid event payload fields';
  end if;
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
    if exists(select 1 from public.case_events e where e.case_id = c.id and e.kind in ('RESPONSE_RECORDED','SERVICE_STARTED','SERVICE_RETURNED','RESOLVED','CLOSED','REOPENED') and e.occurred_on < p_occurred_on) then raise exception 'Submission after later event'; end if;
    method := p_payload->>'method';
    if method is null or method not in ('EMAIL','REGISTERED_POST','IN_PERSON','VTIS','OTHER') then raise exception 'Invalid method'; end if;
    c.submitted_on := p_occurred_on; c.submission_method := method;
  elsif p_kind in ('RECEIPT_RECORDED','RECEIPT_CORRECTED') then
    if c.submitted_on is null or p_occurred_on < c.submitted_on then raise exception 'Receipt before submission'; end if;
    if p_kind = 'RECEIPT_RECORDED' and (c.received_on is not null or p_target_event_id is not null) then raise exception 'Receipt already known'; end if;
    if p_kind = 'RECEIPT_CORRECTED' and (c.received_on is null or previous.kind not in ('RECEIPT_RECORDED','RECEIPT_CORRECTED','SUBMITTED') or
      (previous.kind = 'SUBMITTED' and previous.payload->>'receivedOn' is distinct from c.received_on::text) or
      (previous.kind <> 'SUBMITTED' and previous.occurred_on <> c.received_on)) then raise exception 'Invalid receipt correction'; end if;
    if exists(select 1 from public.case_events e where e.case_id = c.id and e.kind in ('RESPONSE_RECORDED','RESOLVED','CLOSED','REOPENED') and e.occurred_on < p_occurred_on) then raise exception 'Receipt after seller response'; end if;
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
    select max(e.occurred_on) into latest_boundary from public.case_events e where e.case_id = c.id and e.kind in ('SERVICE_RETURNED','REOPENED');
    if latest_boundary is not null and p_occurred_on < latest_boundary then raise exception 'Service before previous return or reopen'; end if;
    c.service_open := true; c.service_started_on := p_occurred_on; c.progress := 'IN_SERVICE';
  elsif p_kind = 'SERVICE_RETURNED' then
    if not c.service_open or c.progress <> 'IN_SERVICE' or p_target_event_id is not null or
      p_occurred_on < c.service_started_on then raise exception 'Invalid service return'; end if;
    select max(e.occurred_on) into latest_boundary from public.case_events e where e.case_id = c.id and e.kind = 'REOPENED';
    if latest_boundary is not null and p_occurred_on < latest_boundary then raise exception 'Return before reopen'; end if;
    if length(coalesce(p_payload->>'result','')) > 500 then raise exception 'Result too long'; end if;
    c.service_open := false; c.service_started_on := null; c.promised_on := null;
    c.progress := case when c.has_response then 'RESPONSE_RECORDED' else 'AWAITING_RESPONSE' end;
  elsif p_kind = 'RESOLVED' then
    if c.submitted_on is null or c.progress in ('CLOSED','RESOLVED') or p_target_event_id is not null then raise exception 'Invalid resolution'; end if;
    outcome := p_payload->>'outcome';
    if outcome is null or outcome not in ('REPAIRED','REPLACED','REFUND_RECEIVED','PRICE_REDUCTION','OTHER') then raise exception 'Invalid resolution'; end if;
    if c.service_open then raise exception 'Return item before resolution'; end if;
    select max(e.occurred_on) into latest_boundary from public.case_events e where e.case_id = c.id and e.kind in ('RESPONSE_RECORDED','SERVICE_STARTED','SERVICE_RETURNED','REOPENED');
    if p_occurred_on < greatest(c.submitted_on, coalesce(c.received_on,c.submitted_on), coalesce(latest_boundary,c.submitted_on)) then raise exception 'Resolution before case events'; end if;
    c.progress := 'RESOLVED';
  elsif p_kind = 'CLOSED' then
    if c.submitted_on is null or c.progress in ('CLOSED','RESOLVED') or p_target_event_id is not null then raise exception 'Invalid closure'; end if;
    select max(e.occurred_on) into latest_boundary from public.case_events e where e.case_id = c.id and e.kind in ('RESPONSE_RECORDED','SERVICE_STARTED','SERVICE_RETURNED','REOPENED');
    if p_occurred_on < greatest(c.submitted_on, coalesce(c.received_on,c.submitted_on), coalesce(latest_boundary,c.submitted_on)) then raise exception 'Closure before case events'; end if;
    c.progress := 'CLOSED';
  elsif p_kind = 'REOPENED' then
    if c.progress not in ('CLOSED','RESOLVED') or p_target_event_id is not null then raise exception 'Invalid reopen'; end if;
    select e.occurred_on into latest_boundary from public.case_events e where e.case_id = c.id and e.kind in ('CLOSED','RESOLVED') order by e.revision desc limit 1;
    if latest_boundary is null or p_occurred_on < latest_boundary then raise exception 'Reopen before closure'; end if;
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

create or replace function public.delete_tracked_case(p_case_id uuid, p_expected_revision integer, p_request_id uuid) returns boolean language plpgsql security definer set search_path = '' as $$
declare c public.cases; receipt public.case_deletion_receipts;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_case_id is null or p_request_id is null or p_expected_revision is null or p_expected_revision < 0 or p_expected_revision > 500 then
    raise exception 'Invalid case deletion arguments';
  end if;
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
  if c.revision is distinct from p_expected_revision then raise exception 'Case revision changed'; end if;
  insert into public.case_deletion_receipts(user_id,case_id,request_id,expected_revision)
    values(auth.uid(),c.id,p_request_id,p_expected_revision);
  delete from public.cases where id = c.id;
  return true;
end;
$$;
