-- Tombstones make Storage failures retryable and keep missing objects out of
-- READY evidence. A purchase remains owned until Storage cleanup succeeds.
alter table public.purchases add column deletion_state text not null default 'ACTIVE'
  check (deletion_state in ('ACTIVE', 'DELETING'));
alter table public.purchase_documents drop constraint purchase_documents_upload_state_check;
alter table public.purchase_documents add constraint purchase_documents_upload_state_check
  check (upload_state in ('PENDING', 'READY', 'DELETING'));

create function public.guard_purchase_document_write() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare parent_state text;
begin
  select deletion_state into parent_state from public.purchases
    where id = new.purchase_id and user_id = new.user_id for share;
  if parent_state is distinct from 'ACTIVE' then raise exception 'Purchase deletion in progress'; end if;
  return new;
end;
$$;
create trigger purchase_document_write_guard before insert or update of upload_state
  on public.purchase_documents for each row
  when (new.upload_state <> 'DELETING') execute function public.guard_purchase_document_write();

drop policy "Upload own purchase evidence" on storage.objects;
create policy "Upload own active purchase evidence" on storage.objects for insert to authenticated
with check (bucket_id = 'purchase-evidence' and owner_id = (select auth.uid()::text)
  and exists (select 1 from public.purchases p where p.id::text = (storage.foldername(name))[2]
    and p.user_id = (select auth.uid()) and p.deletion_state = 'ACTIVE'
    and (storage.foldername(name))[1] = p.user_id::text));
drop policy "Delete own purchase evidence" on storage.objects;
create policy "Delete own purchase evidence" on storage.objects for delete to authenticated
using (bucket_id = 'purchase-evidence' and owner_id = (select auth.uid()::text)
  and (storage.foldername(name))[1] = (select auth.uid()::text));
