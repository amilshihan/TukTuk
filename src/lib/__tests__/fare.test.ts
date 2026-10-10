/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateFare, DEFAULT_TARIFF, formatDuration, formatMoney, type Tariff } from '../fare.ts';

const exact: Tariff = { ...DEFAULT_TARIFF, roundTo: 1 };

test('base fare covers the first km', () => {
  assert.equal(calculateFare(exact, 0, 0).total, 100);
  assert.equal(calculateFare(exact, 1000, 0).total, 100);
});

test('distance beyond base km is charged per km', () => {
  const f = calculateFare(exact, 3500, 0);
  assert.equal(f.distanceCharge, 212.5);
  assert.equal(f.total, 313); // 312.5 rounded
});

test('waiting is charged per started minute', () => {
  assert.equal(calculateFare(exact, 0, 1).waitingCharge, 5);
  assert.equal(calculateFare(exact, 0, 60).waitingCharge, 5);
  assert.equal(calculateFare(exact, 0, 61).waitingCharge, 10);
  assert.equal(calculateFare(exact, 0, 30 * 60).waitingCharge, 150);
});

test('free waiting minutes are not charged', () => {
  const t = { ...exact, freeWaitingMinutes: 5 };
  assert.equal(calculateFare(t, 0, 5 * 60).waitingCharge, 0);
  assert.equal(calculateFare(t, 0, 6 * 60).waitingCharge, 5);
});

test('total rounds to the configured step', () => {
  // 100 + 1.5 * 85 = 227.5 -> 230
  assert.equal(calculateFare(DEFAULT_TARIFF, 2500, 0).total, 230);
});

test('formatting helpers', () => {
  assert.equal(formatMoney(1250, 'Rs'), 'Rs 1,250');
  assert.equal(formatDuration(65), '01:05');
  assert.equal(formatDuration(3725), '1:02:05');
});

test('night rate applies to hires starting inside a window that wraps midnight', () => {
  const t: Tariff = { ...exact, nightPercent: 20, nightStartHour: 22, nightEndHour: 5 };
  const at = (h: number) => new Date(2026, 0, 1, h, 30).getTime();
  // 100 base + 2 km * 85 = 270, +20% = 324
  assert.equal(calculateFare(t, 3000, 0, at(23)).total, 324);
  assert.equal(calculateFare(t, 3000, 0, at(23)).nightCharge, 54);
  assert.equal(calculateFare(t, 3000, 0, at(2)).total, 324);
  assert.equal(calculateFare(t, 3000, 0, at(5)).total, 270);
  assert.equal(calculateFare(t, 3000, 0, at(12)).total, 270);
});

test('night rate is off at 0% and for a non-wrapping window outside its hours', () => {
  assert.equal(calculateFare({ ...exact, nightPercent: 0 }, 3000, 0, new Date(2026, 0, 1, 23).getTime()).nightCharge, 0);
  const t: Tariff = { ...exact, nightPercent: 50, nightStartHour: 1, nightEndHour: 4 };
  assert.equal(calculateFare(t, 0, 0, new Date(2026, 0, 1, 2).getTime()).total, 150);
  assert.equal(calculateFare(t, 0, 0, new Date(2026, 0, 1, 4).getTime()).total, 100);
});
