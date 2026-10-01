-- A document row reserves the stable receipt path before Storage upload. Existing
-- documents remain ready; interrupted reviewed saves can be reclaimed later.
alter table public.purchase_documents
  add column upload_state text not null default 'READY' check (upload_state in ('PENDING', 'READY')),
  add column content_sha256 text check (content_sha256 is null or content_sha256 ~ '^[0-9a-f]{64}$'),
  add column upload_claim_token uuid,
  add column upload_claim_expires_at timestamptz;

create or replace function public.claim_reviewed_receipt(
  p_purchase_id uuid, p_document_id uuid, p_path text, p_filename text,
  p_mime text, p_size bigint, p_sha256 text, p_token uuid
) returns text language plpgsql security invoker set search_path = public as $$
declare
  row_data public.purchase_documents%rowtype;
begin
  if auth.uid() is null or p_token is null or p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then
    return 'UNAVAILABLE';
  end if;
  insert into public.purchase_documents (
    id, user_id, purchase_id, document_type, original_filename, storage_path,
    mime_type, size_bytes, upload_state, content_sha256, upload_claim_token, upload_claim_expires_at
  ) values (
    p_document_id, auth.uid(), p_purchase_id, 'RECEIPT', p_filename, p_path,
    p_mime, p_size, 'PENDING', p_sha256, p_token, now() + interval '3 minutes'
  ) on conflict do nothing;

  select * into row_data from public.purchase_documents
    where id = p_document_id and user_id = auth.uid() and purchase_id = p_purchase_id for update;
  if not found then return 'UNAVAILABLE'; end if;
  if row_data.document_type <> 'RECEIPT' or row_data.storage_path <> p_path
    or row_data.original_filename <> p_filename or row_data.mime_type <> p_mime
    or row_data.size_bytes <> p_size or row_data.content_sha256 is distinct from p_sha256 then
    return 'CONFLICT';
  end if;
  if row_data.upload_state = 'READY' then return 'READY'; end if;
  if row_data.upload_claim_token = p_token then return 'CLAIMED'; end if;
  if row_data.upload_claim_expires_at > now() then return 'PENDING'; end if;
  update public.purchase_documents set upload_claim_token = p_token,
    upload_claim_expires_at = now() + interval '3 minutes'
    where id = p_document_id and user_id = auth.uid();
  return 'CLAIMED';
end;
$$;

revoke all on function public.claim_reviewed_receipt(uuid, uuid, text, text, text, bigint, text, uuid) from public;
grant execute on function public.claim_reviewed_receipt(uuid, uuid, text, text, text, bigint, text, uuid) to authenticated;
