-- Orisyn multi-tenant schema and RLS for Supabase.

create extension if not exists "pgcrypto";

do
$$
begin
  create type public.user_role as enum ('admin', 'doctor', 'receptionist');
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  subscription_plan text not null default 'free',
  subscription_expiry timestamptz
);

create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  role public.user_role not null,
  created_at timestamptz not null default now()
);

create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics (id) on delete cascade,
  encrypted_data jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_users_clinic_id on public.users (clinic_id);
create index if not exists idx_users_role on public.users (role);
create index if not exists idx_patients_clinic_id on public.patients (clinic_id);
create index if not exists idx_patients_updated_at on public.patients (updated_at desc);

create or replace function public.touch_patients_updated_at()
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

drop trigger if exists trg_patients_updated_at on public.patients;
create trigger trg_patients_updated_at
before update on public.patients
for each row
execute function public.touch_patients_updated_at();

alter table public.clinics enable row level security;
alter table public.users enable row level security;
alter table public.patients enable row level security;

drop policy if exists clinics_select_own on public.clinics;
drop policy if exists clinics_update_admin on public.clinics;
drop policy if exists users_select_self_or_admin_same_clinic on public.users;
drop policy if exists users_update_admin_same_clinic on public.users;
drop policy if exists patients_select_same_clinic on public.patients;
drop policy if exists patients_insert_same_clinic on public.patients;
drop policy if exists patients_update_same_clinic on public.patients;
drop policy if exists patients_delete_same_clinic on public.patients;

create policy clinics_select_own
on public.clinics
for select
to authenticated
using (
  id in (
    select clinic_id
    from public.users
    where id = (select auth.uid())
  )
);

create policy clinics_update_admin
on public.clinics
for update
to authenticated
using (
  id in (
    select clinic_id
    from public.users
    where id = (select auth.uid())
  )
  and exists (
    select 1
    from public.users
    where id = (select auth.uid())
      and role = 'admin'
  )
)
with check (
  id in (
    select clinic_id
    from public.users
    where id = (select auth.uid())
  )
);

create policy users_select_self_or_admin_same_clinic
on public.users
for select
to authenticated
using (
  id = (select auth.uid())
  or (
    clinic_id in (
      select clinic_id
      from public.users
      where id = (select auth.uid())
    )
    and exists (
      select 1
      from public.users
      where id = (select auth.uid())
        and role = 'admin'
    )
  )
);

create policy users_update_admin_same_clinic
on public.users
for update
to authenticated
using (
  clinic_id in (
    select clinic_id
    from public.users
    where id = (select auth.uid())
  )
  and exists (
    select 1
    from public.users
    where id = (select auth.uid())
      and role = 'admin'
  )
)
with check (
  clinic_id in (
    select clinic_id
    from public.users
    where id = (select auth.uid())
  )
);

create policy patients_select_same_clinic
on public.patients
for select
to authenticated
using (
  clinic_id in (
    select clinic_id
    from public.users
    where id = (select auth.uid())
  )
);

create policy patients_insert_same_clinic
on public.patients
for insert
to authenticated
with check (
  clinic_id in (
    select clinic_id
    from public.users
    where id = (select auth.uid())
  )
);

create policy patients_update_same_clinic
on public.patients
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

create policy patients_delete_same_clinic
on public.patients
for delete
to authenticated
using (
  clinic_id in (
    select clinic_id
    from public.users
    where id = (select auth.uid())
  )
);

grant usage on schema public to authenticated;
grant select, update on table public.clinics to authenticated;
grant select, update on table public.users to authenticated;
grant select, insert, update, delete on table public.patients to authenticated;