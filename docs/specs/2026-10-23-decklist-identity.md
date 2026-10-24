# Spec: Decklist parsing, identity, format windows, and rendering

Status: **Draft rev 4** (decisions locked; ready for scaffolding)
Repo: `ptcg-decklist-tools` (new, public, MIT) — package `@dierkens.dev/ptcg-decklist-tools`
Consumers: PTCGL Tracker, Training Court, PokeDojo, and paper-event tooling
Related: `ptcgl-battle-log-tracker/docs/specs/2026-10-12-log-sync.md` (envelope v1),
PokeDojo ADR 0009 (TCGdex id as card key), `training-court/TRACKER-SYNC-*`

## Goal

Turn a decklist from any source — a PTCGL export, a Limitless paste, or a typed
list — into one normalised value that can be identified, compared, scoped to a
format, annotated with an archetype, and rendered back out: PTCGL import, a plain
list, or a print-friendly sheet for a local cup or league.

One sentence: **a deck is a multiset of cards; its identity is that multiset
normalised, sorted, and hashed — and the same value renders to every surface.**

## Non-goals

- Card images, prices, or card text beyond what identity and line grouping need.
- Authoritative legality rulings. The format window is advisory (see §5).
- Fetching anything at runtime, including a decklist URL. Input is text.
- Page layout or PDF generation. `renderDecklist` returns text; the app owns the
  paper.
- Deciding an archetype for the player. The package suggests; a human confirms.
- Parsing battle logs. That is `@dierkens.dev/ptcgl-battle-log-parser`.
- Replacing PokeDojo's card registry. PokeDojo keeps the authoritative card data;
  the shipped catalog here is a build artifact of it.

## Vocabulary

- **Printing** — one physical card version: `(set, number)`.
- **Functional card** — the same card across printings (same name, stats, text).
- **Decklist** — a parsed list, whatever the source: PTCGL export, Limitless
  paste, or something typed by hand.
- **Deck identity** — the hash of the functional-card multiset.
- **List identity** — the hash of the printing multiset (exact text equivalence).
- **Format window** — an inclusive range of sets, `base … latest`, labelled
  `TEF-30C`. This is Limitless's scoping label, not a regulation-mark rule.
- **Archetype alias** — the community label for a deck concept (`Dragapult
  Dusknoir`), together with the 1–2 Pokémon Limitless uses as its icons.

## 1. Shipped data

Three generated JSON modules, imported with import attributes (Node ≥ 22.12,
same floor as the battle-log parser). Opt-in via a subpath so core users do not
pay for it:

```
@dierkens.dev/ptcg-decklist-tools/data   → sets + cards + archetypes
```

### Sets (~190 rows)

```ts
interface CatalogSet {
  liveCode: string;          // "TEF", "30C" (not unique — see below)
  tcgdexId: string;          // "sv05", "30th", "30th-c"
  name: string;              // English set name
  era: string;               // "sv", "me", "swsh", …
  order: number;             // precomputed release order, 0 = oldest
  releaseDate: null | string;
  paddingWidth: number;      // Live "76" → TCGdex "076"
  liveAddressable: boolean;  // parent-prefix rule result (ADR 0009)
}
```

`liveCode` is **not** unique. `30C` is claimed by `30th` and `30th-c`; ADR 0009
resolves this with the parent-prefix rule, so `30C` → `30th` and the companion
set is unreachable from a Live ref. The catalog bakes the resolved answer into
`liveAddressable` rather than recomputing it at read time.

### Cards (~18,400 printings)

```ts
interface CatalogCard {
  ref: string;               // "TEF-130" (Live code + Live number, verbatim)
  tcgdexId: string;          // "sv05-130"
  name: string;              // English name
  category: "pokemon" | "trainer" | "energy";
  function: string;          // 16-hex functional fingerprint (see below)
  regulationMark: null | string;
  line: null | string;       // Pokémon evolution-line id; null for trainer/energy
  stage: null | "basic" | "stage1" | "stage2"; // null for trainer/energy
  species: null | string;    // Limitless sprite slug: "dragapult", "ogerpon-wellspring"
}
```

