export type GeoPoint = {
  latitude: number;
  longitude: number;
  /** Uncertainty radius in metres, if known. */
  accuracy: number | null;
  /** Milliseconds since epoch. */
  timestamp: number;
};

const EARTH_RADIUS_M = 6_371_000;

export function haversineM(a: GeoPoint, b: GeoPoint): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Readings worse than this are ignored entirely. */
export const MAX_ACCURACY_M = 35;
/** Movement smaller than this is treated as GPS jitter while parked. */
export const MIN_STEP_M = 8;
/** ~110 km/h — faster than any tuk tuk, so anything above is a GPS jump. */
export const MAX_SPEED_MPS = 30;

export type StepResult =
  | { kind: 'accept'; distanceM: number }
  | { kind: 'jitter' }
  | { kind: 'reject' };

/**
 * Decide how a new GPS fix relates to the last accepted one.
 * - accept: count the distance and move the anchor to `next`
 * - jitter: too close to tell from noise; keep the old anchor so slow
 *   movement still accumulates once it clears the threshold
 * - reject: inaccurate or physically impossible; drop it
 */
export function evaluateStep(prev: GeoPoint | null, next: GeoPoint): StepResult {
  if (next.accuracy != null && next.accuracy > MAX_ACCURACY_M) return { kind: 'reject' };
  if (!prev) return { kind: 'accept', distanceM: 0 };

  const d = haversineM(prev, next);
  const threshold = Math.max(MIN_STEP_M, Math.min(next.accuracy ?? 0, MAX_ACCURACY_M) * 0.5);
  if (d < threshold) return { kind: 'jitter' };

  const dt = (next.timestamp - prev.timestamp) / 1000;
  if (dt <= 0 || d / dt > MAX_SPEED_MPS) return { kind: 'reject' };

  return { kind: 'accept', distanceM: d };
}
