import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { addLocation, tick, type ActiveTrip } from './meter';
import { loadActiveTrip, saveActiveTrip } from './storage';

/**
 * GPS for a running hire. In an installed build, location runs as a
 * background task (Android shows a "meter running" notification) so distance
 * and waiting keep counting with the screen off or another app open.
 * Expo Go can't run background tasks, so there it falls back to a
 * foreground-only watcher.
 *
 * The active trip in storage is the single source of truth: every update
 * loads it, applies the change and saves it, all synchronously on the JS
 * thread, so the background task and the screen never overwrite each other.
 */

export const LOCATION_TASK = 'tuktuk-meter-location';

export const backgroundCapable = Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

type Listener = (trip: ActiveTrip) => void;
const listeners = new Set<Listener>();

let lastAccuracy: number | null = null;
export const getLastAccuracy = () => lastAccuracy;

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Load, change and save the active trip; notifies the screen if it changed. */
export function updateActiveTrip(fn: (t: ActiveTrip) => ActiveTrip): ActiveTrip | null {
  const cur = loadActiveTrip();
  if (!cur) return null;
  const next = fn(cur);
  if (next !== cur) {
    saveActiveTrip(next);
    listeners.forEach((l) => l(next));
  }
  return next;
}

function applyFixes(locations: Location.LocationObject[]) {
  if (locations.length === 0) return;
  lastAccuracy = locations[locations.length - 1].coords.accuracy;
  updateActiveTrip((trip) => {
    let t = trip;
    for (const loc of locations) {
      t = addLocation(t, {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        accuracy: loc.coords.accuracy,
        timestamp: loc.timestamp,
        speed: loc.coords.speed,
      });
    }
    // Timers can be throttled in the background; fixes keep arriving, so check stillness here too.
    return tick(t, Date.now());
  });
}

if (backgroundCapable) {
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(LOCATION_TASK, async ({ data, error }) => {
    if (error || !data) return;
    applyFixes(data.locations);
  });
}

let foregroundSub: Location.LocationSubscription | null = null;

export type TrackingMode = 'background' | 'foreground' | 'denied';

export async function startTracking(notification: { title: string; body: string }): Promise<TrackingMode> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (!fg.granted) return 'denied';

  if (backgroundCapable) {
    const bg = await Location.requestBackgroundPermissionsAsync().catch(() => null);
    if (bg?.granted) {
      const running = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false);
      if (!running) {
        await Location.startLocationUpdatesAsync(LOCATION_TASK, {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 1000,
          distanceInterval: 0,
          activityType: Location.ActivityType.AutomotiveNavigation,
          pausesUpdatesAutomatically: false,
          showsBackgroundLocationIndicator: true,
          foregroundService: {
            notificationTitle: notification.title,
            notificationBody: notification.body,
            notificationColor: '#FFC107',
            killServiceOnDestroy: false,
          },
        });
      }
      return 'background';
    }
  }

  if (!foregroundSub) {
    foregroundSub = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
      (loc) => applyFixes([loc]),
    );
  }
  return 'foreground';
}

export async function stopTracking(): Promise<void> {
  foregroundSub?.remove();
  foregroundSub = null;
  lastAccuracy = null;
  if (backgroundCapable && (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false))) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  }
}
