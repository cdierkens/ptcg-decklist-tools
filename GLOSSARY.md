# ptcg-decklist-tools

The domain language for decklist parsing, identity, and rendering. One context.

## Language

**Decklist**:
The text a player supplies: a PTCGL export, a Limitless paste, or a typed list.
_Avoid_: list, paste, deck (before normalisation)

**Deck**:
A decklist after normalisation: a multiset of cards with an identity, a format window, and optionally an archetype.
_Avoid_: list, decklist

**Printing**:
One physical card version, identified by its set and number.
_Avoid_: version, variant, edition

**Functional card**:
The same card across printings: identical name, stats, abilities, attacks, and rules text.
_Avoid_: card identity, oracle card

**Deck identity**:
What makes two decklists the same deck, independent of printing, source, and language.
_Avoid_: deck hash, fingerprint

**List identity**:
What makes two decklists the same list, including every printing.
_Avoid_: printing hash

**Format window**:
An inclusive range of sets a deck is scoped to, written `base-latest` (for example `TEF-30C`).
_Avoid_: format, rotation, standard

**Archetype alias**:
A community label for a deck concept, together with the one or two Pokémon Limitless uses as its icons.
_Avoid_: archetype, deck name

**Unresolved**:
An entry the catalog cannot identify. It still parses and hashes, under a provisional key.
_Avoid_: unknown, invalid

**Representative printing**:
The printing chosen to display an entry that has copies across several printings.
_Avoid_: default printing, main printing
