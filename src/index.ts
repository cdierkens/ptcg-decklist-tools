/**
 * `@dierkens.dev/ptcg-decklist-tools`
 *
 * Parse, normalise, identify, diff, and render Pokémon TCG decklists.
 * Node >=22.12. ESM only. Zero runtime dependencies.
 *
 * The design lives in `docs/specs/2026-10-23-decklist-identity.md`. This
 * scaffold exports the data shapes, the error contract, and the `Result`
 * helpers; the parsing and identity functions land next.
 */

export type {
  ArchetypeBasis,
  ArchetypeSuggestion,
  CardCategory,
  CardRef,
  CatalogArchetype,
  CatalogCard,
  CatalogSet,
  DeckDiff,
  DeckDiffClassification,
  DeckHash,
  DecklistWarning,
  DecklistWarningCode,
  DeckSection,
  DiffChange,
  DiffChangeKind,
  FormatReport,
  FormatWindow,
  NormalizedDeck,
  NormalizedEntry,
  ParsedDecklist,
  ParsedEntry,
} from "./types.js";

export type { Result } from "./result.js";
export { err, isErr, isOk, map, ok, unwrapOr, unwrapOrThrow } from "./result.js";

export type { DecklistErrorCode, FormatErrorCode } from "./errors.js";
export {
  DecklistError,
  FormatError,
  isDecklistError,
  isFormatError,
} from "./errors.js";
