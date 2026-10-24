/**
 * Printing-ref grammar.
 *
 * A printed ref is a live set code plus a collector number: `TEF-130`,
 * `SHF:SV-001`, `30C-4`. Live codes are not unique by themselves; resolving one
 * to a set is the catalog's job. This module only owns the text rules, so the
 * parser, catalog, format checks, and renderer agree on what a ref is.
 */

import type { CardRef } from "./types.js";

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

/** A ref at the end of a card line. Set codes are uppercase; numbers contain a digit. */
const REF_SUFFIX = /\s+([A-Z0-9][A-Z0-9:]+)\s+([A-Z0-9]*\d[A-Z0-9]*)$/u;

export type RefSuffix =
  | { readonly kind: "none"; readonly name: string }
  | { readonly kind: "ref"; readonly name: string; readonly ref: CardRef }
  | { readonly kind: "empty-name"; readonly ref: CardRef };

/**
 * Split the optional printing ref from a card line's name. The set code must
 * contain an uppercase letter so `4 Mew 151` stays a name, not set `151`.
 */
export function splitRefSuffix(value: string): RefSuffix {
  const suffix = REF_SUFFIX.exec(value);
  if (suffix === null) return { kind: "none", name: value };

  const setCode = suffix[1];
  const number = suffix[2];
  if (setCode === undefined || number === undefined || !/[A-Z]/u.test(setCode)) {
    return { kind: "none", name: value };
  }

  const name = value.slice(0, suffix.index).trim();
  if (name === "") return { kind: "empty-name", ref: { number, setCode } };
  return { kind: "ref", name, ref: { number, setCode } };
}

/** `TWM-130` prints as `TWM 130`; a ref with no hyphen is left alone. */
export function printableRef(ref: string): string {
  const separator = ref.lastIndexOf("-");
  if (separator <= 0) return ref;
  return `${ref.slice(0, separator)} ${ref.slice(separator + 1)}`;
}


