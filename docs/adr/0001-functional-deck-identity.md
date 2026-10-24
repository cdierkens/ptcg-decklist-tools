# Functional deck identity

A deck's identity is the multiset of its **functional cards**, not its names or printings. Two Pikachu printings with different HP and attacks are different cards; the same card under a new set, art, or regulation mark is the same card. Hashing names would merge different decks and blind the diff; hashing printings would fork a deck on a reprint. The cost is accepted: a 2/2 split across two same-name Pokémon is a different deck from 4/0, because the attacks differ. The four-copy rule is a separate, name-based check (`countByName`), never part of identity.

## Considered Options

- **Name identity** — simple, but merges mechanically different same-name cards.
- **Printing identity** — exact, but every reprint creates a new deck.
- **Functional identity** — chosen; stable across printings, sensitive to behaviour.
