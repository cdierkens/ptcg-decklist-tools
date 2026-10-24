/**
 * Error types.
 *
 * Every error is a plain `Error` subclass carrying a literal `_tag`. Primary
 * exports return them in the error arm of a `Result`; `unwrapOrThrow` turns a
 * `Result` back into a throw for callers who prefer `try/catch`.
 *
 * The `_tag` values are part of the public API.
 */

/** Fatal parse failures. Everything else is a `DecklistWarning`. */
export type DecklistErrorCode = "empty-input" | "no-entries";

/** The input could not be read as a decklist at all. */
export class DecklistError extends Error {
  readonly _tag = "DecklistError" as const;
  readonly code: DecklistErrorCode;

  constructor(code: DecklistErrorCode, message: string) {
    super(message);
    this.name = "DecklistError";
    this.code = code;
  }
}

export function isDecklistError(value: unknown): value is DecklistError {
  return value instanceof DecklistError;
}

export type FormatErrorCode = "invalid-label" | "unknown-set";

/** A window label could not be resolved against the catalog. */
export class FormatError extends Error {
  readonly _tag = "FormatError" as const;
  readonly code: FormatErrorCode;
  /** The label or set code that failed, verbatim. */
  readonly input: string;

  constructor(code: FormatErrorCode, input: string, message: string) {
    super(message);
    this.name = "FormatError";
    this.code = code;
    this.input = input;
  }
}

export function isFormatError(value: unknown): value is FormatError {
  return value instanceof FormatError;
}
