-- Deleting a package must not cause a later package to reuse its version number.
create table public.vvtat_package_counters (
  case_id uuid primary key references public.cases(id) on delete cascade,
  last_version integer not null check (last_version between 1 and 100)
);
alter table public.vvtat_package_counters enable row level security;
revoke all on public.vvtat_package_counters from anon, authenticated;
insert into public.vvtat_package_counters(case_id,last_version)
  select case_id,max(version_no) from public.vvtat_packages group by case_id;

create function public.assign_vvtat_package_version() returns trigger
language plpgsql security definer set search_path = '' as $$
declare number integer;
begin
  insert into public.vvtat_package_counters(case_id,last_version) values(new.case_id,1)
    on conflict(case_id) do update set last_version = public.vvtat_package_counters.last_version + 1
    returning last_version into number;
  if number > 100 then raise exception 'Package version limit reached'; end if;
  new.version_no := number;
  return new;
end;
$$;
create trigger vvtat_packages_assign_version before insert on public.vvtat_packages
  for each row execute function public.assign_vvtat_package_version();
