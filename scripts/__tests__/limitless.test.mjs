import { describe, expect, it } from "vitest";

import {
  decodeEntities,
  fixtureBaseName,
  hasSplitPrintings,
  htmlToText,
  mergeManifest,
  missingRefs,
  parseIndex,
  parseListPage,
  parseVariantPage,
  sectionFor,
  slug,
  sum,
  toPaste,
  toPtcgl,
} from "../lib/limitless.mjs";

const INDEX_HTML = `
<table class="data-table striped">
  <tr><th>#</th><th></th><th>Deck</th><th>Points</th><th>Share</th></tr>
  <tr>
    <td>1</td>
    <td><img class="pokemon" src="https://example.test/dragapult.png" alt="dragapult"></td>
    <td><a href="/decks/284">Dragapult <span class="annotation">ex</span></a></td>
    <td>2842</td><td>25.80%</td>
  </tr>
  <tr>
    <td>2</td>
    <td><img class="pokemon" src="https://example.test/ogerpon.png" alt="ogerpon"><img class="pokemon" src="https://example.test/clefairy.png" alt="clefairy"></td>
    <td><a href="/decks/339">Basic Box <span class="annotation"></span></a></td>
    <td>985</td><td>8.94%</td>
  </tr>
  <tr>
    <td>7</td>
    <td><img class="pokemon" src="https://example.test/dragapult.png" alt="dragapult"><img class="pokemon" src="https://example.test/dusknoir.png" alt="dusknoir"></td>
    <td><a href="/decks/284?variant=3">Dragapult Dusknoir</a></td>
    <td>477</td><td>4.33%</td>
  </tr>
</table>
`;

const VARIANT_HTML = `
<select id="variant-select" name="variant">
  <option value="null">All</option>
  <option value="1">Dragapult LZ Box</option>
  <option value="3" selected>Dragapult Dusknoir</option>
</select>
<h2>Latest results</h2>
<table class="data-table striped">
  <tr><th>Place</th><th>List</th></tr>
  <tr><td>31st</td><td><a href="/decks/list/30537"><i class="far fa-list-alt"></i></a></td></tr>
  <tr><td>33rd</td><td><a href="/decks/list/30539"><i class="far fa-list-alt"></i></a></td></tr>
  <tr><td>42nd</td><td><a href="/decks/list/30537"><i class="far fa-list-alt"></i></a></td></tr>
</table>
<section><a href="/decks/list/99999">not a result</a></section>
`;

const LIST_HTML = `
<title>Dragapult Dusknoir by Tarran Flatt – Limitless</title>
<div class="decklist-column-heading">Pokémon (5)</div>
<div class="decklist-card" data-set="TWM" data-number="128" data-lang="en"  >
  <a class="card-link" href="/cards/TWM/128">
    <span class="card-count">4</span>
    <span class="card-name">Dreepy</span>
  </a>
</div>
<div class="decklist-card" data-set="MEP" data-number="52" data-lang="en"  >
  <a class="card-link" href="/cards/MEP/52">
    <span class="card-count">1</span>
    <span class="card-name">Grookey</span>
  </a>
</div>
<div class="decklist-column-heading">Trainer (2)</div>
<div class="decklist-card" data-set="MEG" data-number="131" data-lang="en"  >
  <a class="card-link" href="/cards/MEG/131">
    <span class="card-count">2</span>
    <span class="card-name">Ultra Ball</span>
  </a>
</div>
<div class="decklist-column-heading">Energy (3)</div>
<div class="decklist-card" data-set="MEE" data-number="13" data-lang="en"   data-basic-energy="5" >
  <a class="card-link" href="/cards/MEE/13">
    <span class="card-count">3</span>
    <span class="card-name">Psychic Energy</span>
  </a>
</div>
`;

describe("sectionFor", () => {
  it("maps the English headings Limitless emits", () => {
    expect(sectionFor("Pokémon (23)")).toBe("pokemon");
    expect(sectionFor("Trainer (29)")).toBe("trainer");
    expect(sectionFor("Energy (8)")).toBe("energy");
  });

  it("maps localized headings from client exports", () => {
    expect(sectionFor("Dresseur (4)")).toBe("trainer");
    expect(sectionFor("Énergie (8)")).toBe("energy");
    expect(sectionFor("Energía (8)")).toBe("energy");
    expect(sectionFor("Allenatore (4)")).toBe("trainer");
    expect(sectionFor("Treinador (4)")).toBe("trainer");
    expect(sectionFor("Energie (8)")).toBe("energy");
  });

  it("returns unknown for anything else", () => {
    expect(sectionFor("Mystery (3)")).toBe("unknown");
    expect(sectionFor("")).toBe("unknown");
  });
});

