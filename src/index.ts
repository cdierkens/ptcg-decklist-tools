/**
 * `@dierkens.dev/ptcg-decklist-tools`
 *
 * Parse, normalise, identify, diff, and render Pokémon TCG decklists.
 * Node >=22.12. ESM only. Zero runtime dependencies.
 *
 * The design lives in `docs/specs/2026-10-23-decklist-identity.md`. Parsing,
 * normalisation, identity, format windows, archetype suggestions, and the
 * shipped catalog are available; diff and rendering land next.
 */

export type {
  ArchetypeBasis,
  ArchetypeSuggestion,
  CardCategory,
  CardRef,
  Catalog,
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
  FittingWindowsOptions,
  FormatReport,
  FormatWindow,
  NormalizedDeck,
  NormalizedEntry,
  NormalizeOptions,
  ParsedDecklist,
  ParsedEntry,
  SuggestArchetypeOptions,
} from "./types.js";

export type { Result } from "./result.js";
export { err, isErr, isOk, map, ok, unwrapOr, unwrapOrThrow } from "./result.js";

export { parseDecklist } from "./parse.js";
export { normalizeDecklist } from "./normalize.js";
export { canonicalText, countByName, deckId, listId } from "./identity.js";
export { fittingWindows, parseFormatLabel, validateDeck } from "./format.js";
export { suggestArchetype } from "./suggest.js";

export type { DecklistErrorCode, FormatErrorCode } from "./errors.js";
export {
  DecklistError,
  FormatError,
  isDecklistError,
  isFormatError,
} from "./errors.js";
