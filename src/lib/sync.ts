import { markSynced, unsyncedTrips } from './storage';
import { supabase } from './supabase';

export type SyncResult = { uploaded: number } | { skipped: 'not-configured' | 'signed-out' } | { error: string };

/** Push trips that haven't reached the cloud yet. Safe to call often; it is idempotent. */
export async function syncTrips(): Promise<SyncResult> {
  if (!supabase) return { skipped: 'not-configured' };
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) return { skipped: 'signed-out' };

  const pending = await unsyncedTrips();
  if (pending.length === 0) return { uploaded: 0 };

  const rows = pending.map((t) => ({
    id: t.id,
    driver_id: userId,
    started_at: new Date(t.startedAt).toISOString(),
    ended_at: new Date(t.endedAt).toISOString(),
    distance_m: t.distanceM,
    waiting_sec: t.waitingSec,
    base_fare: t.fare.baseFare,
    distance_charge: t.fare.distanceCharge,
    waiting_charge: t.fare.waitingCharge,
    night_charge: t.fare.nightCharge,
    total: t.fare.total,
    currency: t.tariff.currency,
    tariff: t.tariff,
    route: t.route,
  }));

  const { error } = await supabase.from('trips').upsert(rows, { onConflict: 'id' });
  if (error) return { error: error.message };
  await markSynced(pending.map((t) => t.id));
  return { uploaded: pending.length };
}
