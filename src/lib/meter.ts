import { calculateFare, type FareBreakdown, type Tariff } from './fare.ts';
import { evaluateStep, type GeoPoint } from './geo.ts';

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
};

export type Trip = {
  id: string;
  startedAt: number;
  endedAt: number;
  distanceM: number;
  waitingSec: number;
  tariff: Tariff;
  fare: FareBreakdown;
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
  };
}

export function addLocation(trip: ActiveTrip, point: GeoPoint): ActiveTrip {
  const step = evaluateStep(trip.lastPoint, point);
  if (step.kind !== 'accept') return trip;
  return { ...trip, distanceM: trip.distanceM + step.distanceM, lastPoint: point };
}

export function setWaiting(trip: ActiveTrip, waiting: boolean, now: number): ActiveTrip {
  if (waiting && trip.waitingSince == null) return { ...trip, waitingSince: now };
  if (!waiting && trip.waitingSince != null) {
    return { ...trip, waitingMs: trip.waitingMs + Math.max(0, now - trip.waitingSince), waitingSince: null };
  }
  return trip;
}

export function waitingSeconds(trip: ActiveTrip, now: number): number {
  const live = trip.waitingSince != null ? Math.max(0, now - trip.waitingSince) : 0;
  return Math.floor((trip.waitingMs + live) / 1000);
}

export function currentFare(trip: ActiveTrip, now: number): FareBreakdown {
  return calculateFare(trip.tariff, trip.distanceM, waitingSeconds(trip, now));
}

export function finishTrip(trip: ActiveTrip, now: number): Trip {
  const waitingSec = waitingSeconds(trip, now);
  return {
    id: trip.id,
    startedAt: trip.startedAt,
    endedAt: now,
    distanceM: Math.round(trip.distanceM),
    waitingSec,
    tariff: trip.tariff,
    fare: calculateFare(trip.tariff, trip.distanceM, waitingSec),
  };
}
