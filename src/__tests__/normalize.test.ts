import { describe, expect, it } from "vitest";

import { catalogVersion } from "../data.js";
import {
  isErr,
  normalizeDecklist,
  parseDecklist,
  unwrapOrThrow,
} from "../index.js";
import { fixture, normalize } from "./support.js";

describe("normalizeDecklist", () => {
  it("resolves a ref through the live code and a padded local id", () => {
    const deck = normalize("4 Scyther TEF 001");

    expect(deck.catalogVersion).toBe(catalogVersion);
    expect(deck.total).toBe(4);
    expect(deck.warnings).toEqual([]);
    expect(deck.entries).toEqual([
      {
        card: expect.objectContaining({ ref: "TEF-1", name: "Scyther", category: "pokemon" }),
        count: 4,
        key: "f:efe7625b302d57af",
        name: "Scyther",
        printings: [{ count: 4, ref: "TEF-1" }],
        section: "pokemon",
      },
    ]);
  });

  it("folds names and merges a ref-less line into the same functional key", () => {
    const deck = normalize("2 Poke\u0301 Pad POR 81\n2 Poké   Pad");

    expect(deck.entries).toHaveLength(1);
    const entry = deck.entries[0];
    expect(entry?.key).toBe("f:d505c0a758fde5e6");
    expect(entry?.name).toBe("Poké Pad");
    expect(entry?.count).toBe(4);
    expect(entry?.section).toBe("trainer");
    expect(entry?.card).toEqual(
      expect.objectContaining({ ref: "POR-81", name: "Poké Pad", category: "trainer" }),
    );
    expect(entry?.printings).toEqual([{ count: 2, ref: "POR-81" }]);
    expect(deck.warnings).toEqual([]);
  });

  it("resolves a unique ref-less name even when it has several printings", () => {
    const deck = normalize("4 Acerola’s Mischief");

    expect(deck.entries).toHaveLength(1);
    const entry = deck.entries[0];
    expect(entry?.key).toBe("f:02c40e9a6efa3ab1");
    expect(entry?.count).toBe(4);
    expect(entry?.section).toBe("trainer");
    expect(entry?.card).toEqual(
      expect.objectContaining({ name: "Acerola's Mischief", category: "trainer" }),
    );
    expect(entry?.printings).toEqual([]);
    expect(deck.warnings).toEqual([]);
  });

  it("keeps an ambiguous ref-less name unresolved and warns", () => {
    const deck = normalize("4 Pikachu");

    expect(deck.entries).toHaveLength(1);
    const entry = deck.entries[0];
    expect(entry?.key).toBe("?Pikachu");
    expect(entry?.name).toBe("Pikachu");
    expect(entry?.card).toBeNull();
    expect(entry?.section).toBe("unknown");
    expect(entry?.printings).toEqual([]);
    expect(deck.warnings).toEqual([
      {
        code: "ambiguous-name",
        line: 1,
        message: 'Name "Pikachu" matches more than one card; keeping it unresolved.',
      },
    ]);
  });

  it("warns distinctly about an unknown set and an unknown number", () => {
    const deck = normalize("4 Ultra Ball XXX 196\n4 Ultra Ball SVI 9999");

    expect(deck.entries.map((entry) => entry.key)).toEqual([
      "?:XXX-196",
      "?:SVI-9999",
    ].sort());
    expect(deck.entries.map((entry) => entry.name)).toEqual(["Ultra Ball", "Ultra Ball"]);
    expect(deck.entries.every((entry) => entry.card === null)).toBe(true);
    expect(deck.entries.map((entry) => entry.printings)).toEqual([
      [{ count: 4, ref: "SVI-9999" }],
      [{ count: 4, ref: "XXX-196" }],
    ]);
    expect(deck.warnings).toEqual([
      {
        code: "unknown-set",
        line: 1,
        message: 'Unknown set "XXX" for ref "XXX-196".',
      },
      {
        code: "unknown-card",
        line: 2,
        message: 'Unknown card "SVI-9999".',
      },
    ]);
  });

  it("warns when a ref-less name is not in the catalog", () => {
    const deck = normalize("4 Not A Real Card");

    expect(deck.entries[0]?.key).toBe("?Not A Real Card");
    expect(deck.entries[0]?.name).toBe("Not A Real Card");
    expect(deck.entries[0]?.card).toBeNull();
    expect(deck.warnings).toEqual([
      {
        code: "unknown-card",
        line: 1,
        message: 'Name "Not A Real Card" is not in the catalog.',
      },
    ]);
  });

  it("lets the catalog win a section conflict", () => {
    const deck = normalize("Pokémon: 4\n4 Acerola's Mischief MEG 113");

    expect(deck.entries[0]?.section).toBe("trainer");
    expect(deck.warnings).toContainEqual({
      code: "section-mismatch",
      line: 2,
      message: 'Catalog says "Acerola\'s Mischief" is a trainer card; the list put it under pokemon.',
    });
  });

  it("infers the section when the list has no header", () => {
    const deck = normalize("4 Acerola's Mischief MEG 113");

    expect(deck.entries[0]?.section).toBe("trainer");
    expect(deck.warnings).toEqual([]);
  });

  it("merges printings and picks the most-copied form", () => {
    const deck = normalize("4 Acerola's Mischief MEG 113\n2 Acerola's Mischief ASC 180");

    expect(deck.entries).toHaveLength(1);
    const entry = deck.entries[0];
    expect(entry?.key).toBe("f:02c40e9a6efa3ab1");
    expect(entry?.count).toBe(6);
    expect(entry?.card).toEqual(expect.objectContaining({ ref: "MEG-113" }));
    expect(entry?.printings).toEqual([
      { count: 2, ref: "ASC-180" },
      { count: 4, ref: "MEG-113" },
    ]);
  });

  it("breaks a representative tie by set order, then ref", () => {
    const deck = normalize("2 Acerola's Mischief MEG 113\n2 Acerola's Mischief ASC 180");

    expect(deck.entries[0]?.printings).toEqual([
      { count: 2, ref: "ASC-180" },
      { count: 2, ref: "MEG-113" },
    ]);
    expect(deck.entries[0]?.card).toEqual(expect.objectContaining({ ref: "ASC-180" }));
  });

  it("sums duplicate lines for the same printing", () => {
    const deck = normalize("4 Scyther TEF 1\n2 Scyther TEF 001");

    expect(deck.entries).toHaveLength(1);
    expect(deck.entries[0]?.count).toBe(6);
    expect(deck.entries[0]?.printings).toEqual([{ count: 6, ref: "TEF-1" }]);
  });

  it("upgrades an unknown section when a later line has a header", () => {
    const deck = normalize("4 Ultra Ball XXX 196\nTrainer: 4\n4 Ultra Ball XXX 196");

    expect(deck.entries).toHaveLength(1);
    expect(deck.entries[0]?.section).toBe("trainer");
  });

  it("carries parse warnings forward", () => {
    const deck = normalize("4 Ultra Ball SVI 196\nTotal Cards: 5");

    expect(deck.warnings).toContainEqual({
      code: "total-mismatch",
      line: 2,
      message: "Total header declares 5, parsed 4.",
    });
  });

  it("returns a missing-catalog error instead of throwing", () => {
    const parsed = unwrapOrThrow(parseDecklist("4 Ultra Ball SVI 196"));
    const result = normalizeDecklist(parsed);

    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error[0]?.code).toBe("missing-catalog");
  });

  it("gives a localized export the same functional keys", () => {
    const english = normalize(fixture("Dragapult-Dusknoir-30537.ptcgl.txt"));
    const german = normalize(fixture("Dragapult-Dusknoir-30537.de.ptcgl.txt"));

    expect(german.entries.map((entry) => entry.key)).toEqual(
      english.entries.map((entry) => entry.key),
    );
    expect(german.entries.map((entry) => entry.count)).toEqual(
      english.entries.map((entry) => entry.count),
    );
    expect(german.entries.map((entry) => entry.name)).toEqual(
      english.entries.map((entry) => entry.name),
    );
    expect(german.total).toBe(english.total);
    expect(german.warnings).toEqual(english.warnings);
  });

  it("reports the summed total of the entries", () => {
    const deck = normalize("4 Scyther TEF 001\n2 Acerola's Mischief MEG 113");

    expect(deck.total).toBe(6);
    expect(deck.entries).toHaveLength(2);
  });
});