- **`function`** is precomputed at build time from the fields that decide what the
  card *does*: name, supertype and subtype (Item/Supporter/Stadium/Tool;
  Basic/Stage 1/Stage 2; ex/V/VMAX/VSTAR/Mega), HP, types, weakness, resistance,
  retreat, abilities, attacks (name, cost, damage, text), and rules/effect text.
  Excluded on purpose: set, number, art, rarity, illustrator, language, and
  **regulation mark** — a reprint under a new mark is the same card with new
  legality, so legality must not fork identity.
- **`line`** groups an evolution line (e.g. Dreepy → Drakloak → Dragapult ex).
  Derived from the card's dex id / evolves-from chain at build time, not at
  runtime.
- **`species`** is the Limitless sprite slug for the card's species and form. It
  is what lets an alias icon ("dusknoir", "ogerpon-wellspring") match a card
  without parsing names. It is **curated, not global**: only slugs that appear in
  the alias table (~150) are resolved, from TCGdex `name`/`dexId`/form via a
  checked-in mapping. Every alias slug must resolve to at least one card, or the
  build fails.
- **`function` is 64 bits, not 32.** With 18,382 cards, a 32-bit fingerprint has
  a ~4 % birthday-collision chance across the catalog; 64 bits is ~10⁻¹¹. The
  canonical text and the fingerprint are truncated separately, so a fingerprint
  collision would merge two decks silently — the one failure mode worth paying
  four bytes for.
- Size: ~2 MB raw JSON, ~350 KB in the npm tarball. Regenerated per release;
  append-only in practice, since existing cards never change.
- **Provenance**: the build consumes a public TCGdex dump
  (`tcgdex/cards-database`, MIT) plus a checked-in `line`/`species` override
  table. PokeDojo's registry is a consumer and an initial reference, **not** the
  source — anyone must be able to rebuild the catalog from public data. The
  README carries the attribution, the fingerprint recipe, and the trademark
  disclaimer. No card text or images ship.

**Fingerprints are frozen.** Once a `function` value ships, a rebuild never
changes it, even if upstream text is corrected. The build reuses the previously
published map, computes only new cards, and prints a diff for anything that
would move; accepting that diff requires a deliberate `hashVersion` bump. This
is what makes a 3-month release cadence safe: the catalog grows, existing
`deckId`s do not move.

### Archetypes (~100 decks × ~10 variants per window)

```ts
interface CatalogArchetype {
  id: string;        // "limitless:284/3" — stable across label renames
  label: string;     // "Dragapult Dusknoir" — community alias, may change
  cards: string[];   // 0–2 sprite slugs; empty is label-only
  window: string;    // "TEF-30C"
}
```

- Source: Limitless `/decks?format=<window>&variants=true&show=100`, then each
  deck's variant `<select>` and its `img.pokemon` icons. The index row already
  carries the label, the 1–2 icon slugs, and `/decks/{id}?variant={n}`; a base
  row with no `?variant` normalises to variant `0` ("None"). Labels may contain
  markup (`Hydrapple <span class="annotation">ex</span>`), so read text content,
  not raw HTML.
- The checked-in snapshot is generated by `scripts/build-archetypes.mjs` from
  `scripts/catalog/archetype-windows.json`: `TEF-30C` (current), `TEF-POR`
  (previous latest set), and `SVI-ASC` (previous rotation). Every icon slug must
  resolve to a shipped card species; otherwise the build fails and the curated
  `scripts/catalog/species.json` needs another entry.
- The alias is **data, not a derivation**. "Basic Box" is Ogerpon + Clefairy;
  "Slowking Seek Inspiration" is Slowking. No heuristic recovers those names, so
  they ship.
- A row with no icons is label-only (`cards: []`); it is never suggested by card
  match, only listed for manual selection.
- `cards` is exactly Training Court's existing `logs.archetype` vocabulary
  (`"dragapult,dusknoir"`, max two). One table serves both the suggestion and the
  sync field.
- Window-scoped, because the alias set changes with rotation. Regenerated with
  the catalog; ids are stable, labels are refreshed.

**Unknown cards never fail.** A ref absent from the catalog is `resolved: false`
and hashes under a provisional key (`?:<SET>-<NUM>`, the form used in §4's
canonical text). New sets therefore work
before the app ships an updated catalog, at the cost of the id changing when the
catalog catches up (see §4, versioning).

