/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_TARIFF } from '../fare.ts';
import type { GeoPoint } from '../geo.ts';
import { addLocation, finishTrip, setWaiting, startTrip, waitingSeconds } from '../meter.ts';

// ~111 m per 0.001 deg of latitude.
const pt = (lat: number, t: number, accuracy = 5): GeoPoint => ({
  latitude: lat,
  longitude: 79.86,
  accuracy,
  timestamp: t,
});

test('accumulates distance from GPS fixes', () => {
  let trip = startTrip(DEFAULT_TARIFF, 0);
  trip = addLocation(trip, pt(6.9, 0));
  trip = addLocation(trip, pt(6.901, 10_000));
  trip = addLocation(trip, pt(6.902, 20_000));
  assert.ok(Math.abs(trip.distanceM - 222.4) < 1, `got ${trip.distanceM}`);
});

test('ignores jitter while parked but keeps slow movement', () => {
  let trip = startTrip(DEFAULT_TARIFF, 0);
  trip = addLocation(trip, pt(6.9, 0));
  // 3 m wobble, repeated, should not add distance.
  for (let i = 1; i <= 10; i++) trip = addLocation(trip, pt(6.9 + (i % 2) * 0.000027, i * 1000));
  assert.equal(trip.distanceM, 0);
  // Creeping 5 m at a time adds up once the anchor is 8 m+ away.
  for (let i = 1; i <= 4; i++) trip = addLocation(trip, pt(6.9 + i * 0.000045, 20_000 + i * 2000));
  assert.ok(trip.distanceM > 15, `got ${trip.distanceM}`);
});

test('rejects inaccurate fixes and impossible jumps', () => {
  let trip = startTrip(DEFAULT_TARIFF, 0);
  trip = addLocation(trip, pt(6.9, 0));
  trip = addLocation(trip, pt(6.91, 1000, 200)); // poor accuracy
  trip = addLocation(trip, pt(6.92, 2000)); // 2.2 km in 2 s
  assert.equal(trip.distanceM, 0);
});

test('waiting time accumulates across periods', () => {
  let trip = startTrip(DEFAULT_TARIFF, 0);
  trip = setWaiting(trip, true, 10_000);
  trip = setWaiting(trip, false, 70_000);
  trip = setWaiting(trip, true, 100_000);
  assert.equal(waitingSeconds(trip, 130_000), 90);
  const done = finishTrip(trip, 160_000);
  assert.equal(done.waitingSec, 120);
  assert.equal(done.fare.waitingCharge, 10);
});
