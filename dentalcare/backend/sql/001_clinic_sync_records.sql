-- Cross-device synchronization table for SQLite-first Orisyn deployments.
-- Each local mutation is mirrored here and pulled by other devices in the same clinic.

create table if not exists public.clinic_sync_records (
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  entity text not null,
  record_key text not null,
  payload jsonb,
  is_deleted boolean not null default false,
  source_device text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (clinic_id, entity, record_key)
);

create index if not exists idx_clinic_sync_records_clinic_updated
  on public.clinic_sync_records (clinic_id, updated_at desc);

create index if not exists idx_clinic_sync_records_entity
  on public.clinic_sync_records (clinic_id, entity, updated_at desc);

create or replace function public.touch_clinic_sync_records_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as
$$
begin
  new.updated_at = now();
  return new;
end
$$;

drop trigger if exists trg_clinic_sync_records_updated_at on public.clinic_sync_records;
create trigger trg_clinic_sync_records_updated_at
before update on public.clinic_sync_records
for each row
execute function public.touch_clinic_sync_records_updated_at();

alter table public.clinic_sync_records enable row level security;

drop policy if exists clinic_sync_records_select_same_clinic on public.clinic_sync_records;
drop policy if exists clinic_sync_records_insert_same_clinic on public.clinic_sync_records;
drop policy if exists clinic_sync_records_update_same_clinic on public.clinic_sync_records;
drop policy if exists clinic_sync_records_delete_same_clinic on public.clinic_sync_records;

create policy clinic_sync_records_select_same_clinic
on public.clinic_sync_records
for select
to authenticated
using (
  clinic_id in (
    select clinic_id
    from public.users
    where id = (select auth.uid())
  )
);

create policy clinic_sync_records_insert_same_clinic
on public.clinic_sync_records
for insert
to authenticated
with check (
  clinic_id in (
    select clinic_id
    from public.users
    where id = (select auth.uid())
  )
);

create policy clinic_sync_records_update_same_clinic
on public.clinic_sync_records
for update
to authenticated
using (
  clinic_id in (
    select clinic_id
    from public.users
    where id = (select auth.uid())
  )
)
with check (
  clinic_id in (
    select clinic_id
    from public.users
    where id = (select auth.uid())
  )
);

create policy clinic_sync_records_delete_same_clinic
on public.clinic_sync_records
for delete
to authenticated
using (
  clinic_id in (
    select clinic_id
    from public.users
    where id = (select auth.uid())
  )
);

grant select, insert, update, delete on public.clinic_sync_records to authenticated;
