# `@dierkens.dev/ptcg-decklist-tools`

Parse, normalise, identify, diff, and render Pokémon TCG decklists. Zero runtime
dependencies, ESM, Node ≥ 22.12.

A decklist arrives as a PTCGL export, a Limitless paste, or something typed by
hand. This package turns any of them into one normalised value, gives that value
a stable identity, and renders it back out: PTCGL import, a plain list, or a
print-friendly sheet for a local cup or league.

> **Status: in progress.** The catalog, parser, normaliser, identity, format
> windows, data shapes, error contract, and `Result` helpers are published.
> Diff and render functions land next. The design is in
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
  canonicalText,
  deckId,
  diffDecklists,
  fittingWindows,
  listId,
  normalizeDecklist,
  parseDecklist,
  parseFormatLabel,
  renderDecklist,
  suggestArchetype,
  unwrapOrThrow,
  validateDeck,
} from "@dierkens.dev/ptcg-decklist-tools";
import { catalog } from "@dierkens.dev/ptcg-decklist-tools/data";

const parsed = unwrapOrThrow(parseDecklist(text));
const deck = unwrapOrThrow(normalizeDecklist(parsed, { catalog }));

const id = await deckId(deck);
const exact = await listId(deck);
const preImage = canonicalText(deck); // debug and goldens

const window = unwrapOrThrow(parseFormatLabel("tef-30c"));
const report = validateDeck(deck, window); // advisory outside/unknown/four-copy
const candidates = fittingWindows(deck, { era: "sv" });

