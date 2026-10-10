import type { RoutePoint } from './meter.ts';

/**
 * Place search and route planning.
 *
 * With EXPO_PUBLIC_GOOGLE_MAPS_KEY set, uses Google: Places API (New) for
 * search and the Routes API for traffic-aware routes that avoid expressways.
 * Without it, falls back to free OpenStreetMap services: Photon for search and
 * Valhalla's scooter profile for routes (no keys, fair-use limits).
 */

export const GOOGLE_MAPS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY || null;
export const usingGoogle = GOOGLE_MAPS_KEY != null;

type LatLng = { lat: number; lng: number };

/** A search result. Google results only get coordinates once picked (see resolvePlace). */
export type Place = { label: string; detail: string; lat?: number; lng?: number; googleId?: string };

export type PlannedRoute = {
  distanceM: number;
  /** Driving time without traffic. */
  durationSec: number;
  /** Driving time in current traffic, when the provider knows it (Google). */
  trafficDurationSec?: number;
  points: RoutePoint[];
};

const OSM_HEADERS = { 'User-Agent': 'TukTukMeter/1.0 (github.com/amilshihan/TukTuk)' };
const SRI_LANKA_BBOX = '79.5,5.8,82.0,9.9';

// Google bills autocomplete + the details call for the picked place as one session.
let sessionToken: string | null = null;
const newSessionToken = () =>
  'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

export async function searchPlaces(query: string, near?: LatLng): Promise<Place[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  return usingGoogle ? searchGoogle(q, near) : searchPhoton(q, near);
}

/** Coordinates for a picked search result (one extra call for Google results). */
export async function resolvePlace(p: Place): Promise<LatLng> {
  if (p.lat != null && p.lng != null) return { lat: p.lat, lng: p.lng };
  if (!p.googleId || !GOOGLE_MAPS_KEY) throw new Error('place has no location');
  const params = sessionToken ? `?sessionToken=${sessionToken}` : '';
  sessionToken = null; // the session ends with this call
  const res = await fetch(`https://places.googleapis.com/v1/places/${p.googleId}${params}`, {
    headers: { 'X-Goog-Api-Key': GOOGLE_MAPS_KEY, 'X-Goog-FieldMask': 'location' },
  });
  if (!res.ok) throw new Error(`place ${res.status}`);
  const json = (await res.json()) as { location: { latitude: number; longitude: number } };
  return { lat: json.location.latitude, lng: json.location.longitude };
}

export async function planRoute(from: LatLng, to: LatLng): Promise<PlannedRoute | null> {
  return usingGoogle ? routeGoogle(from, to) : routeValhalla(from, to);
}

// --- Google -------------------------------------------------------------------

async function searchGoogle(input: string, near?: LatLng): Promise<Place[]> {
  sessionToken ??= newSessionToken();
  const body: Record<string, unknown> = {
    input,
    includedRegionCodes: ['lk'],
    sessionToken,
  };
  if (near) {
    body.locationBias = { circle: { center: { latitude: near.lat, longitude: near.lng }, radius: 30000 } };
  }
  const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': GOOGLE_MAPS_KEY! },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`search ${res.status}`);
  const json = (await res.json()) as {
    suggestions?: {
      placePrediction?: {
        placeId: string;
        text: { text: string };
        structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } };
      };
    }[];
  };
  return (json.suggestions ?? []).flatMap((s) => {
    const p = s.placePrediction;
    if (!p) return [];
    return [
      {
        label: p.structuredFormat?.mainText?.text ?? p.text.text,
        detail: p.structuredFormat?.secondaryText?.text ?? '',
        googleId: p.placeId,
      },
    ];
  });
}

const seconds = (d: string | undefined) => (d ? parseFloat(d) : 0); // "165s" -> 165

async function routeGoogle(from: LatLng, to: LatLng): Promise<PlannedRoute | null> {
  const body = {
    origin: { location: { latLng: { latitude: from.lat, longitude: from.lng } } },
    destination: { location: { latLng: { latitude: to.lat, longitude: to.lng } } },
    travelMode: 'DRIVE',
    routingPreference: 'TRAFFIC_AWARE',
    // Tuk tuks aren't allowed on Sri Lanka's expressways.
    routeModifiers: { avoidHighways: true },
    units: 'METRIC',
  };
  const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_MAPS_KEY!,
      'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.staticDuration,routes.polyline.encodedPolyline',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`route ${res.status}`);
  const json = (await res.json()) as {
    routes?: { distanceMeters: number; duration: string; staticDuration?: string; polyline: { encodedPolyline: string } }[];
  };
  const r = json.routes?.[0];
  if (!r) return null;
  const traffic = seconds(r.duration);
  return {
    distanceM: r.distanceMeters,
    durationSec: seconds(r.staticDuration) || traffic,
    trafficDurationSec: traffic,
    points: decodePolyline(r.polyline.encodedPolyline, 5),
  };
}

// --- OpenStreetMap fallback ------------------------------------------------------

type PhotonFeature = {
  geometry: { coordinates: [number, number] };
  properties: Record<string, string | undefined>;
};

async function searchPhoton(q: string, near?: LatLng): Promise<Place[]> {
  const params = new URLSearchParams({ q, limit: '8', bbox: SRI_LANKA_BBOX });
  if (near) {
    params.set('lat', String(near.lat));
    params.set('lon', String(near.lng));
  }
  const res = await fetch(`https://photon.komoot.io/api/?${params}`, { headers: OSM_HEADERS });
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

async function routeValhalla(from: LatLng, to: LatLng): Promise<PlannedRoute | null> {
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
    headers: { ...OSM_HEADERS, 'Content-Type': 'application/json' },
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
