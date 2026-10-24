/**
 * `@dierkens.dev/ptcg-decklist-tools`
 *
 * Parse, normalise, identify, diff, and render Pokémon TCG decklists.
 * Node >=22.12. ESM only. Zero runtime dependencies.
 *
 * The design lives in `docs/specs/2026-10-23-decklist-identity.md`. Parsing,
 * normalisation, identity, format windows, diff, rendering, archetype
 * suggestions, and the shipped catalog are available.
 */

export type {
  AliasEvidenceMatch,
  ArchetypeBasis,
  ArchetypeEvidence,
  ArchetypeSuggestion,
  CardCategory,
  CardRef,
  Catalog,
  CatalogArchetype,
  CatalogCard,
  CatalogSet,
  DeckDiff,
  DeckDiffClassification,
  DeckFunctionalCount,
  DeckHash,
  DeckListCount,
  DecklistWarning,
  DecklistWarningCode,
  DecklistWarningDetails,
  DeckSection,
  DeckSectionView,
  DeckView,
  DiffChange,
  DiffChangeKind,
  DiffDecklistsOptions,
  FittingWindowsOptions,
  FormatReport,
  FormatWindow,
  NormalizedDeck,
  NormalizedEntry,
  NormalizeOptions,
  ParsedDecklist,
  ParsedEntry,
  RenderDecklistOptions,
  RenderStyle,
  SuggestArchetypeOptions,
} from "./types.js";

export type { Result } from "./result.js";
export { err, isErr, isOk, map, ok, unwrapOr, unwrapOrThrow } from "./result.js";

export { parseDecklist } from "./parse.js";
export { normalizeDecklist } from "./normalize.js";
export { countByName, deckView } from "./deck.js";
export { canonicalText, deckId, listId } from "./identity.js";
export { diffDecklists } from "./diff.js";
export { fittingWindows, parseFormatLabel, validateDeck } from "./format.js";
export { renderDecklist } from "./render.js";
export { suggestArchetype } from "./suggest.js";

export type {
  CatalogContextErrorCode,
  DecklistErrorCode,
  FormatErrorCode,
} from "./errors.js";
export {
  CatalogContextError,
  DecklistError,
  FormatError,
  isCatalogContextError,
  isDecklistError,
  isFormatError,
} from "./errors.js";
