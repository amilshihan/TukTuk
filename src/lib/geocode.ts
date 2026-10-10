import * as Location from 'expo-location';
import type { RoutePoint } from './meter';

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);
}

/** Street address for a point using the phone's own geocoder (free, needs internet). Null if unavailable. */
export async function lookupAddress(p: RoutePoint | null | undefined): Promise<string | null> {
  if (!p) return null;
  try {
    const [a] = await withTimeout(Location.reverseGeocodeAsync({ latitude: p[0], longitude: p[1] }), 8000);
    if (!a) return null;
    if (a.formattedAddress) return a.formattedAddress;
    const parts = [a.name, a.street, a.district ?? a.subregion, a.city].filter(
      (s, i, all): s is string => !!s && all.indexOf(s) === i,
    );
    return parts.length ? parts.join(', ') : null;
  } catch {
    return null;
  }
}
