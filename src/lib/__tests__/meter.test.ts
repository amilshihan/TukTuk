/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_TARIFF } from '../fare.ts';
import type { GeoPoint } from '../geo.ts';
import { addLocation, finishTrip, setWaiting, startTrip, tick, waitingSeconds, type ActiveTrip } from '../meter.ts';

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

// Drive the meter like the app does: one GPS fix and one tick per second.
function run(trip: ActiveTrip, fromSec: number, toSec: number, latAt: (s: number) => number): ActiveTrip {
  for (let s = fromSec; s <= toSec; s++) {
    trip = addLocation(trip, pt(latAt(s), s * 1000));
    trip = tick(trip, s * 1000);
  }
  return trip;
}

test('waiting starts by itself after standing still for the set seconds', () => {
  let trip = startTrip({ ...DEFAULT_TARIFF, autoWaitAfterSec: 5 }, 0);
  trip = run(trip, 0, 4, () => 6.9);
  assert.equal(trip.waitingSince, null, 'not yet: only 4 s still');
  trip = run(trip, 5, 5, () => 6.9);
  assert.equal(trip.waitingSince, 5000);
  trip = run(trip, 6, 65, () => 6.9);
  assert.equal(waitingSeconds(trip, 65_000), 60);
  assert.equal(trip.distanceM, 0);
});

test('moving ends waiting and distance counts again', () => {
  let trip = startTrip({ ...DEFAULT_TARIFF, autoWaitAfterSec: 5 }, 0);
  trip = run(trip, 0, 20, () => 6.9); // waiting from 5 s
  // Drive ~11 m/s north for 30 s.
  trip = run(trip, 21, 50, (s) => 6.9 + (s - 20) * 0.0001);
  assert.equal(trip.waitingSince, null);
  assert.equal(waitingSeconds(trip, 50_000), 16); // 5 s -> 21 s
  assert.ok(trip.distanceM > 300, `got ${trip.distanceM}`);
});

test('short stops under the threshold are not waiting', () => {
  let trip = startTrip({ ...DEFAULT_TARIFF, autoWaitAfterSec: 30 }, 0);
  trip = run(trip, 0, 10, (s) => 6.9 + s * 0.0001);
  trip = run(trip, 11, 30, () => 6.9 + 10 * 0.0001); // 20 s stop
  trip = run(trip, 31, 40, (s) => 6.9 + (s - 20) * 0.0001);
  assert.equal(waitingSeconds(trip, 40_000), 0);
});

test('parked GPS drift with zero speed does not end waiting', () => {
  let trip = startTrip({ ...DEFAULT_TARIFF, autoWaitAfterSec: 5 }, 0);
  trip = run(trip, 0, 10, () => 6.9);
  // 11 m wobble, speed 0: drift, not driving.
  for (let s = 11; s <= 30; s++) {
    trip = addLocation(trip, { ...pt(6.9 + (s % 2) * 0.0001, s * 1000), speed: 0 });
    trip = tick(trip, s * 1000);
  }
  assert.notEqual(trip.waitingSince, null);
  assert.equal(trip.distanceM, 0);
});

test('no waiting is charged while there is no GPS fix', () => {
  let trip = startTrip({ ...DEFAULT_TARIFF, autoWaitAfterSec: 5 }, 0);
  for (let s = 0; s <= 60; s++) trip = tick(trip, s * 1000);
  assert.equal(waitingSeconds(trip, 60_000), 0);
});
