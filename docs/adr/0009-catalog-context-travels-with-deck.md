# Catalog context travels with a live deck

Normalisation receives a `Catalog`; format checks and suggestions also need that catalog's set order and live-code resolution. Carrying only `catalogVersion` in `NormalizedDeck` let a custom catalog normalise a deck and then let `validateDeck`, `fittingWindows`, or `suggestArchetype` silently fall back to the shipped sets. `diffDecklists` accepted a `catalog` option that it never read.

A live `NormalizedDeck` now carries an opaque catalog context, attached by `normalizeDecklist` and reused by downstream functions. An explicit catalog still wins. A deck restored from storage has only `catalogVersion`; the caller passes its catalog to the downstream function. The shipped sets remain the fallback only for the shipped catalog. The ignored `catalog` option is removed from `DiffDecklistsOptions`.

## Considered Options

- **Store the full catalog in the deck** — serialisable, but duplicates megabytes and bloats every stored deck.
- **Require a catalog at every downstream seam** — explicit, but a breaking change for every caller and it loses the context already available at normalisation.
- **Keep the silent shipped-set fallback** — smallest change, but produces wrong reports for custom or pinned catalogs.
- **Attach an opaque context to the live deck** — chosen; no payload growth, no silent mismatch while the deck is live, and stored decks remain explicit.
