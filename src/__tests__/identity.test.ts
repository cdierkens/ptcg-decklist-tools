import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { catalog, catalogVersion } from "../data.js";
import { canonicalText, countByName, deckId, listId } from "../identity.js";
import { normalizeDecklist } from "../normalize.js";
import { parseDecklist } from "../parse.js";
import { unwrapOrThrow } from "../result.js";

function normalize(text: string) {
  return unwrapOrThrow(normalizeDecklist(unwrapOrThrow(parseDecklist(text)), { catalog }));
}

function golden(value: string) {
  return `sha256:${value}`;
}

function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/decklists/${name}`, import.meta.url), "utf8");
}

const fixtureGoldens = [
  {
    deck: "92678f8ff9391df585090c31d033afb491da407a30f28b3d2e83ee1de8a94c78",
    file: "Dragapult-Dusknoir-30537.ptcgl.txt",
    list: "64268e6e9a9535cc8600d59ef621916c07d7cbdf17a888ed0cd31207b6a43290",
  },
  {
    deck: "92678f8ff9391df585090c31d033afb491da407a30f28b3d2e83ee1de8a94c78",
    file: "Dragapult-Dusknoir-30537.de.ptcgl.txt",
    list: "64268e6e9a9535cc8600d59ef621916c07d7cbdf17a888ed0cd31207b6a43290",
  },
  {
    deck: "92678f8ff9391df585090c31d033afb491da407a30f28b3d2e83ee1de8a94c78",
    file: "Dragapult-Dusknoir-30537.paste.txt",
    list: "64268e6e9a9535cc8600d59ef621916c07d7cbdf17a888ed0cd31207b6a43290",
  },
  {
    deck: "a197295d5a2af7295fd7f7aa2ab9ea7d5b5ccf0c230824dec96490d456094771",
    file: "Festival-Lead-30526.ptcgl.txt",
    list: "1ade1c8cb63232802210d3f592726892a0d4a213e1a68d2aae46b57ae19a463e",
  },
  {
    deck: "82d3609c0be8fdb467c751f898290e7b8f1212ec0f8dcb4f427b03d5ba22ad41",
    file: "Seaking-Festival-Lead-30519.ptcgl.txt",
    list: "314de41422a4c4f820c4cdbf677f1b91027819a5792296419c739db6455ed5a7",
  },
  {
    deck: "7227920ec9e01c465e4473fd201d0838f0099b4de3c32c71f9e9cb70d44da11e",
    file: "ptcgl-de-headers-synthetic.txt",
    list: "70137e66cca1184d05ebd15f0a44f6a8b2f2656eedd13321696287628cc7d2b7",
  },
  {
    deck: "39ca6a14238c79c03fe8063f61de48a0d5bb68124b6a594d85b1e1d9b5370f0e",
    file: "typed-no-refs.txt",
    list: "9768c0207cb2260c3437c2b5b1a4eadbd145489d6d20946dce873b8030f51589",
  },
] as const;

describe("canonicalText", () => {
  it("is the domain plus sorted key:count lines", () => {
    const deck = normalize("4 Ultra Ball SVI 196\n2 Acerola's Mischief MEG 113");

    expect(canonicalText(deck)).toBe(
      [
        "ptcg-decklist@1",
        "f:02c40e9a6efa3ab1:2",
        "f:672ea711a7bc39b6:4",
      ].join("\n"),
    );
  });

  it("does not depend on the order of the source lines", () => {
    const first = normalize("4 Ultra Ball SVI 196\n2 Acerola's Mischief MEG 113");
    const second = normalize("2 Acerola's Mischief MEG 113\n4 Ultra Ball SVI 196");

    expect(canonicalText(second)).toBe(canonicalText(first));
  });

  it("keeps unresolved keys distinct from resolved ones", () => {
    const deck = normalize("4 Ultra Ball XXX 196\n1 Pikachu");

    expect(canonicalText(deck)).toBe(
      ["ptcg-decklist@1", "?:XXX-196:4", "?Pikachu:1"].join("\n"),
    );
  });

  it("merges duplicate keys before hashing", async () => {
    const deck = normalize("4 Acerola's Mischief MEG 113");
    const doubled = { ...deck, entries: [...deck.entries, ...deck.entries] };

    expect(canonicalText(doubled)).toBe(
      ["ptcg-decklist@1", "f:02c40e9a6efa3ab1:8"].join("\n"),
    );
    expect(await deckId(doubled)).toEqual(await deckId(normalize("8 Acerola's Mischief MEG 113")));
    expect(await listId(doubled)).toEqual(
      await listId(normalize("8 Acerola's Mischief MEG 113")),
    );
  });
});

describe("deckId", () => {
  it("hashes the functional multiset with sha256 and a stable golden", async () => {
    const deck = normalize("4 Ultra Ball SVI 196\n2 Acerola's Mischief MEG 113");

    expect(await deckId(deck)).toEqual({
      catalogVersion,
      hashVersion: 1,
      value: golden("7f279d181771bca9479aed5c60609c6e76037acc362d68c02d2d8cc25d7934ff"),
    });
  });

  it("gives shuffled source lines the same id", async () => {
    const first = normalize("4 Ultra Ball SVI 196\n2 Acerola's Mischief MEG 113");
    const second = normalize("2 Acerola's Mischief MEG 113\n4 Ultra Ball SVI 196");

    expect(await deckId(second)).toEqual(await deckId(first));
  });

  it("does not change when only the printing changes", async () => {
    const meg = normalize("4 Acerola's Mischief MEG 113");
    const asc = normalize("4 Acerola's Mischief ASC 180");

    expect(await deckId(meg)).toEqual(await deckId(asc));
    expect((await deckId(meg)).value).toBe(
      golden("c9ceb5842ce9a571ea4a2b3291933ce3cbcbe3c25eab478bc87f6211d09694d7"),
    );
  });

  it("stays the same when a ref-less name resolves to a printing", async () => {
    const nameOnly = normalize("4 Acerola's Mischief");
    const printing = normalize("4 Acerola's Mischief MEG 113");

    expect(await deckId(nameOnly)).toEqual(await deckId(printing));
  });

  it("hashes an unresolved card distinctly", async () => {
    const known = normalize("4 Ultra Ball SVI 196");
    const unknown = normalize("4 Ultra Ball XXX 196");

    expect((await deckId(known)).value).not.toBe((await deckId(unknown)).value);
    expect((await deckId(unknown)).value).toBe(
      golden("f39c5d8268547f3e8ae82c3e26a8d33ca3677ff1e0a00d8e4d93ada5ba81b7ec"),
    );
  });
});

describe("listId", () => {
  it("hashes the printing multiset with sha256 and a stable golden", async () => {
    const deck = normalize("4 Ultra Ball SVI 196\n2 Acerola's Mischief MEG 113");

    expect(await listId(deck)).toEqual({
      catalogVersion,
      hashVersion: 1,
      value: golden("4391dbf75f33157b691a9fa87c5ffd2056d20d4e91b61b0a8fb8ea9dcaa6a218"),
    });
  });

  it("changes when the printing swaps without changing the deck", async () => {
    const meg = normalize("4 Acerola's Mischief MEG 113");
    const asc = normalize("4 Acerola's Mischief ASC 180");

    expect((await listId(meg)).value).not.toBe((await listId(asc)).value);
    expect((await listId(asc)).value).toBe(
      golden("293de5b081a2959f6548db7b804107b39d1d23f1473fc05c11048e1eba28720d"),
    );
  });

  it("distinguishes a ref-less name from a resolved printing", async () => {
    const nameOnly = normalize("4 Acerola's Mischief");
    const printing = normalize("4 Acerola's Mischief MEG 113");

    expect((await listId(nameOnly)).value).toBe(
      golden("6f370ac1b89d52943e802b393ed2061c2793e52b3529e7c194a22ff13f1ab274"),
    );
    expect((await listId(printing)).value).not.toBe((await listId(nameOnly)).value);
  });

  it("keeps the copies that have no printing when a line merges", async () => {
    const deck = normalize("2 Poké Pad POR 81\n2 Poké Pad");

    expect(deck.entries[0]?.count).toBe(4);
    expect((await listId(deck)).value).toBe(
      golden("374b067c58a275d4ceb145a589f8550d4c67497fbe4ef0f4719a4cacf5703d74"),
    );
  });

  it("hashes unresolved keys distinctly", async () => {
    const deck = normalize("4 Ultra Ball XXX 196\n1 Pikachu");

    expect((await listId(deck)).value).toBe(
      golden("5e4c2f70cd60db7aac50cf883e61ff211b6352073fb306a26bcde149b12c3790"),
    );
  });
});

describe("fixture goldens", () => {
  it("matches the deck and list ids for every fixture", async () => {
    for (const fixtureGolden of fixtureGoldens) {
      const deck = normalize(fixture(fixtureGolden.file));
      expect((await deckId(deck)).value, fixtureGolden.file).toBe(
        golden(fixtureGolden.deck),
      );
      expect((await listId(deck)).value, fixtureGolden.file).toBe(
        golden(fixtureGolden.list),
      );
    }
  });

  it("gives the English, German, and paste forms the same ids", async () => {
    const english = normalize(fixture("Dragapult-Dusknoir-30537.ptcgl.txt"));
    const german = normalize(fixture("Dragapult-Dusknoir-30537.de.ptcgl.txt"));
    const paste = normalize(fixture("Dragapult-Dusknoir-30537.paste.txt"));

    expect(await deckId(german)).toEqual(await deckId(english));
    expect(await deckId(paste)).toEqual(await deckId(english));
    expect(await listId(german)).toEqual(await listId(english));
    expect(await listId(paste)).toEqual(await listId(english));
  });
});

describe("countByName", () => {
  it("sums copies across printings into one name", () => {
    const deck = normalize(
      "4 Acerola's Mischief MEG 113\n2 Acerola's Mischief ASC 180\n2 Acerola's Mischief",
    );

    expect(countByName(deck)).toEqual([{ count: 8, name: "Acerola's Mischief" }]);
  });

  it("sums different functions that share a name", () => {
    const deck = normalize("4 Pikachu MEW 173\n4 Pikachu PAF 131");

    expect(countByName(deck)).toEqual([{ count: 8, name: "Pikachu" }]);
  });

  it("is separate from identity", async () => {
    const split = normalize("4 Pikachu MEW 173\n4 Pikachu PAF 131");
    const single = normalize("4 Pikachu MEW 173\n4 Pikachu MEW 173");

    expect(countByName(split)).toEqual(countByName(single));
    expect((await deckId(split)).value).not.toBe((await deckId(single)).value);
  });

  it("combines an ambiguous name with a resolved card", () => {
    const deck = normalize("4 Pikachu\n2 Pikachu MEW 173");

    expect(countByName(deck)).toEqual([{ count: 6, name: "Pikachu" }]);
  });

  it("uses the written name for an unresolved ref", () => {
    const deck = normalize("4 Ultra Ball XXX 196");

    expect(countByName(deck)).toEqual([{ count: 4, name: "Ultra Ball" }]);
  });

  it("sorts by name", () => {
    const deck = normalize("1 Scyther TEF 1\n4 Acerola's Mischief MEG 113");

    expect(countByName(deck)).toEqual([
      { count: 4, name: "Acerola's Mischief" },
      { count: 1, name: "Scyther" },
    ]);
  });
});
