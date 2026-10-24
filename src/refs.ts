/**
 * Printing-ref grammar.
 *
 * A printed ref is a live set code plus a collector number: `TEF-130`,
 * `SHF:SV-001`, `30C-4`. Live codes are not unique by themselves; resolving one
 * to a set is the catalog's job. This module only owns the text rules, so the
 * parser, catalog, format checks, and renderer agree on what a ref is.
 */

const NUMERIC = /^\d+$/u;

/** Live codes are case-insensitive on input and uppercase on output. */
export function normalizeSetCode(value: string): string {
  return value.trim().toUpperCase();
}

/** Live prints numeric local ids without leading zeroes; promos keep their suffix. */
export function normalizeNumber(value: string): string {
  const trimmed = value.trim();
  const number = NUMERIC.test(trimmed) ? trimmed.replace(/^0+(?=\d)/u, "") : trimmed;
  return number.toUpperCase();
}

/** `TEF-130` -> `TEF`; gallery codes such as `BRS:TG` stay intact. */
export function setCodeOf(ref: string): string {
  const dash = ref.lastIndexOf("-");
  return dash === -1 ? ref : ref.slice(0, dash);
}

/** `TWM-130` prints as `TWM 130`; a ref with no hyphen is left alone. */
export function printableRef(ref: string): string {
  const separator = ref.lastIndexOf("-");
  if (separator <= 0) return ref;
  return `${ref.slice(0, separator)} ${ref.slice(separator + 1)}`;
}


