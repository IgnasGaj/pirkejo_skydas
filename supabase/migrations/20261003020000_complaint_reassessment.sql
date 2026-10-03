-- Keep successful update identities on the draft so a lost response can be retried.
alter table public.complaints
  add column last_save_request_id uuid,
  add column last_save_hash text;

create function public.save_reviewed_complaint(
  p_complaint_id uuid, p_expected_version integer, p_purchase_updated_at timestamptz,
  p_rebind boolean, p_request_id uuid, p_family text, p_answers jsonb,
  p_facts jsonb, p_remedy text, p_template_version text, p_source_version text
) returns public.complaints
language plpgsql security invoker set search_path = '' as $$
declare
  c public.complaints;
  p public.purchases;
  payload_hash text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_request_id is null or p_expected_version is null or p_purchase_updated_at is null or p_rebind is null then
    raise exception 'Invalid save request';
  end if;
  payload_hash := encode(extensions.digest(convert_to((jsonb_build_array(
    p_complaint_id, p_expected_version, p_purchase_updated_at, p_rebind,
    p_family, p_answers, p_facts, p_remedy, p_template_version, p_source_version
  ))::text, 'UTF8'), 'sha256'), 'hex');
  select * into c from public.complaints
    where id = p_complaint_id and user_id = auth.uid() for update;
  if not found then raise exception 'Complaint not found'; end if;
  if c.last_save_request_id = p_request_id then
    if c.last_save_hash = payload_hash and c.draft_version = p_expected_version + 1 then return c; end if;
    raise exception 'Save retry differs or draft changed';
  end if;
  if c.draft_version <> p_expected_version then raise exception 'Draft changed; review again'; end if;
  select * into p from public.purchases
    where id = c.purchase_id and user_id = auth.uid() for update;
  if not found or p.updated_at <> p_purchase_updated_at then raise exception 'Purchase changed; review again'; end if;
  if not p_rebind and c.purchase_updated_at <> p.updated_at then raise exception 'Reassessment required'; end if;
  update public.complaints set
    family = p_family, answers = p_answers, facts = p_facts, remedy = p_remedy,
    purchase_updated_at = p.updated_at, template_version = p_template_version,
    source_version = p_source_version, last_save_request_id = p_request_id,
    last_save_hash = payload_hash
    where id = c.id returning * into c;
  return c;
end;
$$;
revoke all on function public.save_reviewed_complaint(uuid,integer,timestamptz,boolean,uuid,text,jsonb,jsonb,text,text,text) from public, anon;
grant execute on function public.save_reviewed_complaint(uuid,integer,timestamptz,boolean,uuid,text,jsonb,jsonb,text,text,text) to authenticated;
