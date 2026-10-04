-- Keep the review findings from preparation time with the immutable package.
create function public.snapshot_vvtat_package_review() returns trigger
language plpgsql set search_path = '' as $$
declare c jsonb := new.snapshot->'case'; r jsonb := new.request_payload->'routing';
  missing text[] := array[]::text[]; review text[] := array[]::text[];
begin
  if c->>'submitted_on' is null then missing := array_append(missing,'Neįrašyta, kada kreipimasis pateiktas pardavėjui.'); end if;
  if c->>'received_on' is null then review := array_append(review,'Pardavėjo gavimo data nežinoma.'); end if;
  if btrim(coalesce(new.request_payload->>'applicantName','')) = '' or
    btrim(coalesce(new.request_payload->>'applicantEmail','')) = '' then
    missing := array_append(missing,'Trūksta peržiūrėtų pareiškėjo kontaktų.');
  end if;
  if btrim(coalesce(new.request_payload->>'sellerName','')) = '' then
    missing := array_append(missing,'Trūksta peržiūrėto pardavėjo pavadinimo.');
  end if;
  if btrim(coalesce(new.request_payload->>'disputeSummary','')) = '' or
    btrim(coalesce(new.request_payload->>'escalationReason','')) = '' or
    btrim(coalesce(new.request_payload->>'requestedOutcome','')) = '' then
    missing := array_append(missing,'Trūksta ginčo esmės, kreipimosi priežasties arba prašomo rezultato.');
  end if;
  if jsonb_array_length(new.snapshot->'selected') = 0 then review := array_append(review,'Nepasirinkta įrodymų failų.'); end if;
  if c->>'progress' in ('RESOLVED','CLOSED') then
    review := array_append(review,'Sekimas uždarytas arba ginčas pažymėtas išspręstu. Paketas yra istorinis.');
  end if;
  if r->>'ownGoodsDispute' <> 'YES' or r->>'professionalSeller' <> 'YES' or
    r->>'inLithuania' <> 'YES' or r->>'anotherBody' <> 'NO' or r->>'specialJurisdiction' <> 'NO' then
    review := array_append(review,'Patikrinkite ginčo maršrutą oficialiame vedlyje.');
  end if;
  if c->>'latest_response_outcome' in ('REFUSED','PARTLY_ACCEPTED') then
    review := array_append(review,'Pardavėjo atsakymo pobūdis yra naudotojo įrašytas faktas. Patikrinkite atsakymo kopiją.');
  elsif c->>'has_substantive_response' = 'false' then
    review := array_append(review,'Patikrinkite, ar nėra neįrašyto pardavėjo atsakymo.');
    if c->>'received_on' is null or c->>'deadline_rule_version' is null or
      (new.created_at at time zone 'Europe/Vilnius')::date > date '2026-10-31' then
      review := array_append(review,'Pardavėjo atsakymo termino taisyklė šiame pakete neprieinama.');
    end if;
  end if;
  if (new.created_at at time zone 'Europe/Vilnius')::date > date '2026-10-31' then
    review := array_append(review,'Teisinio termino šaltinio patikros laikotarpis pasibaigęs.');
  end if;
  new.snapshot := new.snapshot || jsonb_build_object('missingItems',to_jsonb(missing),'reviewItems',to_jsonb(review),
    'sourceLimitations',jsonb_build_array('Šis paketas nepatvirtina, kad institucija priims ginčą.',
      'Šio paketo rengimo metu tiksli e-TAR suvestinė redakcija nebuvo nepriklausomai iš naujo perskaityta.'));
  return new;
end;
$$;
create trigger vvtat_packages_snapshot_review before insert on public.vvtat_packages
  for each row execute function public.snapshot_vvtat_package_review();