const format = renderDecklist(deck, "print"); // a sheet for a deck check
const suggestions = suggestArchetype(deck); // confirm, never auto-commit
```

## API

| Export | Purpose |
|---|---|
| `parseDecklist(text)` | `Result<ParsedDecklist, DecklistError[]>`. Any source; refs optional |
| `normalizeDecklist(parsed, { catalog })` | Resolve refs and names, infer sections, merge printings |
| `renderDecklist(deck, style)` | `ptcgl`, `list`, `print`, or `plain` |
| `deckId(deck)` / `listId(deck)` | Functional identity / exact-printing identity |
| `canonicalText(deck)` | The `deckId` pre-image, for debugging and goldens |
| `countByName(deck)` | The four-copy rule, kept separate from identity |
| `parseFormatLabel(label)` | `TEF-30C` windows, case-insensitive and catalog-checked |
| `validateDeck(deck, window)` | Advisory outside sets, unknown sets, four-copy counts |
| `fittingWindows(deck, { era })` | Candidate bases; never infers the base from the deck |
| `diffDecklists(a, b, { maxChanges })` | Changes with confidence, classified |
| `suggestArchetype(deck, { window })` | Aliases with reasons, never auto-committed |

Types are exported for storage and adapters: `Catalog`, `NormalizeOptions`,
`CatalogSet`, `CatalogCard`, `CatalogArchetype`, `NormalizedDeck`, `DeckHash`,
`FormatWindow`, `FormatReport`, `FittingWindowsOptions`, `DeckDiff`,
`DiffDecklistsOptions`, `ArchetypeSuggestion`, `SuggestArchetypeOptions`, and
the rest.

### Identity

`deckId` hashes the functional multiset: `ptcg-decklist@1` plus sorted
`key:count` lines. Section, name, printing, and source order are deliberately
absent. `listId` hashes the printing multiset, including the absence of a ref
for a name-only line, so a printing swap changes only `listId`.

Both return `{ value: "sha256:…", hashVersion, catalogVersion }`. Store both
versions beside the id: ids are only comparable within the same pair. Hashing
uses WebCrypto, so there is no dependency and no runtime network call.

`countByName` is the four-copy check, not identity. Two Pikachu functions are
different decks but the same name, so the counts add up for legality.

### Format windows

`parseFormatLabel` resolves both ends against the shipped set order, so
`tef-30c`, `TEF-30C`, and ` TEF-30C ` are one window. The `30C` collision
resolves to the Live-addressable celebration set. Unknown sets and malformed or
reversed labels are `FormatError` values, not guesses.

`validateDeck` is advisory. `outside` lists entries with any contributing
printing outside the window; `unknownSets` lists set codes the catalog does not
know; `fourCopy` lists names over four copies, excluding basic Energy. Real
Standard legality is a regulation-mark rule, and promos sit outside the set order
in places, so `ok` means "nothing this checker can see", not an official ruling.

`fittingWindows` answers "which bases could scope this deck?" It tries every
live-addressable set at or before the deck's oldest card as a candidate base,
optionally narrowed by `era`, and uses the catalog's newest live-addressable set
as `latest`. The deck never chooses its own base. Any unknown set, or any entry
with no set at all, returns no candidates: the function will not claim a fit it
cannot prove.

### Diff

`diffDecklists` is synchronous because it compares normalised entries rather
than hashing. Resolved entries pair on their functional key; unresolved entries
pair on their folded name, preferring the same refs. A count change is full
confidence when the card resolved and 0.8 when it did not. A printing-only
change is 1.0 resolved and 0.7 unresolved. Anything unpaired is an added or
removed entry at 1.0.

`sameCount` sums copies whose functional card and count did not change,
including copies whose printing moved. `classification` is `identical` when the
functional and printing multisets match, `printing-only` when only printings
differ, and `variant` when at most `maxChanges` (default 5) entries differ and at
least 90% of copies are unchanged. Everything else is `different`.

### Archetype suggestions

`suggestArchetype` matches the shipped Limitless aliases by Pokémon species, not
by name or card text. It sums copies of a species across printings, then ranks
two-card aliases above one-card aliases and, within a rank, by matching copies.
Aliases with the same icon set at different labels collapse to the
higher-ranked label; the reasons name the other label. A unique two-card alias
is high confidence, a tie is lower, and a one-card alias stops at 0.4 because it
cannot distinguish variants.

Without `window`, every shipped window is tried and the reasons say which one
matched. Pass `{ window: "TEF-30C" }` (or a `FormatWindow`) to scope matching;
the label is case-insensitive. If no alias matches, the fallback groups Pokémon
by evolution line, favours Stage 2, ex, Mega, and VSTAR attackers, and returns a
line suggestion with `basis: "lines"` and confidence at 0.5 or below. Nothing is
written or auto-committed: store the chosen `{ id, label, cards }` after the
player confirms.

### Data

The card catalog is opt-in, so core users do not pay for the full card list.
The small archetype table is imported by `suggestArchetype` and is also exported
here for storage and adapters:

```ts
import {
  archetypes,
  cards,
  catalog,
  catalogVersion,
  sets,
} from "@dierkens.dev/ptcg-decklist-tools/data";
```

`sets` is oldest-first and carries the resolved `liveAddressable` answer for
shared Live codes. `cards` carries every Live-addressable printing with its
16-hex functional fingerprint. `catalog` is the three values in one object,
ready to pass to `normalizeDecklist`. The JSON is bundled; nothing is fetched at
runtime.

`archetypes` is a snapshot of Limitless aliases scoped to a format window:
`{ id, label, cards, window }`. The id is `limitless:{deckId}/{variantId}`; a
base row with no variant normalises to variant `0`. `cards` is zero, one, or two
Limitless sprite slugs, so a row with no icons is label-only and never matched by
card. Labels are text content, never markup. The checked-in snapshot covers
`TEF-30C` (current), `TEF-POR` (previous latest set), and `SVI-ASC` (previous
rotation); refresh it with `pnpm run archetypes`. Every icon slug must exist on a
shipped card, or the build fails, which is why `scripts/catalog/species.json` is
curated rather than guessed.

The set index is also loaded by the format-window functions, because set order
is what membership means. It is small, as is the archetype table; the full card
list remains on the `./data` subpath.

## Data and provenance

The catalog is generated at release time and bundled. Nothing is fetched at
runtime.

- **Sets, cards, functional fingerprints, regulation marks** are derived from
  [TCGdex](https://tcgdex.dev) (`tcgdex/cards-database`, MIT). The fingerprint
  recipe is documented in the spec; card text and images are **not** shipped.
- **Archetype aliases and sprite slugs** are derived from
  [Limitless TCG](https://limitlesstcg.com), attributed here, and limited to the
  factual labels and identifiers. The species mapping is curated in
  `scripts/catalog/species.json`; the catalog build fails if an entry has no
  card, and the archetype build fails if an alias icon has no species.
- **Test fixtures** are harvested from public Limitless decklists with
  `scripts/harvest-limitless.mjs`; each one records its source list id in
  `src/__tests__/fixtures/decklists/manifest.json`.
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