## 2. Parsing

`parseDecklist(text)` → `Result<ParsedDecklist, DecklistParseError[]>`, total and
throw-free, errors as values (`Result` union, `unwrap` for the throwing path).

Sources are detected, not declared: a PTCGL export, a Limitless deck-page copy,
or a hand-typed list all use the same grammar. What differs is how much metadata
is present. Refs are the strong form; headers and the total footer are optional.
A list with no refs is still parsed — it resolves at lower confidence (§3).

Accepted line kinds:

| Kind | Shape | Notes |
|---|---|---|
| Section header | `<word>: <n>` | Any language. Known words map to a section; unknown words keep the number and warn |
| Card line | `<count> <name> <SET> <NUM>` | `NUM` must contain a digit (promos: `TG01`, `SWSH014`) |
| Card line, no ref | `<count> <name>` | `ref: null`; resolves by name when unambiguous, otherwise unresolved. **Never skipped** |
| Total footer | `<word>: <n>` where the word is a known total label | English `Total Cards`; other locales via a small table |

Rules:

- CRLF and LF; BOM; trailing whitespace; blank lines.
- A line that looks like neither is a diagnostic, not a silent drop.
- Section counts and the total are diagnostics. The entries are the truth; a
  mismatch is a warning, never a parse failure.
- A `count` of 0 or > 60 is a diagnostic.
- Duplicate lines are legal; they merge during normalisation.

## 3. Normalisation

`normalizeDecklist(parsed, { catalog })` →

```ts
interface NormalizedDeck {
  entries: NormalizedEntry[]; // merged, sorted, resolved
  total: number;
  warnings: DecklistWarning[];
  catalogVersion: string;
}

interface NormalizedEntry {
  card: CatalogCard | null;   // null when unresolved
  name: string;               // display name; canonical when resolved, else the list name; never hashed
  key: string;                // `f:<function>` | `?:<SET>-<NUM>` | `?<folded name>`
  count: number;
  printings: { ref: string; count: number }[]; // for display and printing diffs
}
```

Order of operations:

1. **Text folding** — Unicode NFC (not NFKC), straighten curly quotes and
   apostrophes, collapse internal whitespace, trim. Names are display-only;
   keys never depend on them when a ref resolves.
2. **Ref resolution** — `(liveCode, number)` → `liveAddressable` set → padded
   local ID → catalog card. A ref whose set is known but whose number is not is
   `resolved: false`; a ref whose set is unknown is also `resolved: false`, with
   a distinct warning.
3. **Name resolution (ref-less)** — resolve only when the catalog has exactly one
   distinct `function` for that folded name. Two candidates (two different
   Pikachus, or a name collision) is a warning and an unresolved key; never
   guessed. A uniquely resolved ref-less entry keys as `f:<function>`, so
   `4 Acerola's Mischief` and `4 Acerola's Mischief MEG 113` reach the same
   `deckId`, with no printing recorded. `Ultra Ball` is deliberately not an
   example: the pinned catalog has four functional Ultra Balls, so a ref-less
   `4 Ultra Ball` stays unresolved under this rule.
4. **Section inference** — when the header is unknown, take the section from the
   resolved card's `category`. When the header and the catalog disagree, the
   catalog wins and a warning is recorded.
5. **Merge** — sum counts by `key`. Printings are retained as a multiset.
6. **Representative form** — for each key, choose the printing with the most
   copies; ties broken by highest `order`, then `ref` ascending. This is
   the "most common form" rule. It affects serialisation and display, **not**
   identity. A ref-less entry has no printing to choose; it renders by name.

## 4. Identity

Canonical text (the hash input):

```
ptcg-decklist@1
f:1a2b3c4d5e6f7081:4
f:9e8f7a6b5c4d3e2f:3
?:TEF-130:2
```

- One line per key, sorted by key; `key:count`.
- Section, name, printing, and order are **not** in the hash. The identity is the
  multiset of functional cards.
- Unresolved keys sort and hash distinctly from resolved ones, so an unknown card
  can never collide with a known one.

```ts
deckId(normalized) → "sha256:<hex>"   // functional multiset
listId(normalized) → "sha256:<hex>"   // printing multiset (exact text equality)
```

