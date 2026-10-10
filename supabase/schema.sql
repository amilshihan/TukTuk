-- Tuk Tuk Meter: cloud backup of completed trips.
-- Run in the Supabase SQL editor (Dashboard -> SQL Editor -> New query).

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

create index if not exists trips_driver_started_idx on public.trips (driver_id, started_at desc);

-- Each driver can only see and write their own trips.
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
