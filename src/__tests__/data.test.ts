import { describe, expect, it } from "vitest";

import { archetypes, cards, catalogVersion, sets } from "../data.js";

const cardKeys = [
  "category",
  "function",
  "line",
  "name",
  "ref",
  "regulationMark",
  "species",
  "stage",
  "tcgdexId",
];

const setKeys = [
  "era",
  "liveAddressable",
  "liveCode",
  "name",
  "order",
  "paddingWidth",
  "releaseDate",
  "tcgdexId",
];

describe("shipped catalog", () => {
  it("stamps a catalog version", () => {
    expect(catalogVersion).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("carries a full set list in release order", () => {
    expect(sets.length).toBeGreaterThan(180);
    expect(sets.map((set) => set.order)).toEqual(sets.map((_, index) => index));

    for (let index = 1; index < sets.length; index += 1) {
      const previous = sets[index - 1];
      const current = sets[index];
      expect(previous).toBeDefined();
      expect(current).toBeDefined();
      if (!previous || !current) continue;
      expect((current.releaseDate ?? "").localeCompare(previous.releaseDate ?? "")).toBeGreaterThanOrEqual(0);
    }

    for (const set of sets) {
      expect(Object.keys(set).sort()).toEqual(setKeys);
      expect(set.liveCode).toMatch(/^[A-Z0-9:]+$/);
      expect(set.tcgdexId.length).toBeGreaterThan(0);
      expect(set.paddingWidth).toBeGreaterThanOrEqual(1);
    }
  });

  it("bakes the parent-prefix answer for the 30C collision", () => {
    const celebration = sets.find((set) => set.tcgdexId === "30th");
    const classic = sets.find((set) => set.tcgdexId === "30th-c");

    expect(celebration).toMatchObject({ liveAddressable: true, liveCode: "30C" });
    expect(classic).toMatchObject({ liveAddressable: false, liveCode: "30C" });
  });

  it("carries every addressable printing with only public fields", () => {
    expect(cards.length).toBeGreaterThan(18_000);

    for (const card of cards) {
      expect(Object.keys(card).sort()).toEqual(cardKeys);
      expect(card.name.length).toBeGreaterThan(0);
      expect(["pokemon", "trainer", "energy"]).toContain(card.category);
      expect(card.function).toMatch(/^[0-9a-f]{16}$/);
      const liveCode = card.ref.slice(0, card.ref.indexOf("-"));
      expect(sets.some((set) => set.liveCode === liveCode && set.liveAddressable)).toBe(true);
      expect(card.species === null || /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(card.species)).toBe(true);
      expect(card.stage === null || ["basic", "stage1", "stage2"].includes(card.stage)).toBe(true);
      if (card.category !== "pokemon") {
        expect(card.line).toBeNull();
      } else {
        expect(card.line === null || card.line.startsWith("dex:")).toBe(true);
      }
    }
  });

  it("keeps Live refs unique", () => {
    expect(new Set(cards.map((card) => card.ref)).size).toBe(cards.length);
  });

  it("does not let a regulation mark fork a functional card", () => {
    const ultraBallG = cards.find((card) => card.ref === "PAF-91");
    const ultraBallI = cards.find((card) => card.ref === "MEG-131");

    expect(ultraBallG?.name).toBe("Ultra Ball");
    expect(ultraBallI?.name).toBe("Ultra Ball");
    expect(ultraBallG?.function).toBe(ultraBallI?.function);
  });

  it("resolves a known Temporal Forces card", () => {
    const skitty = cards.find((card) => card.tcgdexId === "sv05-130");

    expect(skitty).toMatchObject({
      category: "pokemon",
      line: "dex:300",
      name: "Skitty",
      ref: "TEF-130",
      regulationMark: "H",
      stage: "basic",
    });
    expect(skitty?.function).toMatch(/^[0-9a-f]{16}$/);
  });

  it("groups an evolution line and carries the species slug", () => {
    const dragapult = cards.filter((card) => card.species === "dragapult");

    expect(dragapult.length).toBeGreaterThan(0);
    for (const card of dragapult) expect(card.line).toBe("dex:885");
  });

  it("does not ship card text or images", () => {
    for (const card of cards) {
      expect(card).not.toHaveProperty("attacks");
      expect(card).not.toHaveProperty("abilities");
      expect(card).not.toHaveProperty("effect");
      expect(card).not.toHaveProperty("image");
      expect(card).not.toHaveProperty("description");
    }
  });

  it("loads an archetype table (empty until the alias ticket)", () => {
    expect(Array.isArray(archetypes)).toBe(true);
  });
});
