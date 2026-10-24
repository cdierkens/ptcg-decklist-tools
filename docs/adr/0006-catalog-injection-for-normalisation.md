# Catalog injection for normalisation

`normalizeDecklist` resolves against a catalog passed by the caller; the core
entry point does not import `./data`. The shipped catalog is opt-in (ADR 0003)
and several megabytes on disk, so importing it from the core would make every
parser-only consumer pay for data it may not use. The `./data` subpath exports a
ready-made `catalog` object, and the `Catalog` shape lets a caller supply a
trimmed, pinned, or future catalog.

Omitting the option returns a `missing-catalog` `DecklistError` rather than
resolving every entry provisionally or throwing. Returning unresolved entries
would be silently wrong: the caller cannot tell "this list has no refs" from
"you forgot the catalog", and the resulting hash would not match one produced
with the data. The error is explicit and keeps the core data-free.

## Considered Options

- **Import the shipped catalog in the core** — convenient, but breaks the
  opt-in data boundary and bloats parser-only consumers.
- **Return unresolved entries when no catalog is given** — silent wrong
  identity; indistinguishable from a genuinely ref-less list.
- **Require the catalog and return a `missing-catalog` error** — chosen;
  explicit, typed, and keeps the core data-free.
