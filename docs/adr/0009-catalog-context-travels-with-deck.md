# Catalog context travels with a live deck

Normalisation receives a `Catalog`; format checks and suggestions also need that catalog's set order and live-code resolution. Carrying only `catalogVersion` in `NormalizedDeck` let a custom catalog normalise a deck and then let `validateDeck`, `fittingWindows`, or `suggestArchetype` silently fall back to the shipped sets. `diffDecklists` accepted a `catalog` option that it never read.

A live `NormalizedDeck` carries an opaque catalog context, attached by `normalizeDecklist` and reused by downstream functions. The context has two depths: a `SetContext` with set order and live-code resolution for format checks and suggestions, and a `CatalogContext` with the card indexes for normalisation. `shippedSetContext` is a real set context, not a catalog with an empty card list.

A serialisable `catalogContextId` fingerprints the set facts a deck was built with. An explicit catalog must match that fingerprint. A restored deck with no attached context reuses the shipped context only when its fingerprint matches; otherwise the downstream function throws `CatalogContextError` with `missing-context` or `context-mismatch`. Decks stored before this field existed fall back to matching `catalogVersion`, then gain the fingerprint on their next normalisation. The ignored `catalog` option is removed from `DiffDecklistsOptions`.

## Considered Options

- **Store the full catalog in the deck** — serialisable, but duplicates megabytes and bloats every stored deck.
- **Require a catalog at every downstream seam** — explicit, but a breaking change for every caller and it loses the context already available at normalisation.
- **Keep the silent shipped-set fallback** — smallest change, but produces wrong reports for custom or pinned catalogs.
- **Attach an opaque context plus a serialisable fingerprint** — chosen; no catalog payload growth, no silent mismatch for live or restored decks, and stored decks remain explicit.
- **One context type with an empty card list for sets** — smaller diff, but the type promises card indexes that do not exist.
