# Fitting windows enumerate bases

`fittingWindows` returns candidate windows, not a single inferred label. The
deck's oldest known printing only filters candidates: every live-addressable set
at or before it can be the base, optionally narrowed by `era`. The latest end is
the catalog's newest live-addressable set, which makes the result a current
window and keeps the deck from choosing its own base. Every printing of every
entry participates, so a split printing with one old copy is not hidden by the
representative.

A deck with an unknown set, or with any entry that has no set at all, returns no
candidates: there is no evidence that any window contains every card.
`validateDeck` still reports the unknown set separately so the caller can
explain the refusal.

## Considered Options

- **Use the oldest card as the base** — infers the answer the API is supposed to
  leave to the player or deck record.
- **Use era first sets as the only bases** — compact, but invents a rule that a
  rotation must start at an era boundary; `TEF-30C` does not.
- **Return every `(base, latest)` pair** — literal but combinatorial, and most
  pairs end at arbitrary sets rather than a current format.
- **Current latest plus every eligible base** — chosen; small enough to review,
  explicit that the base is unresolved, and stable as the catalog grows.
