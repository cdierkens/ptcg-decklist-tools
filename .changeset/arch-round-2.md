---
"@dierkens.dev/ptcg-decklist-tools": minor
---

Deepen the context, deck-view, parser, and diagnostic seams.

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
