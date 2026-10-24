---
"@dierkens.dev/ptcg-decklist-tools": minor
---

Deepen the catalog and deck seams. A live `NormalizedDeck` now carries its catalog
context, so format checks and suggestions reuse the catalog used for
normalisation instead of silently falling back to shipped sets. The ignored
`catalog` option on `diffDecklists` is removed. Normalized-deck projections now
have one owner, tests go through the package entry, the shipped small data has
one module, and the catalog build derivation is pure and testable.
