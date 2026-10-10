import { Platform } from 'react-native';
import Constants from 'expo-constants';
import Storage from 'expo-sqlite/kv-store';
import { currentFare, waitingSeconds, type ActiveTrip, type Trip } from './meter';
import { loadActiveTrip, markSynced, unsyncedTrips } from './storage';
import { supabase } from './supabase';

export type SyncResult = { uploaded: number } | { skipped: 'not-configured' | 'signed-out' } | { error: string };

const APP_VERSION = Constants.expoConfig?.version ?? 'unknown';
function vehicleNo(): string | null {
  const raw = Storage.getItemSync('driver');
  try {
    return raw ? (JSON.parse(raw) as { vehicle_no?: string }).vehicle_no ?? null : null;
  } catch {
    return null;
  }
}

const iso = (ms: number) => new Date(ms).toISOString();
const first = <T,>(a: T[]) => (a.length ? a[0] : null);
const last = <T,>(a: T[]) => (a.length ? a[a.length - 1] : null);

type TripLike = Pick<Trip, 'id' | 'startedAt' | 'distanceM' | 'waitingSec' | 'tariff' | 'fare' | 'route' | 'waitingPeriods'> & {
  endedAt: number | null;
  startAddress?: string | null;
  endAddress?: string | null;
  trackingMode?: string | null;
};

function toRow(t: TripLike, userId: string, status: 'in_progress' | 'completed') {
  const start = first(t.route);
  const end = last(t.route);
  return {
    id: t.id,
    driver_id: userId,
    status,
    vehicle_no: vehicleNo(),
    started_at: iso(t.startedAt),
    ended_at: t.endedAt != null ? iso(t.endedAt) : null,
    duration_sec: Math.round(((t.endedAt ?? Date.now()) - t.startedAt) / 1000),
    distance_m: Math.round(t.distanceM),
    waiting_sec: t.waitingSec,
    waiting_periods: t.waitingPeriods.map(([from, to]) => ({ from: iso(from), to: iso(to) })),
    base_fare: t.fare.baseFare,
    distance_charge: t.fare.distanceCharge,
    waiting_charge: t.fare.waitingCharge,
    night_charge: t.fare.nightCharge,
    total: t.fare.total,
    currency: t.tariff.currency,
    tariff: t.tariff,
    route: t.route,
    start_lat: start?.[0] ?? null,
    start_lng: start?.[1] ?? null,
    end_lat: end?.[0] ?? null,
    end_lng: end?.[1] ?? null,
    start_address: t.startAddress ?? null,
    end_address: t.endAddress ?? null,
    app_version: APP_VERSION,
    platform: Platform.OS,
    tracking_mode: t.trackingMode ?? null,
  };
}

async function signedInUser(): Promise<string | SyncResult> {
  if (!supabase) return { skipped: 'not-configured' };
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? { skipped: 'signed-out' };
}

/** Push finished trips that haven't reached the cloud yet. Safe to call often. */
export async function syncTrips(): Promise<SyncResult> {
  const user = await signedInUser();
  if (typeof user !== 'string') return user;

  const pending = await unsyncedTrips();
  if (pending.length === 0) return { uploaded: 0 };

  const rows = pending.map((t) => toRow(t, user, 'completed'));
  const { error } = await supabase!.from('trips').upsert(rows, { onConflict: 'id' });
  if (error) return { error: error.message };
  await markSynced(pending.map((t) => t.id));
  return { uploaded: pending.length };
}

/** Upload the running hire as "in progress", so it is on record even if the phone dies mid-trip. */
export async function syncActiveTrip(): Promise<void> {
  const user = await signedInUser();
  if (typeof user !== 'string') return;
  const trip: ActiveTrip | null = loadActiveTrip();
  if (!trip) return;
  const now = Date.now();
  const row = toRow(
    {
      ...trip,
      endedAt: null,
      waitingSec: waitingSeconds(trip, now),
      fare: currentFare(trip, now),
    },
    user,
    'in_progress',
  );
  await supabase!.from('trips').upsert(row, { onConflict: 'id' });
}

/** Everything that should be on the server: finished trips first, then the live one. */
export async function syncAll(): Promise<SyncResult> {
  const r = await syncTrips();
  await syncActiveTrip().catch(() => {});
  return r;
}
