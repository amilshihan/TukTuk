import * as SQLite from 'expo-sqlite';
import Storage from 'expo-sqlite/kv-store';
import { DEFAULT_TARIFF, type Tariff } from './fare';
import type { ActiveTrip, Trip } from './meter';

const db = SQLite.openDatabaseSync('tuktuk.db');

db.execSync(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS trips (
    id TEXT PRIMARY KEY NOT NULL,
    started_at INTEGER NOT NULL,
    ended_at INTEGER NOT NULL,
    distance_m INTEGER NOT NULL,
    waiting_sec INTEGER NOT NULL,
    total REAL NOT NULL,
    data TEXT NOT NULL,
    synced INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS trips_started_at ON trips (started_at DESC);
`);

type TripRow = { data: string; synced: number };

export type StoredTrip = Trip & { synced: boolean };

const fromRow = (r: TripRow): StoredTrip => {
  const t = JSON.parse(r.data) as Trip;
  // Trips saved by older versions lack the route and night charge.
  return {
    ...t,
    route: t.route ?? [],
    waitingPeriods: t.waitingPeriods ?? [],
    fare: { ...t.fare, nightCharge: t.fare.nightCharge ?? 0 },
    synced: r.synced === 1,
  };
};

export async function saveTrip(trip: Trip): Promise<void> {
  await db.runAsync(
    `INSERT OR REPLACE INTO trips (id, started_at, ended_at, distance_m, waiting_sec, total, data, synced)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
    trip.id,
    trip.startedAt,
    trip.endedAt,
    trip.distanceM,
    trip.waitingSec,
    trip.fare.total,
    JSON.stringify(trip),
  );
}

export async function listTrips(limit = 200): Promise<StoredTrip[]> {
  const rows = await db.getAllAsync<TripRow>(
    'SELECT data, synced FROM trips ORDER BY started_at DESC LIMIT ?',
    limit,
  );
  return rows.map(fromRow);
}

export async function getTrip(id: string): Promise<StoredTrip | null> {
  const row = await db.getFirstAsync<TripRow>('SELECT data, synced FROM trips WHERE id = ?', id);
  return row ? fromRow(row) : null;
}

export async function unsyncedTrips(): Promise<StoredTrip[]> {
  const rows = await db.getAllAsync<TripRow>('SELECT data, synced FROM trips WHERE synced = 0');
  return rows.map(fromRow);
}

export async function markSynced(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const marks = ids.map(() => '?').join(',');
  await db.runAsync(`UPDATE trips SET synced = 1 WHERE id IN (${marks})`, ...ids);
}

export type DaySummary = { trips: number; distanceM: number; earnings: number };

export async function summarySince(since: number): Promise<DaySummary> {
  const row = await db.getFirstAsync<{ trips: number; distance: number | null; earnings: number | null }>(
    'SELECT COUNT(*) AS trips, SUM(distance_m) AS distance, SUM(total) AS earnings FROM trips WHERE started_at >= ?',
    since,
  );
  return { trips: row?.trips ?? 0, distanceM: row?.distance ?? 0, earnings: row?.earnings ?? 0 };
}

// --- Small key/value state -------------------------------------------------

const TARIFF_KEY = 'tariff';
const ACTIVE_TRIP_KEY = 'activeTrip';

export function loadTariff(): Tariff {
  const raw = Storage.getItemSync(TARIFF_KEY);
  if (!raw) return DEFAULT_TARIFF;
  try {
    return { ...DEFAULT_TARIFF, ...(JSON.parse(raw) as Partial<Tariff>) };
  } catch {
    return DEFAULT_TARIFF;
  }
}

export function saveTariff(tariff: Tariff): void {
  Storage.setItemSync(TARIFF_KEY, JSON.stringify(tariff));
}

/** The running hire is saved on every change so a crash or app kill doesn't lose the fare. */
export function loadActiveTrip(): ActiveTrip | null {
  const raw = Storage.getItemSync(ACTIVE_TRIP_KEY);
  if (!raw) return null;
  try {
    const t = JSON.parse(raw) as ActiveTrip;
    // Fill fields added in later versions so a hire running across an update keeps working.
    return {
      ...t,
      tariff: { ...DEFAULT_TARIFF, ...t.tariff },
      lastMoveAt: t.lastMoveAt ?? Date.now(),
      lastFixAt: t.lastFixAt ?? null,
      route: t.route ?? [],
      waitingPeriods: t.waitingPeriods ?? [],
    };
  } catch {
    return null;
  }
}

export function saveActiveTrip(trip: ActiveTrip | null): void {
  if (trip) Storage.setItemSync(ACTIVE_TRIP_KEY, JSON.stringify(trip));
  else Storage.removeItemSync(ACTIVE_TRIP_KEY);
}
