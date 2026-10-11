import { calculateFare, type FareBreakdown, type Tariff } from './fare.ts';
import { evaluateStep, isRolling, type GeoPoint } from './geo.ts';

/** A running hire. Plain JSON so it can be persisted and restored after a crash. */
export type ActiveTrip = {
  id: string;
  startedAt: number;
  tariff: Tariff;
  distanceM: number;
  /** Waiting time from completed waiting periods. */
  waitingMs: number;
  /** Set while the meter is in waiting mode. */
  waitingSince: number | null;
  lastPoint: GeoPoint | null;
  /** When the tuk tuk last moved (or the hire started). */
  lastMoveAt: number;
  /** When the last usable GPS fix arrived; waiting only starts while GPS is live. */
  lastFixAt: number | null;
  /** Accepted points, for drawing the route on the receipt. */
  route: RoutePoint[];
  /** Finished waiting periods as [from, to] ms, for the trip record. */
  waitingPeriods: [number, number][];
  /** How GPS ran: 'background' (installed app) or 'foreground' (Expo Go / no permission). */
  trackingMode?: string | null;
  /** Consecutive fixes that agree with each other but are impossibly far from lastPoint. */
  jumpStreak?: number;
  jumpCandidate?: GeoPoint | null;
};

/** Fixes taken more than this long before the hire started are old cached positions. */
export const STALE_FIX_MS = 2_000;
/** After this many agreeing fixes that all disagree with the anchor, the anchor was the bad one. */
export const REANCHOR_AFTER = 3;

/** [latitude, longitude] rounded to ~1 m to keep the saved trip small. */
export type RoutePoint = [number, number];

const toRoutePoint = (p: GeoPoint): RoutePoint => [
  Math.round(p.latitude * 1e5) / 1e5,
  Math.round(p.longitude * 1e5) / 1e5,
];

/** Without a usable fix for this long we can't tell parked from moving, so leave the mode as is. */
export const FIX_STALE_MS = 10_000;

export type Trip = {
  id: string;
  startedAt: number;
  endedAt: number;
  distanceM: number;
  waitingSec: number;
  tariff: Tariff;
  fare: FareBreakdown;
  route: RoutePoint[];
  waitingPeriods: [number, number][];
  /** Filled in when the hire ends, if the phone could look the address up. */
  startAddress?: string | null;
  endAddress?: string | null;
  trackingMode?: string | null;
};

export function newId(): string {
  // RFC 4122 v4 layout; randomness quality is fine for record ids.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function startTrip(tariff: Tariff, now: number): ActiveTrip {
  return {
    id: newId(),
    startedAt: now,
    tariff: { ...tariff },
    distanceM: 0,
    waitingMs: 0,
    waitingSince: null,
    lastPoint: null,
    lastMoveAt: now,
    lastFixAt: null,
    route: [],
    waitingPeriods: [],
  };
}

/**
 * Feed a GPS fix. Real movement adds distance and ends any waiting period;
 * a fix that shows the tuk tuk standing still only refreshes `lastFixAt`.
 */
export function addLocation(trip: ActiveTrip, point: GeoPoint): ActiveTrip {
  // Android often hands over its last known position first, which can be minutes
  // old and far away. Only measure from positions taken during this hire.
  if (point.timestamp < trip.startedAt - STALE_FIX_MS) return trip;

  const step = evaluateStep(trip.lastPoint, point);
  if (step.kind === 'reject') {
    return step.reason === 'speed' ? noteJump(trip, point) : trip;
  }
  // A fix that fits the anchor clears any run of suspected jumps.
  if (trip.jumpStreak) trip = { ...trip, jumpStreak: 0, jumpCandidate: null };

  if (step.kind === 'jitter') {
    // Creeping in traffic: too little distance to count yet, but the speed
    // reading shows it is rolling, so it is not waiting.
    if (trip.lastPoint != null && isRolling(point)) {
      return { ...setWaiting(trip, false, point.timestamp), lastMoveAt: point.timestamp, lastFixAt: point.timestamp };
    }
    return { ...trip, lastFixAt: point.timestamp };
  }

  // The very first fix only sets the anchor; it isn't movement.
  if (trip.lastPoint == null) {
    return { ...trip, lastPoint: point, lastFixAt: point.timestamp, route: [toRoutePoint(point)] };
  }

  const moved = setWaiting(trip, false, point.timestamp);
  return {
    ...moved,
    distanceM: trip.distanceM + step.distanceM,
    lastPoint: point,
    lastMoveAt: point.timestamp,
    lastFixAt: point.timestamp,
    route: [...trip.route, toRoutePoint(point)],
  };
}

