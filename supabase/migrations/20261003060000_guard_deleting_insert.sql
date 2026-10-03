-- Inserts must never bypass the parent deletion guard by choosing DELETING.
drop trigger purchase_document_write_guard on public.purchase_documents;
create trigger purchase_document_insert_guard before insert on public.purchase_documents
  for each row execute function public.guard_purchase_document_write();
create trigger purchase_document_ready_guard before update of upload_state on public.purchase_documents
  for each row when (new.upload_state <> 'DELETING')
  execute function public.guard_purchase_document_write();
