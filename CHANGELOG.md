# @dierkens.dev/ptcg-decklist-tools

## 0.2.0

### Minor Changes

- ddfadf4: Deepen the context, deck-view, parser, and diagnostic seams.

  - `NormalizedDeck` now carries `catalogContextId`; a restored custom deck must
    be given its catalog, and a missing or mismatched context throws
    `CatalogContextError` instead of silently using shipped sets.
  - `SetContext` is split from `CatalogContext`, so format checks and suggestions
    no longer receive a fake catalog with an empty card list.
  - `deckView` exposes read-only sections, functional/list counts, and name counts
    for custom sheets and consumers.
  - The parser shares its printing-ref grammar with the catalog and renderer, and
    build/runtime catalog rules are checked by a contract test. That test found
    and fixed lowercase promo refs that the runtime could not resolve.
  - `DecklistWarning` carries structured `details`, and `ArchetypeSuggestion`
    carries structured `evidence`, beside the existing prose.

- 53ea346: Deepen the catalog and deck seams. A live `NormalizedDeck` now carries its catalog
  context, so format checks and suggestions reuse the catalog used for
  normalisation instead of silently falling back to shipped sets. The ignored
  `catalog` option on `diffDecklists` is removed. Normalized-deck projections now
  have one owner, tests go through the package entry, the shipped small data has
  one module, and the catalog build derivation is pure and testable.

## 0.1.1

### Patch Changes

- Correct the README status line that shipped with `0.1.0`. No API or data change;
  this patch also exercises the tag-triggered trusted-publishing path.

## 0.1.0

### Minor Changes

- **0.1.0 — initial public release.** The first supported package ships the full
  Tier 1 surface: parser, normaliser, functional and printing identity, format
  windows, diff, rendering, archetype suggestions, the shipped card catalog, and
  the `Result` contract. Zero runtime dependencies, ESM only, Node 22.12+.
