import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeShiftJIS } from '../src/index.js';

// Byte helpers — keep the byte arrays readable in the tests below.
const b = (...xs) => xs;
const cp = (s) => s.codePointAt(0);
const cpOf = (s, i = 0) => s.codePointAt(i);

test('empty input yields empty string', () => {
  assert.equal(decodeShiftJIS(new Uint8Array([])), '');
  assert.equal(decodeShiftJIS([]), '');
});

test('null and undefined throw TypeError', () => {
  assert.throws(() => decodeShiftJIS(null), TypeError);
  assert.throws(() => decodeShiftJIS(undefined), TypeError);
});

test('ASCII 0x00-0x7F passes through unchanged', () => {
  const input = b(0x48, 0x65, 0x6C, 0x6C, 0x6F); // "Hello"
  assert.equal(decodeShiftJIS(input), 'Hello');
});

test('control characters 0x00-0x1F map to Unicode controls', () => {
  const input = b(0x09, 0x0A, 0x0D); // TAB, LF, CR
  assert.equal(decodeShiftJIS(input), '\t\n\r');
});

test('0x80 (undefined in Shift-JIS) becomes U+FFFD', () => {
  assert.equal(decodeShiftJIS(b(0x80)), '\uFFFD');
});

test('0xA0 (undefined in Shift-JIS) becomes U+FFFD', () => {
  assert.equal(decodeShiftJIS(b(0xA0)), '\uFFFD');
});

test('half-width katakana 0xA1-0xDF decode to U+FF61-U+FF9F', () => {
  // ｡ (0xA1 -> U+FF61), ｱ (0xB1 -> U+FF71), ﾁ (0xC1 -> U+FF81), ﾆ (0xC6 -> U+FF86), ﾟ (0xDF -> U+FF9F)
  const out = decodeShiftJIS(b(0xA1, 0xB1, 0xC1, 0xC6, 0xDF));
  assert.equal(out, '｡ｱﾁﾆﾟ');
});

test('full-width digits 0-9 via 0x824F-0x8258', () => {
  const input = b(0x82, 0x4F, 0x82, 0x50, 0x82, 0x58);
  const out = decodeShiftJIS(input);
  assert.equal(out, '０１９');
  assert.equal(cpOf(out, 0), 0xFF10);
});

test('full-width A (0x8260) -> U+FF21', () => {
  const out = decodeShiftJIS(b(0x82, 0x60));
  assert.equal(out, 'Ａ');
  assert.equal(cpOf(out, 0), 0xFF21);
});

test('kanji 亜 via 0x889F -> U+4E9C', () => {
  const out = decodeShiftJIS(b(0x88, 0x9F));
  assert.equal(out, '亜');
  assert.equal(cpOf(out, 0), 0x4E9C);
});

test('truncated lead byte at end of stream -> U+FFFD', () => {
  assert.equal(decodeShiftJIS(b(0x82)), '\uFFFD');
  assert.equal(decodeShiftJIS(b(0xE0)), '\uFFFD');
});

test('lead byte followed by illegal trail (0x7F) -> U+FFFD, then continue', () => {
  // 0x82 0x7F 0x41: 0x82 is a lead, 0x7F is not a valid trail, so we emit
  // U+FFFD for the 0x82 alone, then decode 0x7F as ASCII DEL, then 'A'.
  const out = decodeShiftJIS(b(0x82, 0x7F, 0x41));
  assert.equal(out, '\uFFFD\x7FA');
});

test('lead byte followed by end-of-stream trail -> U+FFFD, then stop', () => {
  // 0x82 at the very end: only the lead is consumed, output is one U+FFFD.
  assert.equal(decodeShiftJIS(b(0x41, 0x82)), 'A\uFFFD');
});

test('unmapped two-byte pair -> U+FFFD', () => {
  // 0x82 0x80: 0x80 is a legal trail byte (>= 0x80) but the pair (0x82,0x80)
  // is not in our JIS_X_0208 map, so the decoder returns U+FFFD.
  assert.equal(decodeShiftJIS(b(0x82, 0x80)), '\uFFFD');
});

test('mixed ASCII, half-width kana, and full-width digits round-trip', () => {
  // 'A' + ｡ + ０ + 亜
  const input = b(0x41, 0xA1, 0x82, 0x4F, 0x88, 0x9F);
  const out = decodeShiftJIS(input);
  assert.equal(out, 'A｡０亜');
});

test('accepts Uint8Array, Int8Array, and plain array', () => {
  const want = '０';
  assert.equal(decodeShiftJIS(new Uint8Array([0x82, 0x4F])), want);
  assert.equal(decodeShiftJIS(new Int8Array([0x82, 0x4F])), want);
  assert.equal(decodeShiftJIS([0x82, 0x4F]), want);
});

test('bytes > 0xFF are masked to their low 8 bits', () => {
  // The decoder masks with 0xFF, so 0x142 behaves as 0x42 ('B').
  assert.equal(decodeShiftJIS([0x142]), 'B');
});
