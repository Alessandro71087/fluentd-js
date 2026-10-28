# fluentd-js

Decodes Shift-JIS byte sequences into JavaScript strings using built-in character tables — no runtime dependencies, no native bindings, no `TextDecoder` required.

## Usage

```js
import { decodeShiftJIS } from 'fluentd-js';

const bytes = [0x82, 0x4F, 0x82, 0x50, 0x82, 0x58]; // ０１９
const text = decodeShiftJIS(bytes);
// text === '０１９'
```

The function accepts any `ArrayLike<number>` — `Uint8Array`, `Int8Array`, `number[]`, or a Node `Buffer` all work. Bytes outside 0x00-0xFF are masked to their low 8 bits.

## Why this exists

`TextDecoder('shift_jis')` is missing from many JavaScript runtimes (notably older Node builds and some edge runtimes), and the few npm packages that fill the gap either bundle encoding data that pulls in dozens of transitive dependencies or expose a sprawling streaming API when all you want is `bytes -> string`. `fluentd-js` is a single function with a focused, audited mapping table.

The trade-off: **the built-in table is deliberately small.** It covers JIS X 0201 in full (ASCII + half-width katakana) and a representative slice of JIS X 0208 row 3 (full-width ASCII digits and letters) plus the first kanji of row 16 (`亜`). It does **not** ship the full 7,000-entry kanji table. If you decode text outside that range, the unmapped two-byte pair collapses to `U+FFFD`. This keeps the source readable and dependency-free; for full Shift-JIS coverage, use a runtime that ships `TextDecoder('shift_jis')`.

## The awkward edge

Malformed sequences do not throw. A lone lead byte at end-of-stream, a lead byte followed by an illegal trail byte, or a two-byte pair that simply isn't in the table all produce `U+FFFD` and the decoder continues from the next byte. This matches the WHATWG replacement-character behaviour and means a single corrupted byte won't discard the rest of the stream — but it also means you cannot distinguish "corrupt input" from "legal byte that happens to be unmapped" from the output alone.
