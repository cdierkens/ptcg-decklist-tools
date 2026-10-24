# Format window beside identity

A deck's format is an inclusive `SET-SET` window (`TEF-30C`) resolved against set order, and it sits beside the deck hash rather than inside it. Rotation changes what is legal, not which deck it is; putting the window in the hash would fork one deck into a new identity every rotation. Windows also replace PokeDojo's four incompatible date/window shapes with one value that answers "what is legal", leaving dates for recency. Group by `(deckId, window.label)`. Legality is advisory: the real Standard rule is the regulation mark, and promos sit outside set order in places.

## Considered Options

- **Window inside the hash** — one id per rotation, but history forks.
- **Date-based format** — answers when, not what; already four shapes in PokeDojo.
- **Window beside the hash** — chosen; identity survives rotation.
