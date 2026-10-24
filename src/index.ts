/**
 * `@dierkens.dev/ptcg-decklist-tools`
 *
 * Parse, normalise, identify, diff, and render Pokémon TCG decklists.
 * Node >=22.12. ESM only. Zero runtime dependencies.
 *
 * The design lives in `docs/specs/2026-10-23-decklist-identity.md`. Parsing and
 * the shipped catalog are available; identity, format windows, diff, and
 * rendering land next.
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

export { parseDecklist } from "./parse.js";

export type { DecklistErrorCode, FormatErrorCode } from "./errors.js";
export {
  DecklistError,
  FormatError,
  isDecklistError,
  isFormatError,
} from "./errors.js";