The list pre-image is `ptcg-decklist-list@1` plus sorted `key:ref:count` lines.
A copy with no recorded printing uses an empty ref (`key::count`); splitting
those copies out keeps a ref-less name distinct from a resolved printing, and
keeps a merged name-plus-ref line exact. Both hashes return the same
`hashVersion` and `catalogVersion`.

Both use WebCrypto (`crypto.subtle.digest`), which Node 22 and every Tauri
webview provide. No dependency.

**Versioning and release cadence.** The catalog ships in the package and is
regenerated when sets ship (~every 3 months), together with the alias table.
Because fingerprints are frozen, a rebuild does not move existing ids. A
`deckId` changes only when a card was unresolved when the id was minted and the
new catalog resolves it — or after a deliberate `hashVersion` bump. Hashes
return `(hashVersion, catalogVersion)` and consumers store both, so that rare
migration is detectable rather than silent: recompute and re-link, never
reinterpret an old id under a new catalog.

Rationale for two hashes: `deckId` answers "is this the same deck?" across
printings and re-imports; `listId` answers "is this the same list?" for exact
duplicate detection and printing-only diffs.

### Why functional, not nominal

Two `Pikachu` cards with different HP and attacks share a name but not a
behaviour. Hashing the name would merge two different decks into one id, and the
diff would be blind to the swap. Hashing the functional card keeps them apart.

The four-copy rule is a different question and gets a different function:
`countByName()` sums by name for legality. Identity answers "which deck", not
"is it legal".

The cost is explicit: a 2/2 split across two same-name Pokémon is a *different*
deck from 4/0, even though both are legal. That is the intended reading —
different attacks, different deck.

### Language

Identity never depends on a localized name. A card's ref is the same in every
language, and the fingerprint's `name` field is the **English canonical name**,
pinned at build time. Localized names are display-only and never enter the hash;
changing the canonical language is a `hashVersion` bump.

TCGdex supplies `en, fr, de, es, it, pt`, plus Japanese sets under a separate id
space. PokeDojo's seven locales include `es_la` and `ptbr`, which TCGdex does not
expose separately — a name-variant gap, not an identity gap. Ref-less localized
lists would need localized name packs, loaded as an **opt-in setting** (`names`
on `normalizeDecklist`) rather than bundled. Packs affect display and ref-less
resolution only; they never enter `deckId`.

## 5. Format windows

```ts
interface FormatWindow {
  base: string;    // "TEF"
  latest: string;  // "30C"
  label: string;   // "TEF-30C", derived
}
```

- Membership is positional in the set `order`: `order(base) ≤ order(set) ≤
  order(latest)`.
- `parseFormatLabel` resolves both ends against `sets`, so `TEF-30C` and
  `tef-30c` are the same window; an unknown set is an error value, not a guess.
- `validateDeck(deck, window)` returns cards whose set is outside the window and
  refs whose set is unknown. Advisory only: real Standard legality is the
  regulation mark, and promos sit outside the set order in places.
- `validateDeck` checks the four-copy rule through `countByName`, because that
  rule is name-based while identity is functional. The two must not be conflated.
  Basic Energy is exempt from the limit.
- `validateDeck` reports `{ window, outside, unknownSets, fourCopy, ok }`.
  `outside` holds entries with at least one contributing printing outside;
  `unknownSets` holds set codes, including unknown window ends; `fourCopy` holds
  `{ name, count }` over four copies. `ok` is advisory: no outside, unknown, or
  four-copy finding, not an official legality ruling.
- `fittingWindows(deck, { era })` returns the windows that contain every card.
  A list can only **bound** a window; it can never determine the base. The base
  is chosen by the player/deck record, not inferred.
  - Candidate bases are every live-addressable set at or before the deck's
    oldest known printing, optionally narrowed to `era`.
  - `latest` is the catalog's newest live-addressable set, so the result is a
    current window. The deck never supplies the base.
  - Every printing participates, not just the representative. Any unknown set,
    or any entry with no set at all, cannot be proven to fit and returns none.

