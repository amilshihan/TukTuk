import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useI18n } from '@/lib/i18n';
import { MAX_ACCURACY_M } from '@/lib/geo';
import {
  currentFare,
  finishTrip,
  FIX_STALE_MS,
  startTrip,
  tick,
  waitingSeconds,
  type ActiveTrip,
  type Trip,
} from '@/lib/meter';
import { loadActiveTrip, loadTariff, saveActiveTrip, saveTrip } from '@/lib/storage';
import { lookupAddress } from '@/lib/geocode';
import { syncActiveTrip, syncTrips } from '@/lib/sync';
import {
  getLastAccuracy,
  startTracking,
  stopTracking,
  subscribe,
  updateActiveTrip,
  type TrackingMode,
} from '@/lib/tracking';

export type GpsStatus = 'off' | 'searching' | 'good' | 'weak' | 'denied';

const KEEP_AWAKE_TAG = 'tuktuk-meter';

export function useMeter() {
  const { t } = useI18n();
  const [trip, setTrip] = useState<ActiveTrip | null>(() => loadActiveTrip());
  const [now, setNow] = useState(() => Date.now());
  const [mode, setMode] = useState<TrackingMode | null>(null);

  const running = trip != null;

  // Background fixes update storage; mirror them on screen.
  useEffect(() => subscribe(setTrip), []);

  // While a hire runs: tick every second, keep the screen on, keep GPS going.
  // A trip restored after the app was killed resumes here too.
  useEffect(() => {
    if (!running) return;
    let cancelled = false;

    const timer = setInterval(() => {
      const ts = Date.now();
      setNow(ts);
      updateActiveTrip((cur) => tick(cur, ts));
    }, 1000);
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});

    startTracking({ title: t('fgTitle'), body: t('fgBody') })
      .then((m) => !cancelled && setMode(m))
      .catch(() => !cancelled && setMode('foreground'));

    // Keep the operator's copy of the running hire current, in case the phone dies mid-trip.
    syncActiveTrip().catch(() => {});
    const syncTimer = setInterval(() => syncActiveTrip().catch(() => {}), 60_000);

    // Coming back from the background: pick up whatever the task recorded.
    const appState = AppState.addEventListener('change', (s) => {
      if (s === 'active') setTrip(loadActiveTrip());
    });

    return () => {
      cancelled = true;
      clearInterval(timer);
      clearInterval(syncTimer);
      appState.remove();
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    };
    // Re-running on language change would restart tracking; the notification text can wait.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  const start = useCallback(async () => {
    const ts = Date.now();
    const fresh = startTrip(loadTariff(), ts);
    saveActiveTrip(fresh);
    const m = await startTracking({ title: t('fgTitle'), body: t('fgBody') }).catch(() => 'foreground' as const);
    if (m === 'denied') {
      saveActiveTrip(null);
      setMode('denied');
      return false;
    }
    setMode(m);
    setNow(ts);
    setTrip(updateActiveTrip((cur) => ({ ...cur, trackingMode: m })) ?? fresh);
    return true;
  }, [t]);

  const finish = useCallback(async (): Promise<Trip | null> => {
    const cur = loadActiveTrip();
    if (!cur) return null;
    await stopTracking().catch(() => {});
    const done = finishTrip(cur, Date.now());
    await saveTrip(done);
    saveActiveTrip(null);
    setTrip(null);
    setMode(null);
    syncTrips().catch(() => {});
    // Addresses can take a few seconds; show the receipt now and add them when ready.
    (async () => {
      const [startAddress, endAddress] = await Promise.all([
        lookupAddress(done.route[0]),
        lookupAddress(done.route[done.route.length - 1]),
      ]);
      if (!startAddress && !endAddress) return;
      await saveTrip({ ...done, startAddress, endAddress });
      await syncTrips();
    })().catch(() => {});
    return done;
  }, []);

  let gps: GpsStatus = 'off';
  const accuracy = getLastAccuracy();
  if (mode === 'denied') gps = 'denied';
  else if (trip) {
    if (trip.lastFixAt == null) gps = 'searching';
    else if (now - trip.lastFixAt > FIX_STALE_MS || (accuracy != null && accuracy > MAX_ACCURACY_M)) gps = 'weak';
    else gps = 'good';
  }

  return {
    trip,
    gps,
    gpsAccuracy: accuracy,
    background: mode === 'background',
    isWaiting: trip?.waitingSince != null,
    elapsedSec: trip ? Math.floor((now - trip.startedAt) / 1000) : 0,
    waitingSec: trip ? waitingSeconds(trip, now) : 0,
    fare: trip ? currentFare(trip, now) : null,
    start,
    finish,
  };
}
