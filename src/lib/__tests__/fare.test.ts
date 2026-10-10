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
