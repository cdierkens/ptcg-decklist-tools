# Ship archetype aliases as data

Archetypes are zero, one, or two Pokémon plus a community label, and the label and its icons ship as data from Limitless rather than being derived. "Basic Box" is Ogerpon + Clefairy and "Slowking Seek Inspiration" is Slowking; no heuristic recovers those names. The table is window-scoped because the alias set changes with rotation, and its ids (`limitless:{deckId}/{variantId}`) stay stable while labels may drift; a base index row normalises to variant 0. A row with no icons is label-only and never matched by card. Suggestions are advisory: the package proposes with reasons, a human confirms, and the chosen `{ id, label, cards }` is stored so a later rename does not rewrite history. Limitless facts are attributed; no images or card text are redistributed.

The checked-in snapshot covers the current window, the previous latest-set window, and the previous rotation, so no-window suggestions can still recognise recently rotated decks. `scripts/build-archetypes.mjs` regenerates it deliberately; runtime never calls Limitless. The catalog's species slugs follow Limitless's sprite vocabulary, and the build fails if any alias icon has no shipped card. Possessive printings ("Cynthia's Garchomp", "Team Rocket's Honchkrow") get explicit mapping entries rather than a fuzzy match.

## Considered Options

- **Heuristics from card lines** — cannot recover community labels like Basic Box.
- **Free-text user labels** — flexible but not comparable across users.
- **Shipped Limitless alias table** — chosen; comparable, attributed, window-scoped.
