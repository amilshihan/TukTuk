-- Tuk Tuk Meter database. Safe to run more than once.
-- Run in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.

-- ---------------------------------------------------------------------------
-- Drivers: one row per registered driver, for the operator's records.
-- ---------------------------------------------------------------------------
create table if not exists public.drivers (
  id uuid primary key references auth.users (id) on delete cascade,
  mobile text not null unique,
  full_name text not null,
  address text not null,
  nic text not null,
  vehicle_no text not null,
  licence_no text not null,
  created_at timestamptz not null default now()
);

alter table public.drivers enable row level security;

drop policy if exists "drivers read own profile" on public.drivers;
create policy "drivers read own profile" on public.drivers
  for select to authenticated using (id = (select auth.uid()));

drop policy if exists "drivers update own profile" on public.drivers;
create policy "drivers update own profile" on public.drivers
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Registration sends the details as sign-up metadata; this copies them into
-- public.drivers in the same transaction, so a driver can't exist without a profile.
create or replace function public.handle_new_driver()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.drivers (id, mobile, full_name, address, nic, vehicle_no, licence_no)
  values (
    new.id,
    new.raw_user_meta_data ->> 'mobile',
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'address',
    upper(new.raw_user_meta_data ->> 'nic'),
    upper(new.raw_user_meta_data ->> 'vehicle_no'),
    upper(new.raw_user_meta_data ->> 'licence_no')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_driver();

-- ---------------------------------------------------------------------------
-- Trips: completed hires, uploaded from the phone.
-- ---------------------------------------------------------------------------
create table if not exists public.trips (
  id uuid primary key,
  driver_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  started_at timestamptz not null,
  ended_at timestamptz not null,
  distance_m integer not null check (distance_m >= 0),
  waiting_sec integer not null check (waiting_sec >= 0),
  base_fare numeric(10, 2) not null,
  distance_charge numeric(10, 2) not null,
  waiting_charge numeric(10, 2) not null,
  total numeric(10, 2) not null,
  currency text not null default 'Rs',
  tariff jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.trips add column if not exists night_charge numeric(10, 2) not null default 0;
-- [[lat, lng], ...] of the route driven.
alter table public.trips add column if not exists route jsonb;

create index if not exists trips_driver_started_idx on public.trips (driver_id, started_at desc);

alter table public.trips enable row level security;

drop policy if exists "drivers read own trips" on public.trips;
create policy "drivers read own trips" on public.trips
  for select to authenticated using (driver_id = (select auth.uid()));

drop policy if exists "drivers insert own trips" on public.trips;
create policy "drivers insert own trips" on public.trips
  for insert to authenticated with check (driver_id = (select auth.uid()));

drop policy if exists "drivers update own trips" on public.trips;
create policy "drivers update own trips" on public.trips
  for update to authenticated
  using (driver_id = (select auth.uid()))
  with check (driver_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Operator view: every driver with their trip totals (Table Editor -> driver_summary).
-- Not exposed to the app: only the dashboard (service role) can read it.
-- ---------------------------------------------------------------------------
create or replace view public.driver_summary
with (security_invoker = true) as
select
  d.full_name,
  d.mobile,
  d.vehicle_no,
  d.nic,
  d.licence_no,
  d.address,
  d.created_at as registered_at,
  count(t.id) as trips,
  coalesce(sum(t.total), 0) as total_fares,
  round(coalesce(sum(t.distance_m), 0) / 1000.0, 1) as total_km,
  max(t.started_at) as last_trip_at
from public.drivers d
left join public.trips t on t.driver_id = d.id
group by d.id;

revoke all on public.driver_summary from anon, authenticated;
