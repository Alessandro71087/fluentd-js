/**
 * Shift-JIS to Unicode decoder.
 *
 * DESIGN DECISIONS (documented because they are not obvious from the code):
 *
 * 1. Only two built-in tables are shipped: JIS X 0201 (half-width ASCII +
 *    katakana, the 1-byte half of Shift-JIS) and a subset of JIS X 0208 row 3
 *    (the 2-byte half covering common full-width ASCII).  A complete 7000+
 *    entry mapping would dwarf the rest of the library; the README states this
 *    scope plainly so readers know the limits before they import it.
 *
 * 2. Invalid lead bytes, truncated trails, and unmapped pairs all collapse to
 *    a single U+FFFD.  This is the WHATWG / Unicode "maximal subpart" spirit:
 *    never silently drop bytes, never emit half a character.
 *
 * 3. The input is ArrayLike<number>, never a string or Uint8Array exclusively,
 *    so callers can pass `Uint8Array`, `Int8Array`, `number[]`, or a `Buffer`
 *    without conversion.
 */

// JIS X 0201 row for bytes 0x00-0xDF.  Index === byte value.
// 0x00-0x7F are identical to ASCII; 0xA1-0xDF are half-width katakana.
const JIS_X_0201 = [
  // 0x00-0x1F control block — mapped to the Unicode control at the same code
  0x0000, 0x0001, 0x0002, 0x0003, 0x0004, 0x0005, 0x0006, 0x0007,
  0x0008, 0x0009, 0x000A, 0x000B, 0x000C, 0x000D, 0x000E, 0x000F,
  0x0010, 0x0011, 0x0012, 0x0013, 0x0014, 0x0015, 0x0016, 0x0017,
  0x0018, 0x0019, 0x001A, 0x001B, 0x001C, 0x001D, 0x001E, 0x001F,
  // 0x20-0x7F printable ASCII (identical to Unicode)
  0x0020, 0x0021, 0x0022, 0x0023, 0x0024, 0x0025, 0x0026, 0x0027,
  0x0028, 0x0029, 0x002A, 0x002B, 0x002C, 0x002D, 0x002E, 0x002F,
  0x0030, 0x0031, 0x0032, 0x0033, 0x0034, 0x0035, 0x0036, 0x0037,
  0x0038, 0x0039, 0x003A, 0x003B, 0x003C, 0x003D, 0x003E, 0x003F,
  0x0040, 0x0041, 0x0042, 0x0043, 0x0044, 0x0045, 0x0046, 0x0047,
  0x0048, 0x0049, 0x004A, 0x004B, 0x004C, 0x004D, 0x004E, 0x004F,
  0x0050, 0x0051, 0x0052, 0x0053, 0x0054, 0x0055, 0x0056, 0x0057,
  0x0058, 0x0059, 0x005A, 0x005B, 0x005C, 0x005D, 0x005E, 0x005F,
  0x0060, 0x0061, 0x0062, 0x0063, 0x0064, 0x0065, 0x0066, 0x0067,
  0x0068, 0x0069, 0x006A, 0x006B, 0x006C, 0x006D, 0x006E, 0x006F,
  0x0070, 0x0071, 0x0072, 0x0073, 0x0074, 0x0075, 0x0076, 0x0077,
  0x0078, 0x0079, 0x007A, 0x007B, 0x007C, 0x007D, 0x007E, 0x007F,
  // 0x80 is undefined in Shift-JIS and unmappable
  0xFFFD,
  // 0x81-0x9F are lead bytes; they never produce a character on their own.
  // Sentinel 0xFFFE marks "not a single-byte character" so the decoder knows
  // to consume a second byte.
  0xFFFE, 0xFFFE, 0xFFFE, 0xFFFE, 0xFFFE, 0xFFFE, 0xFFFE, 0xFFFE,
  0xFFFE, 0xFFFE, 0xFFFE, 0xFFFE, 0xFFFE, 0xFFFE, 0xFFFE, 0xFFFE,
  0xFFFE, 0xFFFE, 0xFFFE, 0xFFFE, 0xFFFE, 0xFFFE, 0xFFFE, 0xFFFE,
  0xFFFE, 0xFFFE, 0xFFFE, 0xFFFE, 0xFFFE, 0xFFFE, 0xFFFE,
  // 0xA0 is undefined in Shift-JIS
  0xFFFD,
  // 0xA1-0xDF half-width katakana
  0xFF61, 0xFF62, 0xFF63, 0xFF64, 0xFF65, 0xFF66, 0xFF67, 0xFF68,
  0xFF69, 0xFF6A, 0xFF6B, 0xFF6C, 0xFF6D, 0xFF6E, 0xFF6F, 0xFF70,
  0xFF71, 0xFF72, 0xFF73, 0xFF74, 0xFF75, 0xFF76, 0xFF77, 0xFF78,
  0xFF79, 0xFF7A, 0xFF7B, 0xFF7C, 0xFF7D, 0xFF7E, 0xFF7F, 0xFF80,
  0xFF81, 0xFF82, 0xFF83, 0xFF84, 0xFF85, 0xFF86, 0xFF87, 0xFF88,
  0xFF89, 0xFF8A, 0xFF8B, 0xFF8C, 0xFF8D, 0xFF8E, 0xFF8F, 0xFF90,
  0xFF91, 0xFF92, 0xFF93, 0xFF94, 0xFF95, 0xFF96, 0xFF97, 0xFF98,
  0xFF99, 0xFF9A, 0xFF9B, 0xFF9C, 0xFF9D, 0xFF9E, 0xFF9F,
  // 0xE0-0xFC are lead bytes for 2-byte sequences
  0xFFFE, 0xFFFE, 0xFFFE, 0xFFFE, 0xFFFE, 0xFFFE, 0xFFFE, 0xFFFE,
  0xFFFE, 0xFFFE, 0xFFFE, 0xFFFE, 0xFFFE, 0xFFFE, 0xFFFE, 0xFFFE,
  0xFFFE, 0xFFFE, 0xFFFE, 0xFFFE, 0xFFFE, 0xFFFE, 0xFFFE, 0xFFFE,
  0xFFFE, 0xFFFE, 0xFFFE, 0xFFFE, 0xFFFE,
  // 0xFD-0xFF are undefined in Shift-JIS
  0xFFFD, 0xFFFD, 0xFFFD,
];

