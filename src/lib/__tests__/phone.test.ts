/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatMobile, normalizeMobile, normalizeWhatsApp } from '../phone.ts';

test('normalises common Sri Lankan mobile formats', () => {
  for (const input of ['0771234567', '771234567', '+94771234567', '94771234567', '0094 77 123 4567', '077-123-4567']) {
    assert.equal(normalizeMobile(input), '94771234567', input);
  }
});

test('rejects non-mobile and malformed numbers', () => {
  for (const input of ['', '0112345678', '07712345', '077123456789', 'abc']) {
    assert.equal(normalizeMobile(input), null, input);
  }
});

test('formats for display', () => {
  assert.equal(formatMobile('94771234567'), '077 123 4567');
});

test('WhatsApp numbers: local Sri Lankan and international', () => {
  assert.equal(normalizeWhatsApp('0771234567'), '94771234567');
  assert.equal(normalizeWhatsApp('+94 77 123 4567'), '94771234567');
  assert.equal(normalizeWhatsApp('+44 7911 123456'), '447911123456');
  assert.equal(normalizeWhatsApp('0049 1512 3456789'), '4915123456789');
  for (const bad of ['', '12345', '+0123456789', '+94 11 234 5678', 'hello']) {
    assert.equal(normalizeWhatsApp(bad), null, bad);
  }
});
