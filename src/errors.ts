/**
 * Error types.
 *
 * Every error is a plain `Error` subclass carrying a literal `_tag`. Primary
 * exports return them in the error arm of a `Result`; `unwrapOrThrow` turns a
 * `Result` back into a throw for callers who prefer `try/catch`.
 *
 * The `_tag` values are part of the public API.
 */

/** Fatal parse or normalisation failures. Everything else is a `DecklistWarning`. */
export type DecklistErrorCode = "empty-input" | "missing-catalog" | "no-entries";

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

export type CatalogContextErrorCode = "missing-context" | "context-mismatch";

/**
 * A downstream operation could not obtain the catalog context a deck was
 * normalised with. This is a programmer error, not a bad decklist: pass the
 * catalog when restoring a custom catalog, or use the shipped catalog.
 */
export class CatalogContextError extends Error {
  readonly _tag = "CatalogContextError" as const;
  readonly code: CatalogContextErrorCode;
  readonly deckCatalogVersion: string;
  readonly catalogVersion: string | null;

  constructor(
    code: CatalogContextErrorCode,
    deckCatalogVersion: string,
    catalogVersion: string | null,
    message: string,
  ) {
    super(message);
    this.name = "CatalogContextError";
    this.code = code;
    this.deckCatalogVersion = deckCatalogVersion;
    this.catalogVersion = catalogVersion;
  }
}

export function isCatalogContextError(value: unknown): value is CatalogContextError {
  return value instanceof CatalogContextError;
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
