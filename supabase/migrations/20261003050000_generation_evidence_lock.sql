-- Lock selected metadata through the signed generation transaction. Storage still has a separate lifecycle.
create or replace function public.generate_signed_complaint_version(p_payload text, p_signature text)
returns public.complaint_versions
language plpgsql security definer set search_path = '' as $$
declare
  key_text text;
  j jsonb;
  c public.complaints;
  p public.purchases;
  existing public.complaint_versions;
  result public.complaint_versions;
  ids uuid[];
  next_no integer;
  locked_count integer := 0;
  locked_document record;
  v_request_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_payload is null or octet_length(p_payload) > 90000 or p_signature is null then raise exception 'Invalid generation request'; end if;
  select secret into key_text from complaint_private.signing_key where singleton = true;
  if key_text is null then raise exception 'Generation not configured'; end if;
  if encode(extensions.hmac(convert_to(p_payload, 'UTF8'), convert_to(key_text, 'UTF8'), 'sha256'), 'hex') <> p_signature then
    raise exception 'Invalid generation signature';
  end if;
  j := p_payload::jsonb;
  v_request_id := (j->>'requestId')::uuid;
  select * into c from public.complaints where id = (j->>'complaintId')::uuid and user_id = auth.uid() for update;
  if not found then raise exception 'Complaint not found'; end if;
  select * into existing from public.complaint_versions v where v.complaint_id = c.id and v.request_id = v_request_id;
  if found then return existing; end if;
  select * into p from public.purchases where id = c.purchase_id and user_id = auth.uid() for update;
  if not found or p.deletion_state <> 'ACTIVE' or p.updated_at <> (j->>'purchaseUpdatedAt')::timestamptz or p.updated_at <> c.purchase_updated_at then
    raise exception 'Purchase changed; review again';
  end if;
  if c.draft_version <> (j->>'expectedVersion')::integer then raise exception 'Draft changed; review again'; end if;
  if j->'snapshot'->'facts' <> c.facts or
    (j->'snapshot'->'answers') - 'asOfDate' <> c.answers - 'asOfDate' or
    j->'snapshot'->>'remedy' <> c.remedy or
    j->'snapshot'->'purchase'->>'id' <> p.id::text then raise exception 'Draft snapshot changed'; end if;
  select coalesce(array_agg(value::uuid), array[]::uuid[]) into ids from jsonb_array_elements_text(j->'evidenceIds');
  if cardinality(ids) > 12 or cardinality(ids) <> (select count(distinct id) from unnest(ids) id) then
    raise exception 'Evidence changed; review again';
  end if;
  for locked_document in select d.id from public.purchase_documents d
    where d.id = any(ids) and d.purchase_id = c.purchase_id and d.user_id = auth.uid()
      and d.upload_state = 'READY' for share loop
    locked_count := locked_count + 1;
  end loop;
  if locked_count <> cardinality(ids) then raise exception 'Evidence changed; review again'; end if;
  if j->'snapshot' is null or j->'sections' is null or j->>'plainText' is null or
     octet_length((j->'snapshot')::text) > 32000 or octet_length((j->'sections')::text) > 24000 or length(j->>'plainText') > 24000 then
    raise exception 'Invalid document size';
  end if;
  select coalesce(max(version_no), 0) + 1 into next_no from public.complaint_versions where complaint_id = c.id;
  insert into public.complaint_versions(user_id,purchase_id,complaint_id,version_no,request_id,document_date,snapshot,sections,plain_text,template_version,source_version)
    values(auth.uid(),c.purchase_id,c.id,next_no,v_request_id,(j->>'documentDate')::date,j->'snapshot',j->'sections',j->>'plainText',j->>'templateVersion',j->>'sourceVersion')
    returning * into result;
  return result;
end;
$$;
