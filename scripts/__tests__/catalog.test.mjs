import { describe, expect, it } from "vitest";

import {
  addressableSets,
  buildEvolutionLines,
  buildSets,
  buildSpeciesResolver,
  fingerprintOf,
  liveNumber,
  speciesEntries,
} from "../lib/catalog.mjs";

function setInput(overrides) {
  return {
    cardFiles: ["001.ts"],
    era: "sv",
    liveCode: "TEF",
    name: "Temporal Forces",
    releaseDate: "2024-03-22",
    tcgdexId: "sv05",
    ...overrides,
  };
}

describe("liveNumber", () => {
  it("strips numeric leading zeroes but keeps promo suffixes", () => {
    expect(liveNumber("001")).toBe("1");
    expect(liveNumber("0001")).toBe("1");
    expect(liveNumber("TG01")).toBe("TG01");
    expect(liveNumber("103a")).toBe("103A");
  });
});

describe("buildSets", () => {
  it("resolves the parent of a colliding live code and orders by release date", () => {
    const sets = buildSets([
      setInput({ releaseDate: "2025-01-01", tcgdexId: "30th-c", liveCode: "30C" }),
      setInput({ releaseDate: "2024-01-01", tcgdexId: "sv05", liveCode: "TEF" }),
      setInput({ releaseDate: "2024-06-01", tcgdexId: "30th", liveCode: "30C" }),
    ]);

    expect(sets.map((set) => set.tcgdexId)).toEqual(["sv05", "30th", "30th-c"]);
    expect(sets.map((set) => set.order)).toEqual([0, 1, 2]);
    expect(sets.find((set) => set.tcgdexId === "30th")?.liveAddressable).toBe(true);
    expect(sets.find((set) => set.tcgdexId === "30th-c")?.liveAddressable).toBe(false);
  });

  it("uses the first card file width for padding", () => {
    const [set] = buildSets([setInput({ cardFiles: ["076.ts"] })]);
    expect(set.paddingWidth).toBe(3);
  });
});

describe("addressableSets", () => {
  it("keeps the lowest-order set for a duplicated live code", () => {
    const index = addressableSets([
      { liveAddressable: true, liveCode: "30C", order: 9 },
      { liveAddressable: true, liveCode: "30C", order: 3 },
    ]);

    expect(index.get("30C")?.order).toBe(3);
  });
});

describe("buildEvolutionLines", () => {
  it("unions an evolve-from name with its parent dex id", () => {
    const cards = [
      {
        category: "Pokemon",
        name: "Pikachu",
        source: { dexId: [25] },
      },
      {
        category: "Pokemon",
        name: "Raichu",
        source: { dexId: [26], evolveFrom: "Pikachu" },
      },
    ];
    const lineOf = buildEvolutionLines(cards);

    expect(lineOf(cards[0])).toBe("dex:25");
    expect(lineOf(cards[1])).toBe("dex:25");
    expect(lineOf({ category: "Trainer", source: {} })).toBeNull();
  });
});

describe("species resolution", () => {
  const entries = speciesEntries([
    { name: "Ogerpon", slug: "ogerpon" },
    { name: "Ogerpon", nameIncludes: "Wellspring", slug: "ogerpon-wellspring" },
  ]);

  it("prefers a nameIncludes rule over the bare species", () => {
    const speciesOf = buildSpeciesResolver(entries);

    expect(speciesOf({ category: "Pokemon", name: "Ogerpon ex" })).toBe("ogerpon");
    expect(speciesOf({ category: "Pokemon", name: "Ogerpon Wellspring Mask ex" })).toBe(
      "ogerpon-wellspring",
    );
  });

  it("rejects an invalid slug", () => {
    expect(() => speciesEntries([{ name: "Bad", slug: "Not A Slug" }])).toThrow(/slug/);
  });
});

describe("fingerprintOf", () => {
  const source = {
    category: "Pokemon",
    hp: 60,
    name: "Pikachu",
    types: ["Lightning"],
  };

  it("is 16 hex characters and ignores printing fields", () => {
    const before = fingerprintOf({ ...source, set: "sv05", rarity: "Common" });
    const after = fingerprintOf({ ...source, set: "sv06", rarity: "Rare" });

    expect(before.short).toMatch(/^[0-9a-f]{16}$/);
    expect(after.short).toBe(before.short);
  });

  it("changes when card behaviour changes", () => {
    expect(fingerprintOf({ ...source, hp: 70 }).short).not.toBe(fingerprintOf(source).short);
  });
});
