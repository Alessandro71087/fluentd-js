/**
 * Public entry point for fluentd-js.
 *
 * The library exposes one function, `decodeShiftJIS`, which accepts an
 * ArrayLike of byte values (0-255) and returns a fully-fledged JavaScript
 * string.  Characters that cannot be mapped because the byte sequence is
 * malformed or represents an unmapped code point are replaced with U+FFFD.
 */
export { decodeShiftJIS } from './core.js';
