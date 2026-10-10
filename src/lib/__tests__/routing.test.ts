/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodePolyline } from '../routing.ts';

test('decodes the reference Google polyline (precision 5)', () => {
  // Example from Google's encoded polyline documentation.
  assert.deepEqual(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@', 5), [
    [38.5, -120.2],
    [40.7, -120.95],
    [43.252, -126.453],
  ]);
});

function encode(points: [number, number][], precision: number): string {
  const factor = 10 ** precision;
  let out = '';
  let prev = [0, 0];
  for (const p of points) {
    const cur = [Math.round(p[0] * factor), Math.round(p[1] * factor)];
    for (const i of [0, 1]) {
      let v = cur[i] - prev[i];
      v = v < 0 ? ~(v << 1) : v << 1;
      while (v >= 0x20) {
        out += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
        v >>= 5;
      }
      out += String.fromCharCode(v + 63);
    }
    prev = cur;
  }
  return out;
}

test('round-trips Sri Lankan coordinates at precision 6 (Valhalla)', () => {
  const pts: [number, number][] = [
    [6.934412, 79.847812],
    [6.927079, 79.861244],
    [6.860011, 79.907023],
  ];
  assert.deepEqual(decodePolyline(encode(pts, 6), 6), pts);
});
