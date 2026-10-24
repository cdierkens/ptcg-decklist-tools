# Decklist fixtures

The PTCGL and paste fixtures are generated from public Limitless decklists with
`node scripts/harvest-limitless.mjs --out=src/__tests__/fixtures/decklists`.
The `manifest.json` next to them records the source URL, list id, section
counts, and whether every ref resolves in the shipped catalog. Do not edit the
generated text by hand; re-run the harvester or fix the parser.

- `Dragapult-Dusknoir-30537.ptcgl.txt` — a normal 60-card export
  ([list 30537](https://limitlesstcg.com/decks/list/30537)).
- `Seaking-Festival-Lead-30519.ptcgl.txt` — split printings of `Goldeen`
  (`TWM 44` and `PBL 13`)
  ([list 30519](https://limitlesstcg.com/decks/list/30519)).
- `Festival-Lead-30526.ptcgl.txt` — a promo (`Grookey MEP 52`), basic energy,
  and another split printing of `Applin`
  ([list 30526](https://limitlesstcg.com/decks/list/30526)).
- `Dragapult-Dusknoir-30537.paste.txt` — the same normal list with no headers
  and no total footer, matching a Limitless paste.
- `Dragapult-Dusknoir-30537.de.ptcgl.txt` — the same list from
  `?lang=de`. Limitless localises the card names but keeps the headings in
  English (`Pokémon (23)`), so this tests cross-locale identity, not localized
  headers.
- `ptcgl-de-headers-synthetic.txt` — **synthetic**. We have not captured a real
  non-English PTCGL export yet; the German headers are written from the client's
  locale strings. Replace this with a real export when one is available.
- `typed-no-refs.txt` — hand-typed, every line ref-less. `Pikachu` is
  intentionally ambiguous so the normaliser cannot resolve it by name alone.

Refs are the Live codes Limitless prints, unpadded (`TWM 129`), not the padded
catalog ids. The decklists are short tournament facts; the fixtures contain no
card text or images.
