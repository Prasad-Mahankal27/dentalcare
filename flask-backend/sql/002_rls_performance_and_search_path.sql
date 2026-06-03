-- Follow-up hardening based on Supabase advisors.
-- 1) Fix mutable function search_path.
-- 2) Optimize RLS auth lookups using (select auth.uid()).

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
