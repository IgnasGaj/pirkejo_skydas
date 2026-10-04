-- Database boundary for review fields, including callers bypassing the web route.
create function public.validate_vvtat_package_insert() returns trigger
language plpgsql set search_path = '' as $$
declare field text; original_demand text; selected jsonb;
begin
  foreach field in array array['applicantName','applicantEmail','sellerName','sellerContact',
    'disputeSummary','escalationReason','requestedOutcome','outcomeChangedExplanation'] loop
    if new.request_payload ? field and jsonb_typeof(new.request_payload->field) <> 'string' then
      raise exception 'Invalid package field type';
    end if;
  end loop;
  foreach field in array array['ownGoodsDispute','professionalSeller','inLithuania',
    'anotherBody','specialJurisdiction'] loop
    if not (new.request_payload->'routing' ? field) or
      (new.request_payload->'routing'->>field) not in ('YES','NO','UNKNOWN') then
      raise exception 'Invalid package routing';
    end if;
  end loop;
  if new.request_payload->>'applicantEmail' is distinct from '' and
    length(coalesce(new.request_payload->>'applicantEmail','')) > 0 and
    (new.request_payload->>'applicantEmail') !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    raise exception 'Invalid contact email';
  end if;
  original_demand := substring(new.snapshot->'complaintVersion'->>'plainText' from '(?m)^Prašau [^[:cntrl:]]+');
  if original_demand is not null and
    btrim(coalesce(new.request_payload->>'requestedOutcome','')) is distinct from btrim(original_demand) and
    btrim(coalesce(new.request_payload->>'outcomeChangedExplanation','')) = '' then
    raise exception 'Changed outcome requires explanation';
  end if;
  if octet_length((new.snapshot->'events')::text) > 100000 then raise exception 'Case history too large'; end if;
  for selected in select value from jsonb_array_elements(new.snapshot->'selected') loop
    if (selected->>'id') is null or (selected->>'sha256') !~ '^[0-9a-f]{64}$' or
      (selected->>'sizeBytes')::bigint <= 0 then raise exception 'Invalid evidence snapshot'; end if;
  end loop;
  return new;
end;
$$;
create trigger vvtat_packages_validate before insert on public.vvtat_packages
  for each row execute function public.validate_vvtat_package_insert();