**Why a window and not a date.** PokeDojo currently resolves formats with
`FORMAT_ROTATIONS` (oldest legal set → rotation date) and stores `formatWindow`
in four incompatible shapes (`"TEF-POR"`, `"2026-standard"`,
`"2025-10-01/2026-08-11"`, `"2025/TEF-CRI"`). A window answers *what is legal*;
a date only answers *when it became legal*. Dates stay useful for recency
weighting, never for scoping.

The window sits **beside** the deck hash, not inside it. Rotation must not fork a
deck: the same 60 cards played in two windows is one deck in two contexts. Group
by `(deckId, window.label)`.

## 6. Diff

`diffDecklists(a, b, { maxChanges?, catalog? })` →

```ts
interface DeckDiff {
  classification: "identical" | "printing-only" | "variant" | "different";
  changes: DiffChange[];
  sameCount: number;   // cards whose count is unchanged
}

interface DiffChange {
  kind: "added" | "removed" | "count" | "printing";
  entry: NormalizedEntry;
  from: number;
  to: number;
  confidence: number; // 0–1, quality of the pairing
}
```

Pairing, in order:

| Situation | Confidence | Kind |
|---|---|---|
| Same `function`, count differs | 1.0 | count |
| Same `function`, only printings differ | 1.0 | printing |
| Unresolved on both sides, same normalised name | 0.8 | count |
| Unresolved on both sides, different refs, same name | 0.7 | printing |
| Nothing pairs | 1.0 (that it is a change) | added / removed |

Classification:

- `identical` — same `deckId`.
- `printing-only` — same `deckId`, different `listId`; only `printing` changes.
- `variant` — at most `maxChanges` (default 5) entries differ and ≥ 90 % of
  copies are unchanged. The implementation measures against the larger deck so
  a large deletion cannot look like a small variant.
- `different` — everything else.

A printing swap counts toward `sameCount`: the functional card and its count are
unchanged, even though `listId` moves.

