# Normalized deck owns its projections

`NormalizedDeck` is a plain shape, but its invariants were owned nowhere. Identity re-summed functional counts, diff re-summed functional and printing counts, format re-walked printings, and render re-implemented section grouping and clamped inconsistent printing counts. A representation change would need four coordinated edits, and the consumers could disagree about the same deck.

`createNormalizedDeck` is now the constructor. It sorts entries, computes the total, and attaches the catalog context. The normalized deck module exposes the projections consumers need: functional counts, list counts, section groups, printing lines, refs per entry, and name counts. Identity, diff, format, and render read those projections instead of re-deriving them.

## Considered Options

- **Turn `NormalizedDeck` into a class with methods** — strong locality, but breaks the plain serialisable shape consumers already store.
- **Validate the shape on every read** — catches hand-built decks, but pays repeatedly and still leaves the projections duplicated.
- **Let every consumer keep its own projection** — current cost: four places to change and no single test surface.
- **Constructor plus projections in the normalized-deck module** — chosen; preserves the public data shape and gives the invariants one owner.
