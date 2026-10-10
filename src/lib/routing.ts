import type { RoutePoint } from './meter.ts';

/**
 * Route planning with free OpenStreetMap services (no API keys):
 * - Place search: Photon (photon.komoot.io), limited to Sri Lanka.
 * - Routing: Valhalla (valhalla1.openstreetmap.de) with the scooter profile,
 *   which keeps off expressways like a tuk tuk must.
 * Both are free community servers with fair-use limits; for heavy use, host
 * them or switch to a paid provider (see README).
 */

export type Place = { label: string; detail: string; lat: number; lng: number };
export type PlannedRoute = { distanceM: number; durationSec: number; points: RoutePoint[] };

const HEADERS = { 'User-Agent': 'TukTukMeter/1.0 (github.com/amilshihan/TukTuk)' };
const SRI_LANKA_BBOX = '79.5,5.8,82.0,9.9';

type PhotonFeature = {
  geometry: { coordinates: [number, number] };
  properties: Record<string, string | undefined>;
};

export async function searchPlaces(query: string, near?: { lat: number; lng: number }): Promise<Place[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const params = new URLSearchParams({ q, limit: '8', bbox: SRI_LANKA_BBOX });
  if (near) {
    params.set('lat', String(near.lat));
    params.set('lon', String(near.lng));
  }
  const res = await fetch(`https://photon.komoot.io/api/?${params}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`search ${res.status}`);
  const json = (await res.json()) as { features: PhotonFeature[] };
  const seen = new Set<string>();
  const places: Place[] = [];
  for (const f of json.features) {
    const p = f.properties;
    const label = p.name ?? [p.housenumber, p.street].filter(Boolean).join(' ');
    if (!label) continue;
    const detail = [p.street !== label ? p.street : undefined, p.district, p.city ?? p.county, p.state]
      .filter((s, i, all): s is string => !!s && all.indexOf(s) === i)
      .join(', ');
    const key = `${label}|${detail}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const [lng, lat] = f.geometry.coordinates;
    places.push({ label, detail, lat, lng });
  }
  return places;
}

export async function planRoute(from: { lat: number; lng: number }, to: { lat: number; lng: number }): Promise<PlannedRoute | null> {
  const body = {
    locations: [
      { lat: from.lat, lon: from.lng },
      { lat: to.lat, lon: to.lng },
    ],
    costing: 'motor_scooter',
    costing_options: { motor_scooter: { top_speed: 55 } },
    units: 'kilometers',
    directions_type: 'none',
  };
  const res = await fetch('https://valhalla1.openstreetmap.de/route', {
    method: 'POST',
    headers: { ...HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.status === 400) return null; // no route between these points
  if (!res.ok) throw new Error(`route ${res.status}`);
  const json = (await res.json()) as {
    trip: { summary: { length: number; time: number }; legs: { shape: string }[] };
  };
  const { summary, legs } = json.trip;
  return {
    distanceM: summary.length * 1000,
    durationSec: summary.time,
    points: legs.flatMap((l) => decodePolyline(l.shape, 6)),
  };
}

/** Google encoded polyline → [lat, lng] points. Valhalla uses precision 6. */
export function decodePolyline(encoded: string, precision = 5): RoutePoint[] {
  const factor = 10 ** precision;
  const points: RoutePoint[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    for (const which of [0, 1]) {
      let result = 0;
      let shift = 0;
      let byte: number;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (which === 0) lat += delta;
      else lng += delta;
    }
    points.push([lat / factor, lng / factor]);
  }
  return points;
}

/** Turn-by-turn directions in Google Maps for the driver. */
export function googleMapsLink(from: { lat: number; lng: number }, to: { lat: number; lng: number }): string {
  return `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lng}&destination=${to.lat},${to.lng}&travelmode=driving`;
}
