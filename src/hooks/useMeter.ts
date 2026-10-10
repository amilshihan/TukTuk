import { useCallback, useEffect, useState } from 'react';
import * as Location from 'expo-location';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import {
  addLocation,
  currentFare,
  finishTrip,
  setWaiting,
  startTrip,
  waitingSeconds,
  type ActiveTrip,
  type Trip,
} from '@/lib/meter';
import { MAX_ACCURACY_M } from '@/lib/geo';
import { loadActiveTrip, loadTariff, saveActiveTrip, saveTrip } from '@/lib/storage';
import { syncTrips } from '@/lib/sync';

export type GpsStatus = 'off' | 'searching' | 'good' | 'weak' | 'denied';

const KEEP_AWAKE_TAG = 'tuktuk-meter';

export function useMeter() {
  const [trip, setTripState] = useState<ActiveTrip | null>(() => loadActiveTrip());
  const [now, setNow] = useState(() => Date.now());
  const [gps, setGps] = useState<GpsStatus>('off');
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);

  const setTrip = useCallback((update: (t: ActiveTrip | null) => ActiveTrip | null) => {
    setTripState((prev) => {
      const next = update(prev);
      if (next !== prev) saveActiveTrip(next);
      return next;
    });
  }, []);

  const running = trip != null;

  // Tick the clock, keep the screen on and GPS live for the whole hire.
  // A restored trip (after the app was killed) resumes here too.
  useEffect(() => {
    if (!running) return;
    let cancelled = false;
    let sub: Location.LocationSubscription | null = null;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});

    (async () => {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (!perm.granted) {
        setGps('denied');
        return;
      }
      setGps('searching');
      const s = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
        (loc) => {
          const accuracy = loc.coords.accuracy;
          setGpsAccuracy(accuracy);
          setGps(accuracy != null && accuracy > MAX_ACCURACY_M ? 'weak' : 'good');
          setTrip((t) =>
            t
              ? addLocation(t, {
                  latitude: loc.coords.latitude,
                  longitude: loc.coords.longitude,
                  accuracy,
                  timestamp: loc.timestamp,
                })
              : t,
          );
        },
        () => setGps('weak'),
      );
      if (cancelled) s.remove();
      else sub = s;
    })().catch(() => setGps('weak'));

    return () => {
      cancelled = true;
      sub?.remove();
      clearInterval(timer);
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
      setGps('off');
      setGpsAccuracy(null);
    };
  }, [running, setTrip]);

  const start = useCallback(async () => {
    // Ask up front so a refusal is reported before the meter starts.
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) {
      setGps('denied');
      return false;
    }
    const t = Date.now();
    setNow(t);
    setTrip(() => startTrip(loadTariff(), t));
    return true;
  }, [setTrip]);

  const toggleWaiting = useCallback(() => {
    const t = Date.now();
    setNow(t);
    setTrip((cur) => (cur ? setWaiting(cur, cur.waitingSince == null, t) : cur));
  }, [setTrip]);

  const finish = useCallback(async (): Promise<Trip | null> => {
    if (!trip) return null;
    const done = finishTrip(trip, Date.now());
    await saveTrip(done);
    setTrip(() => null);
    syncTrips().catch(() => {});
    return done;
  }, [trip, setTrip]);

  return {
    trip,
    gps,
    gpsAccuracy,
    isWaiting: trip?.waitingSince != null,
    elapsedSec: trip ? Math.floor((now - trip.startedAt) / 1000) : 0,
    waitingSec: trip ? waitingSeconds(trip, now) : 0,
    fare: trip ? currentFare(trip, now) : null,
    start,
    toggleWaiting,
    finish,
  };
}
