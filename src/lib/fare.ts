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