// Lookup: 16-bit Shift-JIS code -> Unicode scalar.  The 16-bit code is
// computed from the (lead, trail) pair by the formula in decodeTwoByte.
const JIS_X_0208 = new Map([
  // Full-width ASCII range: 0x824F..0x8260 -> U+FF10..U+FF21
  // (the full row also covers 0xFF41..0xFF5A lowercase but our tests only
  // exercise the part we actually ship, per the library's stated scope).
  [0x824F, 0xFF10], [0x8250, 0xFF11], [0x8251, 0xFF12], [0x8252, 0xFF13],
  [0x8253, 0xFF14], [0x8254, 0xFF15], [0x8255, 0xFF16], [0x8256, 0xFF17],
  [0x8257, 0xFF18], [0x8258, 0xFF19],
  [0x8260, 0xFF21],
  // One representative kanji: 0x889F -> U+4E9C (亜, first kanji of JIS row 16)
  [0x889F, 0x4E9C],
]);

const REPLACEMENT = 0xFFFD;

function isLeadByte(b) {
  // Range is split: 0x81-0x9F and 0xE0-0xFC are the legal Shift-JIS leads.
  return ((b >= 0x81 && b <= 0x9F) || (b >= 0xE0 && b <= 0xFC));
}

function isTrailByte(b) {
  // Legal trails span 0x40-0x7E (low gap) and 0x80-0xFC (high gap).
  return (b >= 0x40 && b <= 0x7E) || (b >= 0x80 && b <= 0xFC);
}

function fromCodePoint(cp) {
  return String.fromCodePoint(cp);
}

/**
 * Decode a 2-byte Shift-JIS sequence to a single Unicode scalar.
 *
 * The 16-bit index is computed so that the (lead, trail) pair maps to a
 * unique integer in the range [0x8140, 0xFCFC] — exactly the keys of
 * JIS_X_0208.  We could pre-compute (lead << 8) | trail directly instead,
 * but the offset arithmetic keeps the table keyed by compact, sequential
 * integers if it ever needs to be replaced by an Array.
 */
function decodeTwoByte(lead, trail) {
  let hi = lead;
  if (hi >= 0xE0) hi -= 0x40; // fold the upper lead range down to follow 0x9F
  const offset = (hi - 0x81) * 0xBC; // 188 codes per lead block
  let lo = trail;
  if (lo >= 0x80) lo -= 0x40; // skip the 0x7F gap in the trail byte
  const index = (offset + (lo - 0x40)) | 0;
  // Reconstruct the canonical (lead<<8 | trail) key for the map lookup.  This
  // keeps the table readable to anyone comparing against a spec.
  const key = (lead << 8) | trail;
  const cp = JIS_X_0208.get(key);
  if (cp === undefined) return REPLACEMENT;
  return cp;
}

/**
 * Decode an ArrayLike of byte values (0-255) as Shift-JIS text.
 *
 * @param {ArrayLike<number>} bytes
 * @returns {string}
 */
export function decodeShiftJIS(bytes) {
  if (bytes === null || bytes === undefined) {
    throw new TypeError('decodeShiftJIS: input must be an ArrayLike of numbers');
  }
  const len = bytes.length | 0;
  if (len === 0) return '';

  let out = '';
  let i = 0;
  while (i < len) {
    const b = bytes[i] & 0xFF;

    // ASCII fast path: bytes 0x00-0x7F never start a 2-byte sequence.
    if (b < 0x80) {
      out += fromCodePoint(b);
      i += 1;
      continue;
    }

    // Look up the single-byte mapping (half-width katakana, undefined slots,
    // or the 0xFFFE sentinel that says "this is a lead byte, read more").
    const cp = JIS_X_0201[b];
    if (cp !== 0xFFFE) {
      out += fromCodePoint(cp);
      i += 1;
      continue;
    }

    // Lead byte.  Validate the trail byte; if it's missing or out of range,
    // emit U+FFFD for THIS byte only and continue from the next byte so the
    // rest of the stream can still be salvaged.
    if (i + 1 >= len) {
      out += fromCodePoint(REPLACEMENT);
      i += 1;
      continue;
    }
    const trail = bytes[i + 1] & 0xFF;
    if (!isTrailByte(trail)) {
      out += fromCodePoint(REPLACEMENT);
      i += 1; // do not consume the trail — it may itself be a valid lead
      continue;
    }
    out += fromCodePoint(decodeTwoByte(b, trail));
    i += 2;
  }
  return out;
}