/**
 * A fix impossibly far from the anchor. One alone is a GPS glitch and is
 * dropped. But if several in a row agree with each other, the anchor itself
 * was wrong (a bad first fix): move it to where the tuk tuk really is,
 * without charging for the jump.
 */
function noteJump(trip: ActiveTrip, point: GeoPoint): ActiveTrip {
  const prev = trip.jumpCandidate ?? null;
  const agrees = prev != null && evaluateStep(prev, point).kind !== 'reject';
  const streak = agrees ? (trip.jumpStreak ?? 0) + 1 : 1;
  if (streak < REANCHOR_AFTER) return { ...trip, jumpStreak: streak, jumpCandidate: point };

  const routePoint = toRoutePoint(point);
  return {
    ...trip,
    lastPoint: point,
    lastFixAt: point.timestamp,
    jumpStreak: 0,
    jumpCandidate: null,
    // If nothing was driven from the bad anchor yet, drop it from the route too.
    route: trip.distanceM === 0 ? [routePoint] : [...trip.route, routePoint],
  };
}

/** Called every second: start waiting once the tuk tuk has stood still long enough. */
export function tick(trip: ActiveTrip, now: number): ActiveTrip {
  if (trip.waitingSince != null || trip.lastFixAt == null) return trip;
  if (now - trip.lastFixAt > FIX_STALE_MS) return trip;
  const stillMs = trip.tariff.autoWaitAfterSec * 1000;
  if (now - trip.lastMoveAt < stillMs) return trip;
  return setWaiting(trip, true, now);
}

export function setWaiting(trip: ActiveTrip, waiting: boolean, now: number): ActiveTrip {
  if (waiting && trip.waitingSince == null) return { ...trip, waitingSince: now };
  if (!waiting && trip.waitingSince != null) {
    const end = Math.max(trip.waitingSince, now);
    return {
      ...trip,
      waitingMs: trip.waitingMs + (end - trip.waitingSince),
      waitingSince: null,
      waitingPeriods: [...trip.waitingPeriods, [trip.waitingSince, end]],
    };
  }
  return trip;
}

export function waitingSeconds(trip: ActiveTrip, now: number): number {
  const live = trip.waitingSince != null ? Math.max(0, now - trip.waitingSince) : 0;
  return Math.floor((trip.waitingMs + live) / 1000);
}

export function currentFare(trip: ActiveTrip, now: number): FareBreakdown {
  return calculateFare(trip.tariff, trip.distanceM, waitingSeconds(trip, now), trip.startedAt);
}

export function finishTrip(trip: ActiveTrip, now: number): Trip {
  const waitingSec = waitingSeconds(trip, now);
  // Close a waiting period that is still open when the hire ends.
  const { waitingPeriods } = setWaiting(trip, false, now);
  return {
    id: trip.id,
    startedAt: trip.startedAt,
    endedAt: now,
    distanceM: Math.round(trip.distanceM),
    waitingSec,
    tariff: trip.tariff,
    fare: calculateFare(trip.tariff, trip.distanceM, waitingSec, trip.startedAt),
    route: trip.route,
    waitingPeriods,
    trackingMode: trip.trackingMode ?? null,
  };
}
