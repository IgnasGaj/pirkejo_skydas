-- A deletion tombstone cannot be reclaimed by an in-flight reviewed upload.
create or replace function public.guard_purchase_document_write() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare parent_state text;
begin
  if tg_op = 'UPDATE' and old.upload_state = 'DELETING' and new.upload_state <> 'DELETING' then
    raise exception 'Evidence deletion in progress';
  end if;
  select deletion_state into parent_state from public.purchases
    where id = new.purchase_id and user_id = new.user_id for share;
  if parent_state is distinct from 'ACTIVE' then raise exception 'Purchase deletion in progress'; end if;
  return new;
end;
$$;
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
  if not found or row_data.upload_state = 'DELETING' then return 'UNAVAILABLE'; end if;
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
