# `@dierkens.dev/ptcg-decklist-tools`

Parse, normalise, identify, diff, and render Pokémon TCG decklists. Zero runtime
dependencies, ESM, Node ≥ 22.12.

A decklist arrives as a PTCGL export, a Limitless paste, or something typed by
hand. This package turns any of them into one normalised value, gives that value
a stable identity, and renders it back out: PTCGL import, a plain list, or a
print-friendly sheet for a local cup or league.

> **Status: in progress.** The catalog, data shapes, error contract, and `Result`
> helpers are published. The parser, identity, format-window, diff, and render
> functions land next. The design is in
> [`docs/specs/2026-10-23-decklist-identity.md`](https://github.com/cdierkens/ptcg-decklist-tools/blob/main/docs/specs/2026-10-23-decklist-identity.md).

## Why

The same 60 cards can arrive as different printings, from different clients, in
different languages. Counting the lines is easy; deciding whether two lists are
the same deck is not.

- **Identity** is the multiset of *functional* cards — the card, not the art and
  not the name. `4 Ultra Ball SVI 196` and `2 + 2` across two printings are the
  same deck; two different Pokémon that happen to share a name are not.
- **Format** is a `SET-SET` window (`TEF-30C`), sitting beside the hash. Rotation
  never forks a deck.
- **Archetype** is one or two Pokémon plus a community alias (`Dragapult
  Dusknoir`), suggested from the shipped Limitless table and never auto-committed.
- **Render** is the same value printed for a deck check, pasted into Live, or
  handed to another client.

## Install

```sh
pnpm add @dierkens.dev/ptcg-decklist-tools
npm  install @dierkens.dev/ptcg-decklist-tools
```

Requires Node **>= 22.12**. ESM only — no CommonJS build. Zero runtime
dependencies.

## Usage

The error contract is available now:

```ts
import { ok, unwrapOrThrow } from "@dierkens.dev/ptcg-decklist-tools";

unwrapOrThrow(ok(42)); // 42
```

The decklist API is the 0.1.0 target:

```ts
import {
  deckId,
  diffDecklists,
  normalizeDecklist,
  parseDecklist,
  renderDecklist,
  suggestArchetype,
  unwrapOrThrow,
} from "@dierkens.dev/ptcg-decklist-tools";

const parsed = unwrapOrThrow(parseDecklist(text));
const deck = unwrapOrThrow(normalizeDecklist(parsed));

const id = await deckId(deck);
const format = renderDecklist(deck, "print"); // a sheet for a deck check
const suggestions = suggestArchetype(deck); // confirm, never auto-commit
```

## API

| Export | Purpose |
|---|---|
| `parseDecklist(text)` | `Result<ParsedDecklist, DecklistError[]>`. Any source; refs optional |
| `normalizeDecklist(parsed, opts?)` | Resolve refs and names, infer sections, merge printings |
| `renderDecklist(deck, style)` | `ptcgl`, `list`, `print`, or `plain` |
| `deckId(deck)` / `listId(deck)` | Functional identity / exact-printing identity |
| `countByName(deck)` | The four-copy rule, kept separate from identity |
| `parseFormatLabel(label)` / `validateDeck(deck, window)` | `TEF-30C` windows, advisory legality |
| `diffDecklists(a, b)` | Changes with confidence, classified |
| `suggestArchetype(deck)` | Aliases with reasons, never auto-committed |

Types are exported for storage and adapters: `CatalogSet`, `CatalogCard`,
`CatalogArchetype`, `NormalizedDeck`, `DeckHash`, `FormatWindow`, `DeckDiff`,
`ArchetypeSuggestion`, and the rest.

### Data

The generated catalog is opt-in, so core users do not pay for it:

```ts
import {
  archetypes,
  cards,
  catalogVersion,
  sets,
} from "@dierkens.dev/ptcg-decklist-tools/data";
```

`sets` is oldest-first and carries the resolved `liveAddressable` answer for
shared Live codes. `cards` carries every Live-addressable printing with its
16-hex functional fingerprint. The JSON is bundled; nothing is fetched at
runtime.

## Data and provenance

The catalog is generated at release time and bundled. Nothing is fetched at
runtime.

- **Sets, cards, functional fingerprints, regulation marks** are derived from
  [TCGdex](https://tcgdex.dev) (`tcgdex/cards-database`, MIT). The fingerprint
  recipe is documented in the spec; card text and images are **not** shipped.
- **Archetype aliases and sprite slugs** are derived from
  [Limitless TCG](https://limitlesstcg.com), attributed here, and limited to the
  factual labels and identifiers.
- No card text, images, or prices are included.
- Pokémon and Pokémon TCG are trademarks of Nintendo, Creatures, and GAME FREAK.
  This project is not affiliated with or endorsed by them.

## Languages

Identity is language-neutral: a card's set and number are the same in every
language, so a German list and an English list with the same refs produce the
same `deckId`. Canonical names are English. Localized name packs are a deferred,
opt-in consumer setting; they never enter a hash.

## Supported environments

- Node **22.12+** (JSON import attributes are the floor)
- Modern browsers and Tauri webviews
- ESM only; no CommonJS build

## Development

```sh
pnpm install
pnpm run verify           # typecheck, test, build
pnpm run test:coverage
pnpm run catalog          # rebuild the catalog from the pinned TCGdex dump
pnpm run catalog:accept   # accept fingerprint drift (requires a hashVersion bump)
```

The catalog build downloads the pinned dump into the gitignored `.cache/`, or
accepts an already-extracted checkout with `--source=…`. It fails when a shipped
fingerprint would move; that is deliberate.

## Releasing

```sh
pnpm changeset          # describe the change
pnpm run version        # bump + changelog
pnpm run release        # publish (needs an npm OTP — 2FA is enabled)
```

## License

MIT