Confidence is operational, not decorative: it is the input for auto-linking a
re-import to an existing deck version (PokeDojo's `changeNote`) and for
TrainingCourt deciding whether an import continues a deck or starts a new one.

## 7. Archetype suggestions

An archetype is **one or two Pokémon plus a community alias**: `Dragapult
Dusknoir`, `Basic Box` (Ogerpon + Clefairy), `Slowking Seek Inspiration`
(Slowking). Limitless is the source of truth for both halves; the alias and its
icons ship in the catalog (§1). Nothing here guesses a label.

```ts
interface ArchetypeSuggestion {
  id: string;           // "limitless:284/3"
  label: string;        // "Dragapult Dusknoir"
  cards: string[];      // 0–2 sprite slugs for an alias
  confidence: number;   // 0–1
  basis: "alias" | "lines";
  reasons: string[];    // shown to the player
}

suggestArchetype(deck, { window?, archetypes?, catalog? }) → ArchetypeSuggestion[]
```

`window` accepts a label or a `FormatWindow` and is case-insensitive. Implemented
confidences are 0.9 for a unique two-card alias, 0.6 when two-card aliases tie,
0.4 for a one-card alias, and 0.25–0.5 for the line fallback. Aliases with the
same icon set are collapsed to the higher-ranked label; the reason names the
others so the choice is visible.

Matching, in order:

1. **Alias match** — the shipped table, scoped to the deck's window. An alias
   matches when every one of its `cards` slugs appears among the deck's Pokémon
   species (summing copies across printings of the same species). Rank by
   specificity (more cards in the alias first), then by matching copies. A
   2-card alias that matches uniquely is high confidence; a 1-card alias
   (`Dragapult`) is deliberately low, because it cannot tell the variants apart.
   With no window set, try every shipped window and report which one matched.
2. **Line fallback** — no alias matches (new deck, off-meta, or an unknown
   window): group by `line` and score `copies × attackerWeight × (1 + 0.25 ×
   distinct stages present)`, favouring Stage 2 / ex / Mega / VSTAR lines. This
   can only propose a card pair, never an alias, so `basis: "lines"` and
   confidence ≤ 0.5.

Why this works where line-heuristics alone did not: "Basic Box" has no
derivable label, but it does have icons — Ogerpon and Clefairy — so it matches on
cards, not on interpretation. The failure mode is explicit: two aliases sharing a
main and no secondary in the list produce a tie, surfaced as two low-confidence
suggestions rather than a guess.

**No auto-commit.** Suggestions carry reasons; the player confirms or edits. The
chosen value is stored as `{ id, label, cards }`, so a later Limitless label
rename does not rewrite history.

Detection from a battle log is explicitly out of scope. A log exposes 10–20
cards, not a 60-card list; the battle-log parser already declines this.

## 8. Public API (Tier 1)

```ts
parseDecklist(text): Result<ParsedDecklist, DecklistError[]>
normalizeDecklist(parsed, opts?): Result<NormalizedDeck, DecklistError[]>
canonicalText(normalized): string            // the hash pre-image (debug + goldens)
renderDecklist(normalized, style): string    // "ptcgl" | "list" | "print" | "plain"
deckId(normalized): Promise<DeckHash>        // { value, hashVersion, catalogVersion }
listId(normalized): Promise<DeckHash>
countByName(normalized): { name: string; count: number }[]
parseFormatLabel(label, catalog?): Result<FormatWindow, FormatError>
validateDeck(deck, window, catalog?): FormatReport
fittingWindows(deck, { era, catalog? }): FormatWindow[]
diffDecklists(a, b, opts?): DeckDiff
suggestArchetype(deck, opts?): ArchetypeSuggestion[]
unwrap(result)
```

- `ptcgl` — section headers plus `Total Cards`, ready to paste back into Live.
- `list` — `count name SET NUM` lines, the Limitless paste shape.
- `print` — a deck-registration sheet: list name, format window, player/date
  lines, sections, counts, refs, total, and a checkbox gutter.
- `plain` — `count name`, no refs.

Rendering never invents a printing: an unresolved entry prints name + count and
the sheet marks it unresolved. `print` includes the window label and catalog
version so a deck check can see both.

Tier 2 (outside the promise): the catalog types, the data subpath, the scoring
weights.

## 9. Tracker integration

- **Deck registry** — paste or export a list once; store
  `{ deckId, catalogVersion, listId, name, window, archetype }` plus the text.
- **Current deck** — one selection in settings, visible in the capture drawer.
  The Rust sink stamps every delivery from it, so a match never races the queue
  and no per-match prompt exists.
- **Per-match correction** — the match row can re-point a match only while its
  delivery is still local (unsynced/failed). Delivered matches are fixed on the
  site, as today.
- **Envelope** (inside `schemaVersion: 1`, optional):

```json
"deck": {
  "hashVersion": 1,
  "deckId": "sha256:…",
  "catalogVersion": "2026-10-23",
  "format": { "base": "TEF", "latest": "30C", "label": "TEF-30C" },
  "archetype": {
    "id": "limitless:284/3",
    "label": "Dragapult Dusknoir",
    "cards": ["dragapult", "dusknoir"],
    "source": "chosen"
  }
}
```

PokeDojo's decoder ignores excess properties, so this is non-breaking. Sending
the full list stays opt-in per destination.

## 10. Receiving side

- **TrainingCourt** — `logs.format` becomes the window label from the envelope
  (today it is a per-device default, and the enum is hand-maintained).
  `logs.archetype` is `cards.join(",")`, which is already their format and their
  sprite vocabulary — no translation layer. Store `deckId` for grouping and
  dedupe; store the alias id and label if the schema grows a column, because
  labels drift.
- **PokeDojo** — `formatWindow` and the player's deck come from the same fields;
  version linking can use `diffDecklists` and confidence instead of a typed
  change note.

## 11. Fixtures and tests

Fixtures are **generated from Limitless**, not hand-written. The path is stable
HTML, verified against `TEF-30C`:

1. `https://limitlesstcg.com/decks?variants=true&show=100` — one row per alias
   variant: label, 1–2 `img.pokemon` slugs, link to
   `/decks/{deckId}?variant={variantId}`.
2. `/decks/{deckId}?variant={variantId}` — the variant `<select>` (id → label)
   and a **Latest results** table linking `/decks/list/{listId}`.
3. `/decks/list/{listId}` — `decklist-column` headings give the sections;
   each `decklist-card[data-set][data-number]` has `card-count` and `card-name`.
   Refs are unpadded (`TWM 129`), matching Live.

The build script samples N lists per alias and emits export-shaped text: PTCGL
format for the import fixture, plain `count name SET NUM` lines for the Limitless
paste.
Checked in:

- 3 English lists: a normal deck; one with split printings of the same card; one
  with promos and basic energy.
- 1 Limitless paste (no total footer, headers may be absent) and 1 hand-typed
  list with no refs. The typed list tests name resolution: unique names resolve,
  a `Pikachu` line stays unresolved.
- The alias table snapshot for the window, so suggestions are tested against the
  same data that ships.
- 1 non-English list. Limitless's `?lang=de` localises **card names** but not the
  column headings (`Pokémon (23)`, `Trainer (29)`, `Energy (8)`), so it tests
  cross-locale identity — same refs, different names, same `deckId` — not
  localised headers. A real client export is still needed for the headers
  (`Energie:`, `Karten gesamt:`); until then those are synthetic and labelled as
  such.
- Golden canonical text and both hashes per fixture.
- Property tests: shuffled lines → same `deckId`; printing swap → same `deckId`,
  different `listId`; one-card change → `variant` with one change at confidence
  1.0.
- Differential test against PokeDojo's `parseDecklist` on the same fixtures.
- Window tests driven by the shipped catalog: `30C`, `TEF-30C`, promo sets,
  unknown sets.
- Alias tests: `Dragapult Dusknoir` vs `Dragapult Froslass` on the same main;
  `Basic Box` (Ogerpon + Clefairy); a deck that matches a 1-card alias only.

`verify` = typecheck, lint, test:coverage, build — the workspace standard.

## 12. Decisions, actions, and accepted risks

Decided:

- **Functional identity**, not name identity. The four-copy rule is a separate
  `countByName` validator (§4).
- Fingerprint fields as in §1, regulation mark excluded, 64-bit, frozen.
- Catalog per set (~3 months), recomputed, `catalogVersion` stamped.
- Archetypes are 1–2 Limitless sprite slugs plus a shipped alias, window-scoped.
- Fixtures from Limitless; cross-locale identity tested with `?lang=de`.
- **Scope is PTCG, not PTCGL**: parse PTCGL exports, Limitless pastes, and typed
  lists; render back to PTCGL, a plain list, and a print sheet.
- Licence posture: TCGdex MIT; Limitless facts + attribution; no card text or
  images shipped.
- Multilingual position: identity is language-neutral through refs; canonical
  names stay English; localized name packs are an opt-in consumer setting,
  deferred; Japanese is out of scope (separate set-id space, not used by PTCGL).

Remaining actions (not decisions):

1. Draft `NOTICE`/README provenance and the trademark disclaimer.
2. Get one real non-English PTCGL export for localised headers.
3. Ask Limitless before shipping at scale, if it ever stops being a small
   attributed snapshot.

### Risks the plan accepts

- **Reproducibility.** If the build depends on PokeDojo's private registry, the
  public package cannot be rebuilt by anyone. Constraint: public TCGdex dump plus
  a checked-in override table (§1).
- **`species` curation.** A wrong mapping makes alias matching fail silently.
  Test: every alias slug resolves to at least one card, and every sampled
  Limitless list for an alias suggests that alias.
- **Alias staleness.** Ship the current window and the previous one; older
  windows fall back to line suggestions at lower confidence.
- **Provisional ids.** A card unknown at mint time hashes as `?SET-NUM` and moves
  when the catalog resolves it. Consumers store `catalogVersion`; a receiver
  (TrainingCourt) stores the sender's id as opaque rather than recomputing it.
- **Cross-version dedupe.** Ids match only within `(hashVersion, catalogVersion)`.
  Across versions it is a re-link, never an equality.

## 13. Rollout

1. Scaffold the repo; catalog build script (sets and cards from a public TCGdex
   dump, aliases from Limitless) with a reproducible snapshot.
2. Parse + normalise + identity + format windows; fixtures green.
3. Diff + classification.
4. `renderDecklist` styles + golden output tests.
5. Alias suggestions; line fallback.
6. Tracker deck registry + current deck + envelope field.
7. TrainingCourt / PokeDojo receiving side, in that order (TrainingCourt has the
   live ask).
