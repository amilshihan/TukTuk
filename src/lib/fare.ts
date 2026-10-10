export type Tariff = {
  /** Flat "flag fall" charge; covers the first `baseDistanceKm`. */
  baseFare: number;
  baseDistanceKm: number;
  /** Charged for every km after the base distance. */
  perKm: number;
  /** Charged for every minute of waiting after `freeWaitingMinutes`. */
  waitingPerMinute: number;
  freeWaitingMinutes: number;
  /** Waiting starts by itself after the tuk tuk stands still this long. */
  autoWaitAfterSec: number;
  /** Total is rounded to the nearest multiple of this (1 = no rounding). */
  roundTo: number;
  currency: string;
  /** Extra % on hires that start at night; 0 turns the night rate off. */
  nightPercent: number;
  /** Local hours, 0–23. The window may wrap past midnight (22 → 5). */
  nightStartHour: number;
  nightEndHour: number;
};

export const DEFAULT_TARIFF: Tariff = {
  baseFare: 100,
  baseDistanceKm: 1,
  perKm: 85,
  waitingPerMinute: 5,
  freeWaitingMinutes: 0,
  autoWaitAfterSec: 5,
  roundTo: 10,
  currency: 'Rs',
  nightPercent: 0,
  nightStartHour: 22,
  nightEndHour: 5,
};

export type FareBreakdown = {
  baseFare: number;
  distanceCharge: number;
  waitingCharge: number;
  nightCharge: number;
  total: number;
};

/** Whether a hire starting at `startedAt` (ms) is charged the night rate. */
export function isNightHire(tariff: Tariff, startedAt: number): boolean {
  if (tariff.nightPercent <= 0 || tariff.nightStartHour === tariff.nightEndHour) return false;
  const h = new Date(startedAt).getHours();
  const { nightStartHour: from, nightEndHour: to } = tariff;
  return from < to ? h >= from && h < to : h >= from || h < to;
}

export function calculateFare(
  tariff: Tariff,
  distanceM: number,
  waitingSec: number,
  startedAt?: number,
): FareBreakdown {
  const km = Math.max(0, distanceM) / 1000;
  const extraKm = Math.max(0, km - tariff.baseDistanceKm);
  const distanceCharge = extraKm * tariff.perKm;

  // Waiting is billed per started minute once the free allowance is used up.
  const billableSec = Math.max(0, waitingSec - tariff.freeWaitingMinutes * 60);
  const waitingCharge = Math.ceil(billableSec / 60) * tariff.waitingPerMinute;

  const subtotal = tariff.baseFare + distanceCharge + waitingCharge;
  const night = startedAt != null && isNightHire(tariff, startedAt);
  const nightCharge = night ? (subtotal * tariff.nightPercent) / 100 : 0;

  const step = tariff.roundTo > 0 ? tariff.roundTo : 1;
  const total = Math.round((subtotal + nightCharge) / step) * step;

  return {
    baseFare: tariff.baseFare,
    distanceCharge: round2(distanceCharge),
    waitingCharge: round2(waitingCharge),
    nightCharge: round2(nightCharge),
    total,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Extra road distance in heavy traffic (detours, missed turns), as a fraction of the route. */
export const ESTIMATE_DETOUR = 0.1;
/** In heavy traffic the tuk tuk stands still for roughly this share of the free-flow driving time. */
export const ESTIMATE_TRAFFIC_STOP = 0.6;
/** With live traffic known, allow this share of free-flow time on top of the current delay for things getting worse. */
export const ESTIMATE_TRAFFIC_BUFFER = 0.3;

/**
 * Fare range for a planned route before the hire starts.
 * Low: the route driven with no waiting. High: a little extra distance and
 * stop-and-go traffic billed as waiting: the live traffic delay plus a buffer
 * when the route service knows current traffic, otherwise a typical heavy-traffic
 * share. Real fares can go above this in extreme conditions (long jams, road
 * closures, extra stops).
 */
export function estimateFare(
  tariff: Tariff,
  routeDistanceM: number,
  routeDurationSec: number,
  at: number,
  trafficDurationSec?: number,
): { low: number; high: number } {
  const jamSec =
    trafficDurationSec != null
      ? Math.max(0, trafficDurationSec - routeDurationSec) + routeDurationSec * ESTIMATE_TRAFFIC_BUFFER
      : routeDurationSec * ESTIMATE_TRAFFIC_STOP;
  const low = calculateFare(tariff, routeDistanceM, 0, at).total;
  const high = calculateFare(
    tariff,
    routeDistanceM * (1 + ESTIMATE_DETOUR),
    jamSec,
    at,
  ).total;
  // Round outwards to friendly numbers: Rs 850 – 1,050 rather than Rs 865 – 1,025.
  const step = high >= 500 ? 50 : 10;
  const lo = Math.max(tariff.baseFare, Math.floor(low / step) * step);
  const hi = Math.max(lo + step, Math.ceil(high / step) * step);
  return { low: lo, high: hi };
}

export function formatMoney(amount: number, currency: string): string {
  const fixed = Number.isInteger(amount) ? amount.toFixed(0) : amount.toFixed(2);
  return `${currency} ${fixed.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

export function formatKm(distanceM: number): string {
  return (distanceM / 1000).toFixed(2);
}

export function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
