# List identity keeps absent printings

The `listId` pre-image is `ptcg-decklist-list@1` plus sorted `key:ref:count`
lines. A copy with no recorded printing uses an empty ref (`key::count`). This
is deliberately not the deck pre-image with refs appended: a ref-less line has
no printing to name, and a normalized entry can merge a ref-less line with a
printing, so the entry's `count` can exceed the sum of its `printings`. Writing
the absent copies as their own line keeps the printing multiset exact.

The separate domain also keeps the two hashes from colliding: `deckId` hashes
only `key:count`, while `listId` hashes `key:ref:count`. `NormalizedEntry.name`
is display-only and never enters either pre-image; changing a name or a
localized export does not move an id.

## Considered Options

- **Hash the printings only** — drops ref-less and unresolved-name copies, so
  two different lists can share a `listId`.
- **Hash the original text** — whitespace, sections, and header counts make
  equivalent lists differ.
- **Reuse the deck pre-image and append refs** — a merged name-plus-ref entry
  cannot distinguish its printed and absent copies.
- **Domain-separated `key:ref:count` lines** — chosen; exact, deterministic, and
  distinct from the deck identity.
