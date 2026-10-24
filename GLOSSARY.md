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

**Printing ref**:
A printing's live address: set code plus collector number, such as `TEF-130`.
_Avoid_: card id, printing id

**Functional card**:
The same card across printings: identical name, stats, abilities, attacks, and rules text.
_Avoid_: card identity, oracle card

**Catalog context**:
The derived view of a catalog that resolves printings and names: set order, live-code addressability, and the card indexes. It travels with a live normalized deck.
_Avoid_: catalog index, registry

**Context fingerprint**:
The stable value that identifies the set facts a deck was normalised with, so a restored deck can tell whether the shipped context still applies.
_Avoid_: catalog version, deck hash

**Deck identity**:
What makes two decklists the same deck, independent of printing, source, and language.
_Avoid_: deck hash, fingerprint

**List identity**:
What makes two decklists the same list, including every printing.
_Avoid_: printing hash

**Format window**:
An inclusive range of sets a deck is scoped to, written `base-latest` (for example `TEF-30C`).
_Avoid_: format, rotation, standard

**Candidate window**:
A window whose base could scope a deck. Fitting returns candidates; it never chooses the base for the player.
_Avoid_: inferred format, guessed window

**Archetype alias**:
A window-scoped community label for a deck concept, together with the zero, one, or two Pokémon Limitless uses as its icons.
_Avoid_: archetype, deck name

**Species slug**:
Limitless's sprite vocabulary for a Pokémon (`dragapult`, `ogerpon-wellspring`). The catalog maps printings to it; it is not a card name.
_Avoid_: Pokémon name, dex id

**Unresolved**:
An entry the catalog cannot identify. It still parses and hashes, under a provisional key.
_Avoid_: unknown, invalid

**Representative printing**:
The printing chosen to display an entry that has copies across several printings.
_Avoid_: default printing, main printing

**Canonical text**:
The exact bytes `deckId` hashes: a domain line plus sorted `key:count` lines. It is for debugging and goldens, not a rendering style.
_Avoid_: canonical form, hash string
