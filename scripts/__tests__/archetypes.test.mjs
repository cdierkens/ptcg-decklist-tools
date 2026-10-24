import { describe, expect, it } from "vitest";

import {
  archetypeId,
  buildArchetypeRows,
  missingSpecies,
  toArchetype,
} from "../lib/archetypes.mjs";

const base = {
  deckId: "284",
  variantId: null,
  label: "Dragapult <span class=\"annotation\">ex</span>",
  rank: 1,
  slugs: ["dragapult"],
};

describe("archetypeId", () => {
  it("normalises a base row to variant 0", () => {
    expect(archetypeId(base)).toBe("limitless:284/0");
  });

  it("keeps the variant id for a variant row", () => {
    expect(archetypeId({ ...base, variantId: "3" })).toBe("limitless:284/3");
  });
});

describe("toArchetype", () => {
  it("keeps a label as text, not markup", () => {
    expect(toArchetype(base, "TEF-30C")).toEqual({
      id: "limitless:284/0",
      label: "Dragapult ex",
      cards: ["dragapult"],
      window: "TEF-30C",
    });
  });

  it("keeps a label-only row and its empty card list", () => {
    expect(toArchetype({ ...base, label: "Basic Box", slugs: [] }, "TEF-30C")).toMatchObject({
      cards: [],
      label: "Basic Box",
    });
  });

  it("keeps ids stable when a label changes", () => {
    const before = toArchetype({ ...base, label: "Dragapult" }, "TEF-30C");
    const after = toArchetype({ ...base, label: "Dragapult ex" }, "TEF-30C");

    expect(after.id).toBe(before.id);
    expect(after.label).not.toBe(before.label);
  });

  it("rejects more than two sprite slugs", () => {
    expect(() =>
      toArchetype({ ...base, slugs: ["dragapult", "dusknoir", "froslass"] }, "TEF-30C"),
    ).toThrow(/at most two/);
  });

  it("dedupes repeated icons", () => {
    expect(toArchetype({ ...base, slugs: ["dragapult", "dragapult"] }, "TEF-30C").cards).toEqual([
      "dragapult",
    ]);
  });

  it("rejects an empty label", () => {
    expect(() => toArchetype({ ...base, label: " <span></span> " }, "TEF-30C")).toThrow(
      /label/,
    );
  });
});

describe("buildArchetypeRows", () => {
  it("keeps the alias order within a window", () => {
    const rows = buildArchetypeRows(
      [
        base,
        { ...base, deckId: "339", label: "Basic Box", slugs: ["ogerpon", "clefairy"] },
      ],
      "TEF-30C",
    );

    expect(rows.map((row) => row.id)).toEqual(["limitless:284/0", "limitless:339/0"]);
  });

  it("rejects a duplicate normalised id in one window", () => {
    expect(() =>
      buildArchetypeRows([base, { ...base, label: "Another label" }], "TEF-30C"),
    ).toThrow(/duplicate/);
  });
});

describe("missingSpecies", () => {
  it("returns unknown slugs once, sorted", () => {
    const rows = [
      { cards: ["dragapult", "missing"] },
      { cards: ["also-missing", "dragapult"] },
    ];

    expect(missingSpecies(rows, new Set(["dragapult"]))).toEqual([
      "also-missing",
      "missing",
    ]);
  });
});