describe("decodeEntities and htmlToText", () => {
  it("decodes numeric and common named entities", () => {
    expect(decodeEntities("Lillie&#39;s Determination")).toBe("Lillie's Determination");
    expect(decodeEntities("Pok&eacute; Pad")).toBe("Poké Pad");
    expect(decodeEntities("N&nbsp;&amp;&nbsp;Zoroark")).toBe("N & Zoroark");
    expect(decodeEntities("&#x27;")).toBe("'");
  });

  it("strips tags and collapses whitespace", () => {
    expect(htmlToText("  Dragapult <span class=\"annotation\">ex</span>\n ")).toBe("Dragapult ex");
  });
});

describe("slug and fixtureBaseName", () => {
  it("makes a filesystem-safe slug", () => {
    expect(slug("N's Zoroark ex")).toBe("n-s-zoroark-ex");
    expect(slug("Poké Pad")).toBe("poke-pad");
  });

  it("names fixtures by label, list id, and language", () => {
    expect(fixtureBaseName("Dragapult Dusknoir", "30537", "en")).toBe("Dragapult-Dusknoir-30537");
    expect(fixtureBaseName("Dragapult Dusknoir", "30537", "de")).toBe(
      "Dragapult-Dusknoir-30537.de",
    );
    expect(fixtureBaseName("N's Zoroark ex", "30543", "en")).toBe("N-s-Zoroark-ex-30543");
  });
});

describe("parseIndex", () => {
  it("extracts alias rows with labels, ids, ranks, and slugs", () => {
    expect(parseIndex(INDEX_HTML)).toEqual([
      {
        id: "284",
        label: "Dragapult ex",
        deckId: "284",
        variantId: null,
        rank: 1,
        slugs: ["dragapult"],
      },
      {
        id: "339",
        label: "Basic Box",
        deckId: "339",
        variantId: null,
        rank: 2,
        slugs: ["ogerpon", "clefairy"],
      },
      {
        id: "284/3",
        label: "Dragapult Dusknoir",
        deckId: "284",
        variantId: "3",
        rank: 7,
        slugs: ["dragapult", "dusknoir"],
      },
    ]);
  });

  it("fails loudly instead of returning an empty sample on an unexpected page", () => {
    expect(() => parseIndex("<html><body>no table</body></html>")).toThrow(/no data table/);
  });
});

describe("parseVariantPage", () => {
  it("reads the selected variant label and dedupes latest list ids", () => {
    expect(parseVariantPage(VARIANT_HTML, "fallback")).toEqual({
      label: "Dragapult Dusknoir",
      lists: ["30537", "30539"],
    });
  });

  it("returns no lists when the latest-results section is absent", () => {
    expect(parseVariantPage("<html></html>", "fallback")).toEqual({
      label: "fallback",
      lists: [],
    });
  });
});

describe("parseListPage", () => {
  it("reads sections, cards, counts, refs, and the basic-energy flag", () => {
    const page = parseListPage(LIST_HTML);

    expect(page.label).toBe("Dragapult Dusknoir");
    expect(page.headings).toEqual([
      { section: "pokemon", count: 5 },
      { section: "trainer", count: 2 },
      { section: "energy", count: 3 },
    ]);
    expect(page.cards).toEqual([
      {
        setCode: "TWM",
        number: "128",
        count: 4,
        name: "Dreepy",
        section: "pokemon",
        basicEnergy: false,
      },
      {
        setCode: "MEP",
        number: "52",
        count: 1,
        name: "Grookey",
        section: "pokemon",
        basicEnergy: false,
      },
      {
        setCode: "MEG",
        number: "131",
        count: 2,
        name: "Ultra Ball",
        section: "trainer",
        basicEnergy: false,
      },
      {
        setCode: "MEE",
        number: "13",
        count: 3,
        name: "Psychic Energy",
        section: "energy",
        basicEnergy: true,
      },
    ]);
  });

  it("keeps cards under an unknown heading rather than dropping them", () => {
    const page = parseListPage(`
      <div class="decklist-column-heading">Mystery (1)</div>
      <div class="decklist-card" data-set="SVI" data-number="196">
        <span class="card-count">1</span><span class="card-name">Ultra Ball</span>
      </div>
    `);

    expect(page.headings).toEqual([{ section: "unknown", count: 1 }]);
    expect(page.cards[0]?.section).toBe("unknown");
  });

  it("fails when a page has no cards", () => {
    expect(() => parseListPage("<title>Empty by Nobody – Limitless</title>")).toThrow(/no cards/);
  });

  it("fails when a card is missing its set or number attributes", () => {
    expect(() =>
      parseListPage(`
        <div class="decklist-card">
          <span class="card-count">1</span><span class="card-name">Ultra Ball</span>
        </div>
      `),
    ).toThrow(/missing data-set or data-number/);
  });
});

