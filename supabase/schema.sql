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
  -- Only driver registrations carry a mobile number; admin accounts don't get a profile.
  if not (coalesce(new.raw_user_meta_data, '{}'::jsonb) ? 'mobile') then
    return new;
  end if;
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

-- Full trip details for the operator's records.
alter table public.trips alter column ended_at drop not null; -- null while the hire is running
alter table public.trips add column if not exists status text not null default 'completed'
  check (status in ('in_progress', 'completed'));
alter table public.trips add column if not exists vehicle_no text;
alter table public.trips add column if not exists duration_sec integer;
alter table public.trips add column if not exists waiting_periods jsonb; -- [{from, to}, ...]
alter table public.trips add column if not exists start_lat double precision;
alter table public.trips add column if not exists start_lng double precision;
alter table public.trips add column if not exists end_lat double precision;
alter table public.trips add column if not exists end_lng double precision;
alter table public.trips add column if not exists start_address text;
alter table public.trips add column if not exists end_address text;
alter table public.trips add column if not exists app_version text;
alter table public.trips add column if not exists platform text;
alter table public.trips add column if not exists tracking_mode text;
alter table public.trips add column if not exists updated_at timestamptz not null default now();

create index if not exists trips_driver_started_idx on public.trips (driver_id, started_at desc);
create index if not exists trips_status_idx on public.trips (status) where status = 'in_progress';

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

-- No delete policy: drivers can't remove trips.

-- A completed trip is a record: later uploads can't change it, except to fill in
-- addresses that were looked up after the hire ended. A late "in progress"
-- upload arriving after completion is ignored the same way.
create or replace function public.protect_completed_trip()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  kept public.trips%rowtype;
begin
  if old.status = 'completed' then
    kept := old;
    kept.start_address := coalesce(old.start_address, new.start_address);
    kept.end_address := coalesce(old.end_address, new.end_address);
    kept.updated_at := now();
    return kept;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists protect_completed_trip on public.trips;
create trigger protect_completed_trip
  before update on public.trips
  for each row execute function public.protect_completed_trip();

-- ---------------------------------------------------------------------------
-- Admins and driver status (admin website).
-- ---------------------------------------------------------------------------
alter table public.drivers add column if not exists active boolean not null default true;
alter table public.drivers add column if not exists deactivated_at timestamptz;
-- Updated by the app while it's open, so the admin can see who is online.
alter table public.drivers add column if not exists last_seen_at timestamptz;

create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;

drop policy if exists "admins read own row" on public.admins;
create policy "admins read own row" on public.admins
  for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;

drop policy if exists "admins read all drivers" on public.drivers;
create policy "admins read all drivers" on public.drivers
  for select to authenticated using ((select public.is_admin()));

drop policy if exists "admins update drivers" on public.drivers;
create policy "admins update drivers" on public.drivers
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "admins read all trips" on public.trips;
create policy "admins read all trips" on public.trips
  for select to authenticated using ((select public.is_admin()));

-- Drivers can update their own row (last seen), but only an admin can
-- activate or deactivate an account.
create or replace function public.protect_driver_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.active is distinct from old.active then
    if not public.is_admin() then
      raise exception 'Only an admin can change a driver''s status';
    end if;
    new.deactivated_at := case when new.active then null else now() end;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_driver_status on public.drivers;
create trigger protect_driver_status
  before update on public.drivers
  for each row execute function public.protect_driver_status();

-- ---------------------------------------------------------------------------
-- Reporting views (Table Editor and the admin website). They run with the
-- caller's permissions: an admin sees every driver, a driver only themselves.
-- ---------------------------------------------------------------------------

-- Every trip with the driver's details, newest first, times in Sri Lanka time.
drop view if exists public.trip_log;
create view public.trip_log
with (security_invoker = true) as
select
  t.started_at at time zone 'Asia/Colombo' as started,
  t.ended_at at time zone 'Asia/Colombo' as ended,
  t.status,
  d.full_name as driver,
  d.mobile,
  coalesce(t.vehicle_no, d.vehicle_no) as vehicle_no,
  round(t.distance_m / 1000.0, 2) as km,
  make_interval(secs => coalesce(t.duration_sec, extract(epoch from (coalesce(t.ended_at, now()) - t.started_at)))) as duration,
  make_interval(secs => t.waiting_sec) as waiting,
  jsonb_array_length(coalesce(t.waiting_periods, '[]'::jsonb)) as waiting_stops,
  t.base_fare,
  t.distance_charge,
  t.waiting_charge,
  t.night_charge,
  t.total,
  t.currency,
  t.start_address,
  t.end_address,
  case when t.start_lat is not null and t.end_lat is not null then
    'https://www.google.com/maps/dir/?api=1&origin=' || t.start_lat || ',' || t.start_lng
      || '&destination=' || t.end_lat || ',' || t.end_lng
  end as map_link,
  t.tracking_mode,
  t.platform,
  t.app_version,
  t.waiting_periods,
  t.id as trip_id,
  t.driver_id,
  t.started_at as started_at_utc,
  t.updated_at
from public.trips t
join public.drivers d on d.id = t.driver_id
order by t.started_at desc;

revoke all on public.trip_log from anon;
grant select on public.trip_log to authenticated;

-- Every driver with their status and trip totals (completed trips only).
-- "On hire now" only counts hires updated in the last 5 minutes, so a phone that
-- died mid-hire doesn't show as on hire forever.
drop view if exists public.driver_summary;
create view public.driver_summary
with (security_invoker = true) as
select
  d.id,
  d.full_name,
  d.mobile,
  d.vehicle_no,
  d.nic,
  d.licence_no,
  d.address,
  d.active,
  d.deactivated_at,
  d.last_seen_at,
  d.created_at as registered_at,
  count(t.id) filter (where t.status = 'completed') as trips,
  coalesce(sum(t.total) filter (where t.status = 'completed'), 0) as total_fares,
  round(coalesce(sum(t.distance_m) filter (where t.status = 'completed'), 0) / 1000.0, 1) as total_km,
  coalesce(bool_or(t.status = 'in_progress' and t.updated_at > now() - interval '5 minutes'), false) as on_hire_now,
  count(t.id) filter (where t.status = 'completed' and t.started_at >= date_trunc('day', now() at time zone 'Asia/Colombo') at time zone 'Asia/Colombo') as trips_today,
  coalesce(sum(t.total) filter (where t.status = 'completed' and t.started_at >= date_trunc('day', now() at time zone 'Asia/Colombo') at time zone 'Asia/Colombo'), 0) as fares_today,
  max(t.started_at) as last_trip_at
from public.drivers d
left join public.trips t on t.driver_id = d.id
group by d.id;

revoke all on public.driver_summary from anon;
grant select on public.driver_summary to authenticated;

-- To make someone an admin: create their login in Authentication -> Users ->
-- Add user (email + password, tick "Auto Confirm User"), then run:
--   insert into public.admins (user_id)
--   select id from auth.users where email = 'admin@example.com'
--   on conflict do nothing;