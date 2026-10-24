import { describe, expect, it } from "vitest";

import { isErr, parseDecklist, unwrapOrThrow } from "../index.js";
import { fixture } from "./support.js";

function parseFixture(name: string) {
  return unwrapOrThrow(parseDecklist(fixture(name)));
}

describe("parseDecklist", () => {
  it("rejects empty and whitespace-only input", () => {
    for (const text of ["", "  \n\t\r\n", "\uFEFF"]) {
      const result = parseDecklist(text);
      expect(isErr(result)).toBe(true);
      if (isErr(result)) expect(result.error[0]?.code).toBe("empty-input");
    }
  });

  it("rejects headers without any card lines", () => {
    const result = parseDecklist("Pokémon: 0\nTrainer: 0\nTotal Cards: 0");
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error[0]?.code).toBe("no-entries");
  });

  it("parses a normal PTCGL export", () => {
    const deck = parseFixture("Dragapult-Dusknoir-30537.ptcgl.txt");

    expect(deck.total).toBe(60);
    expect(deck.warnings).toEqual([]);
    expect(deck.entries).toHaveLength(27);
    expect(deck.entries[0]).toEqual({
      count: 4,
      line: 2,
      name: "Dreepy",
      ref: { number: "128", setCode: "TWM" },
      section: "pokemon",
    });
    expect(deck.entries.at(-1)).toEqual({
      count: 2,
      line: 32,
      name: "Darkness Energy",
      ref: { number: "15", setCode: "MEE" },
      section: "energy",
    });
    expect(
      deck.entries
        .filter((entry) => entry.section === "pokemon")
        .reduce((total, entry) => total + entry.count, 0),
    ).toBe(23);
    expect(
      deck.entries
        .filter((entry) => entry.section === "trainer")
        .reduce((total, entry) => total + entry.count, 0),
    ).toBe(29);
    expect(
      deck.entries
        .filter((entry) => entry.section === "energy")
        .reduce((total, entry) => total + entry.count, 0),
    ).toBe(8);
  });

  it("keeps split printings as separate lines", () => {
    const deck = parseFixture("Seaking-Festival-Lead-30519.ptcgl.txt");
    const goldeens = deck.entries.filter((entry) => entry.name === "Goldeen");

    expect(deck.total).toBe(60);
    expect(goldeens).toHaveLength(2);
    expect(goldeens.map((entry) => entry.ref)).toEqual([
      { number: "44", setCode: "TWM" },
      { number: "13", setCode: "PBL" },
    ]);
    expect(goldeens.map((entry) => entry.count)).toEqual([3, 1]);
  });

  it("parses promos and basic energy", () => {
    const deck = parseFixture("Festival-Lead-30526.ptcgl.txt");
    const applins = deck.entries.filter((entry) => entry.name === "Applin");
    const grassEnergy = deck.entries.find((entry) => entry.name === "Grass Energy");

    expect(deck.total).toBe(60);
    expect(deck.entries.find((entry) => entry.name === "Grookey")?.ref).toEqual({
      number: "52",
      setCode: "MEP",
    });
    expect(grassEnergy?.section).toBe("energy");
    expect(grassEnergy?.ref).toEqual({ number: "9", setCode: "MEE" });
    expect(applins.map((entry) => entry.ref)).toEqual([
      { number: "126", setCode: "TWM" },
      { number: "17", setCode: "TWM" },
    ]);
  });

  it("parses a Limitless paste with no headers or footer", () => {
    const deck = parseFixture("Dragapult-Dusknoir-30537.paste.txt");

    expect(deck.total).toBeNull();
    expect(deck.warnings).toEqual([]);
    expect(deck.entries).toHaveLength(27);
    expect(new Set(deck.entries.map((entry) => entry.section))).toEqual(new Set(["unknown"]));
  });

  it("parses a hand-typed list and keeps every ref-less line", () => {
    const deck = parseFixture("typed-no-refs.txt");

    expect(deck.entries).toHaveLength(20);
    expect(deck.entries.every((entry) => entry.ref === null)).toBe(true);
    expect(deck.entries.find((entry) => entry.name === "Pikachu")?.count).toBe(1);
    expect(deck.total).toBeNull();
  });

  it("parses localized card names with English headers", () => {
    const deck = parseFixture("Dragapult-Dusknoir-30537.de.ptcgl.txt");

    expect(deck.total).toBe(60);
    expect(deck.warnings).toEqual([]);
    expect(deck.entries).toHaveLength(27);
    expect(deck.entries[0]?.name).toBe("Grolldra");
    expect(deck.entries[0]?.ref).toEqual({ number: "128", setCode: "TWM" });
    expect(deck.entries.at(-1)?.name).toBe("Finsternis-Energie");
    expect(deck.entries.at(-1)?.ref).toEqual({ number: "15", setCode: "MEE" });
  });

  it("parses synthetic localized headers", () => {
    const deck = parseFixture("ptcgl-de-headers-synthetic.txt");

    expect(deck.total).toBe(16);
    expect(deck.warnings).toEqual([]);
    expect(deck.entries.filter((entry) => entry.section === "energy")).toHaveLength(1);
    expect(deck.entries.at(-1)?.section).toBe("energy");
  });

  it.each([
    ["French", "Pokémon: 1\n1 A SVI 1\nDresseur: 1\n1 B SVI 2\nÉnergie: 1\n1 C SVE 1\nCartes au total: 3"],
    ["Spanish", "Pokémon: 1\n1 A SVI 1\nEntrenador: 1\n1 B SVI 2\nEnergía: 1\n1 C SVE 1\nCartas totales: 3"],
    ["Italian", "Pokémon: 1\n1 A SVI 1\nAllenatore: 1\n1 B SVI 2\nEnergia: 1\n1 C SVE 1\nCarte totali: 3"],
    ["Portuguese", "Pokémon: 1\n1 A SVI 1\nTreinador: 1\n1 B SVI 2\nEnergia: 1\n1 C SVE 1\nCartas no total: 3"],
  ])("maps %s section and total headers", (_language, text) => {
    const deck = unwrapOrThrow(parseDecklist(text));

    expect(deck.warnings).toEqual([]);
    expect(deck.total).toBe(3);
    expect(deck.entries.map((entry) => entry.section)).toEqual(["pokemon", "trainer", "energy"]);
  });

  it("warns on an unknown section header and keeps its entries", () => {
    const deck = unwrapOrThrow(
      parseDecklist("Mystery: 3\n3 Ultra Ball SVI 196\nTotal Cards: 3"),
    );

    expect(deck.entries).toHaveLength(1);
    expect(deck.entries[0]?.section).toBe("unknown");
    expect(deck.warnings).toEqual([
      {
        code: "unrecognised-line",
        line: 1,
        message: 'Unrecognised section header "Mystery: 3"; entries below it have no section.',
      },
    ]);
  });

  it("warns on a line that is neither a card nor a header", () => {
    const deck = unwrapOrThrow(parseDecklist("4 Ultra Ball SVI 196\nthis is not a card"));

    expect(deck.entries).toHaveLength(1);
    expect(deck.warnings).toEqual([
      { code: "unrecognised-line", line: 2, message: 'Unrecognised line: "this is not a card".' },
    ]);
  });

  it("warns on counts outside 1–60 but keeps the entries", () => {
    const deck = unwrapOrThrow(parseDecklist("0 Ultra Ball SVI 196\n61 Ultra Ball SVI 196"));

    expect(deck.entries.map((entry) => entry.count)).toEqual([0, 61]);
    expect(deck.warnings.map((entry) => entry.code)).toEqual(["invalid-count", "invalid-count"]);
  });

  it("warns when the total footer disagrees with the entries", () => {
    const deck = unwrapOrThrow(parseDecklist("4 Ultra Ball SVI 196\nTotal Cards: 60"));

    expect(deck.total).toBe(60);
    expect(deck.warnings).toEqual([
      { code: "total-mismatch", line: 2, message: "Total header declares 60, parsed 4." },
    ]);
  });

  it("warns when a section header disagrees with its entries", () => {
    const deck = unwrapOrThrow(parseDecklist("Pokémon: 2\n4 Ultra Ball SVI 196"));

    expect(deck.warnings).toEqual([
      { code: "section-mismatch", line: 1, message: "pokemon header declares 2, parsed 4." },
    ]);
  });

  it("handles a BOM and CRLF line endings", () => {
    const deck = unwrapOrThrow(
      parseDecklist("\uFEFFPokémon: 4\r\n4 Ultra Ball SVI 196\r\nTotal Cards: 4\r\n"),
    );

    expect(deck.total).toBe(4);
    expect(deck.warnings).toEqual([]);
    expect(deck.entries[0]?.line).toBe(2);
  });

  it("keeps duplicate lines instead of merging them", () => {
    const deck = unwrapOrThrow(parseDecklist("4 Ultra Ball SVI 196\n4 Ultra Ball SVI 196"));

    expect(deck.entries).toHaveLength(2);
    expect(deck.entries.map((entry) => entry.count)).toEqual([4, 4]);
  });

  it("only treats an uppercase SET NUM suffix as a ref", () => {
    const deck = unwrapOrThrow(
      parseDecklist(
        [
          "4 Mew 151",
          "4 Mewtwo ex MEW 150",
          "4 Galarian Moltres V ASR:TG TG01",
          "4 Pikachu SWSH 014",
          "4 Pikachu swsh 014",
          "4 Charizard ex OBF",
        ].join("\n"),
      ),
    );

    expect(deck.entries.map((entry) => entry.ref)).toEqual([
      null,
      { number: "150", setCode: "MEW" },
      { number: "TG01", setCode: "ASR:TG" },
      { number: "014", setCode: "SWSH" },
      null,
      null,
    ]);
    expect(deck.entries[0]?.name).toBe("Mew 151");
  });

  it("keeps refs stable across a localized fixture", () => {
    const english = parseFixture("Dragapult-Dusknoir-30537.ptcgl.txt");
    const german = parseFixture("Dragapult-Dusknoir-30537.de.ptcgl.txt");

    expect(german.entries.map((entry) => entry.ref)).toEqual(
      english.entries.map((entry) => entry.ref),
    );
    expect(german.entries.map((entry) => entry.name)).not.toEqual(
      english.entries.map((entry) => entry.name),
    );
  });

  it("keeps harvested fixtures catalog-addressable and consistent with their metadata", () => {
    const manifest = JSON.parse(fixture("manifest.json")) as Array<{
      name: string;
      total: number;
      missingCatalogRefs: string[];
    }>;

    expect(manifest.length).toBeGreaterThanOrEqual(4);
    for (const entry of manifest) {
      expect(entry.missingCatalogRefs).toEqual([]);
      expect(parseFixture(`${entry.name}.ptcgl.txt`).total).toBe(entry.total);
    }
  });

  it("warns once when a count cannot be represented safely", () => {
    const deck = unwrapOrThrow(
      parseDecklist("999999999999999999999 Ultra Ball SVI 196\n4 Ultra Ball SVI 196"),
    );

    expect(deck.entries).toHaveLength(1);
    expect(deck.warnings).toEqual([
      {
        code: "invalid-count",
        line: 1,
        message: 'Invalid card count "999999999999999999999".',
      },
    ]);
  });

  it("warns when total headers disagree with each other", () => {
    const deck = unwrapOrThrow(
      parseDecklist("4 Ultra Ball SVI 196\nTotal Cards: 4\nTotal Cards: 5"),
    );

    expect(deck.warnings.map((entry) => entry.code)).toEqual([
      "total-mismatch",
      "total-mismatch",
    ]);
  });

  it("warns when a header count cannot be represented safely", () => {
    const deck = unwrapOrThrow(
      parseDecklist("Pokémon: 999999999999999999999\n4 Ultra Ball SVI 196"),
    );

    expect(deck.total).toBeNull();
    expect(deck.warnings).toEqual([
      {
        code: "invalid-count",
        line: 1,
        message: 'Invalid header count "999999999999999999999".',
      },
    ]);
  });

  it("never throws on arbitrary text", () => {
    const alphabet = [
      "0",
      "1",
      "4",
      "6",
      " ",
      "\n",
      "\r",
      "\t",
      "A",
      "z",
      "é",
      "\u0000",
      "\uFEFF",
      ":",
      "-",
      "'",
      "~",
    ];
    let seed = 123456789;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };

    for (let sample = 0; sample < 250; sample += 1) {
      let text = "";
      const length = Math.floor(random() * 200);
      for (let index = 0; index < length; index += 1) {
        text += alphabet[Math.floor(random() * alphabet.length)] ?? "";
      }
      expect(() => parseDecklist(text)).not.toThrow();
    }
  });

  it("rejects non-string input without throwing", () => {
    const result = parseDecklist(null as unknown as string);

    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error[0]?.code).toBe("empty-input");
  });

  it("parses a colon in a card name without mistaking it for a header", () => {
    const deck = unwrapOrThrow(parseDecklist("4 Boss's Orders: Cyrus PAL 172"));

    expect(deck.entries[0]?.name).toBe("Boss's Orders: Cyrus");
    expect(deck.entries[0]?.ref).toEqual({ number: "172", setCode: "PAL" });
  });
});