describe("toPtcgl and toPaste", () => {
  const cards = [
    {
      count: 3,
      name: "Psychic Energy",
      setCode: "MEE",
      number: "13",
      section: "energy",
      basicEnergy: true,
    },
    {
      count: 4,
      name: "Dreepy",
      setCode: "TWM",
      number: "128",
      section: "pokemon",
      basicEnergy: false,
    },
    {
      count: 2,
      name: "Ultra Ball",
      setCode: "MEG",
      number: "131",
      section: "trainer",
      basicEnergy: false,
    },
  ];

  it("emits a PTCGL export grouped by section with a total footer", () => {
    expect(toPtcgl(cards)).toBe(
      [
        "Pokémon: 4",
        "4 Dreepy TWM 128",
        "",
        "Trainer: 2",
        "2 Ultra Ball MEG 131",
        "",
        "Energy: 3",
        "3 Psychic Energy MEE 13",
        "",
        "Total Cards: 9",
        "",
      ].join("\n"),
    );
  });

  it("emits a headerless paste", () => {
    expect(toPaste(cards)).toBe(
      ["4 Dreepy TWM 128", "2 Ultra Ball MEG 131", "3 Psychic Energy MEE 13", ""].join("\n"),
    );
  });

  it("keeps an unknown section but does not pretend it is a real PTCGL header", () => {
    const output = toPtcgl([
      {
        count: 1,
        name: "Mystery",
        setCode: "SVI",
        number: "1",
        section: "unknown",
        basicEnergy: false,
      },
    ]);
    expect(output).toBe("Unknown: 1\n1 Mystery SVI 1\n\nTotal Cards: 1\n");
  });
});

describe("sum and hasSplitPrintings", () => {
  const card = (name, setCode, number, count = 1) => ({
    count,
    name,
    setCode,
    number,
    section: "pokemon",
    basicEnergy: false,
  });

  it("totals card counts", () => {
    expect(sum([card("A", "SVI", "1", 2), card("B", "SVI", "2", 3)])).toBe(5);
  });

  it("detects the same name printed in two sets", () => {
    expect(hasSplitPrintings([card("Goldeen", "TWM", "44"), card("Goldeen", "PBL", "13")])).toBe(
      true,
    );
  });

  it("ignores duplicate lines for the same printing", () => {
    expect(hasSplitPrintings([card("Goldeen", "TWM", "44"), card("Goldeen", "TWM", "44")])).toBe(
      false,
    );
  });

  it("is case-insensitive and ref-aware", () => {
    expect(hasSplitPrintings([card("Applin", "TWM", "126"), card("applin", "TWM", "17")])).toBe(
      true,
    );
  });
});

describe("mergeManifest", () => {
  it("accumulates entries across harvest runs and replaces a re-harvested name", () => {
    const existing = [
      { name: "A", total: 60 },
      { name: "B", total: 60 },
    ];
    const fresh = [
      { name: "B", total: 61 },
      { name: "C", total: 60 },
    ];

    expect(mergeManifest(existing, fresh)).toEqual([
      { name: "A", total: 60 },
      { name: "B", total: 61 },
      { name: "C", total: 60 },
    ]);
  });

  it("treats a missing manifest as empty", () => {
    expect(mergeManifest(undefined, [{ name: "A" }])).toEqual([{ name: "A" }]);
  });

  it("sorts entries by name so a re-run is byte-stable", () => {
    expect(mergeManifest([{ name: "B" }], [{ name: "A" }])).toEqual([
      { name: "A" },
      { name: "B" },
    ]);
  });
});

describe("missingRefs", () => {
  const known = new Set(["TWM-128", "MEE-13"]);

  it("returns only refs absent from the catalog", () => {
    expect(
      missingRefs(
        [
          { setCode: "TWM", number: "128" },
          { setCode: "TWM", number: "129" },
          { setCode: "MEE", number: "13" },
        ],
        known,
      ),
    ).toEqual(["TWM-129"]);
  });

  it("returns nothing when every ref is known", () => {
    expect(missingRefs([{ setCode: "MEE", number: "13" }], known)).toEqual([]);
  });
});
