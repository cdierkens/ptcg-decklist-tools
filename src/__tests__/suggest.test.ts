import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { catalog } from "../data.js";
import { normalizeDecklist } from "../normalize.js";
import { parseDecklist } from "../parse.js";
import { unwrapOrThrow } from "../result.js";
import { suggestArchetype } from "../suggest.js";

function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/decklists/${name}`, import.meta.url), "utf8");
}

function normalize(text: string) {
  return unwrapOrThrow(normalizeDecklist(unwrapOrThrow(parseDecklist(text)), { catalog }));
}

describe("suggestArchetype", () => {
  it("finds Dragapult Dusknoir and explains the alias", () => {
    const suggestions = suggestArchetype(normalize(fixture("Dragapult-Dusknoir-30537.ptcgl.txt")));
    const top = suggestions[0];

    expect(top).toMatchObject({
      id: "limitless:284/3",
      label: "Dragapult Dusknoir",
      cards: ["dragapult", "dusknoir"],
      basis: "alias",
    });
    expect(top?.confidence).toBeGreaterThanOrEqual(0.8);
    expect(top?.reasons.join(" ")).toContain("TEF-30C");
    expect(top?.reasons.length).toBeGreaterThan(0);
  });

  it("prefers Dragapult Dusknoir over the one-card Dragapult alias", () => {
    const suggestions = suggestArchetype(normalize(fixture("Dragapult-Dusknoir-30537.ptcgl.txt")));
    const twoCard = suggestions.find((suggestion) => suggestion.id === "limitless:284/3");
    const oneCard = suggestions.find((suggestion) => suggestion.id === "limitless:284/0");

    expect(twoCard).toBeDefined();
    expect(oneCard).toBeDefined();
    expect(suggestions.indexOf(twoCard!)).toBeLessThan(suggestions.indexOf(oneCard!));
    expect(twoCard?.confidence).toBeGreaterThan(oneCard?.confidence ?? 0);
  });

  it("finds Dragapult Froslass in the previous window without a window hint", () => {
    const deck = normalize("3 Dragapult ex TWM 130\n4 Froslass TWM 53");
    const suggestions = suggestArchetype(deck);
    const top = suggestions[0];

    expect(top).toMatchObject({
      id: "limitless:284/7",
      label: "Dragapult Froslass",
      cards: ["dragapult", "froslass"],
      basis: "alias",
    });
    expect(top?.reasons.join(" ")).toContain("TEF-POR");
  });

  it("scopes matching to a supplied window, case-insensitively", () => {
    const deck = normalize("3 Dragapult ex TWM 130\n4 Froslass TWM 53");

    const current = suggestArchetype(deck, { window: "TEF-30C" });
    expect(current.some((suggestion) => suggestion.id === "limitless:284/7")).toBe(false);

    const previous = suggestArchetype(deck, { window: "tef-por" });
    expect(previous[0]).toMatchObject({
      id: "limitless:284/7",
      label: "Dragapult Froslass",
    });
  });

  it("accepts a FormatWindow object as the scope", () => {
    const deck = normalize("3 Dragapult ex TWM 130\n4 Froslass TWM 53");
    const suggestions = suggestArchetype(deck, {
      window: { base: "TEF", latest: "POR", label: "TEF-POR" },
    });

    expect(suggestions[0]?.id).toBe("limitless:284/7");
  });

  it("finds Basic Box from its Ogerpon and Clefairy icons", () => {
    const deck = normalize("2 Teal Mask Ogerpon ex TWM 25\n2 Lillie's Clefairy ex JTG 56");
    const suggestions = suggestArchetype(deck);
    const top = suggestions[0];

    expect(top).toMatchObject({
      id: "limitless:339/0",
      label: "Basic Box",
      cards: ["ogerpon", "clefairy"],
      basis: "alias",
    });
    expect(top?.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it("keeps a one-card alias deliberately low-confidence", () => {
    const deck = normalize("3 Dragapult ex TWM 130");
    const suggestions = suggestArchetype(deck);
    const top = suggestions[0];

    expect(top).toMatchObject({
      id: "limitless:284/0",
      label: "Dragapult ex",
      cards: ["dragapult"],
      basis: "alias",
    });
    expect(top?.confidence).toBeLessThanOrEqual(0.5);
    expect(top?.reasons.join(" ")).toMatch(/one-card/i);
  });

  it("falls back to evolution lines when no alias matches", () => {
    const deck = normalize("4 Baxcalibur PAL 60");
    const suggestions = suggestArchetype(deck, { archetypes: [] });
    const top = suggestions[0];

    expect(top).toMatchObject({
      basis: "lines",
      cards: ["baxcalibur"],
    });
    expect(top?.id).toContain("dex:996");
    expect(top?.label).toContain("Baxcalibur");
    expect(top?.confidence).toBeLessThanOrEqual(0.5);
    expect(top?.reasons.join(" ")).toMatch(/no alias matched/i);
  });

  it("favours a Stage 2 ex line over a non-ex Stage 2 line", () => {
    const deck = normalize("1 Dragapult ex TWM 130\n1 Baxcalibur PAL 60");
    const suggestions = suggestArchetype(deck, { archetypes: [] });

    expect(suggestions[0]?.label).toContain("Dragapult");
    expect(suggestions[0]?.basis).toBe("lines");
    expect(suggestions[0]?.confidence).toBeLessThanOrEqual(0.5);
  });

  it("sums copies of one species across printings", () => {
    const deck = normalize("3 Dragapult ex TWM 130\n2 Dragapult ex PRE 165\n1 Dusknoir PRE 37");
    const top = suggestArchetype(deck)[0];

    expect(top?.id).toBe("limitless:284/3");
    expect(top?.reasons.join(" ")).toContain("5× Dragapult ex");
  });

  it("never matches a label-only alias by card", () => {
    const deck = normalize("3 Dragapult ex TWM 130");
    const suggestions = suggestArchetype(deck, {
      archetypes: [
        { id: "limitless:1/0", label: "Label only", cards: [], window: "TEF-30C" },
      ],
    });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.basis).toBe("lines");
    expect(suggestions[0]?.label).not.toBe("Label only");
  });

  it("gives every suggestion a reason and a confidence in range", () => {
    const suggestions = suggestArchetype(normalize(fixture("Dragapult-Dusknoir-30537.ptcgl.txt")));

    expect(suggestions.length).toBeGreaterThan(0);
    for (const suggestion of suggestions) {
      expect(suggestion.reasons.length).toBeGreaterThan(0);
      expect(suggestion.confidence).toBeGreaterThanOrEqual(0);
      expect(suggestion.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("favours Mega and VSTAR attackers in line fallback", () => {
    const mega = suggestArchetype(
      normalize("1 Mega Lucario ex ASC 113\n1 Dreepy TWM 128"),
      { archetypes: [] },
    );
    expect(mega[0]?.label).toContain("Mega Lucario");

    const vstar = suggestArchetype(
      normalize("1 Charizard VSTAR BRS 18\n1 Dreepy TWM 128"),
      { archetypes: [] },
    );
    expect(vstar[0]?.label).toContain("Charizard");
  });

  it("returns no suggestions for a deck with no Pokémon", () => {
    expect(suggestArchetype(normalize("4 Ultra Ball MEG 131"))).toEqual([]);
  });
});
