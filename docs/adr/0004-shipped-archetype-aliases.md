# Ship archetype aliases as data

Archetypes are one or two Pokémon plus a community label, and the label and its icons ship as data from Limitless rather than being derived. "Basic Box" is Ogerpon + Clefairy and "Slowking Seek Inspiration" is Slowking; no heuristic recovers those names. The table is window-scoped because the alias set changes with rotation, and its ids (`limitless:{deckId}/{variantId}`) stay stable while labels may drift. Suggestions are advisory: the package proposes with reasons, a human confirms, and the chosen `{ id, label, cards }` is stored so a later rename does not rewrite history. Limitless facts are attributed; no images or card text are redistributed.

## Considered Options

- **Heuristics from card lines** — cannot recover community labels like Basic Box.
- **Free-text user labels** — flexible but not comparable across users.
- **Shipped Limitless alias table** — chosen; comparable, attributed, window-scoped.
