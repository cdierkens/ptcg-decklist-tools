import { describe, expect, it } from "vitest";

import { addressableSets, liveNumber } from "../../scripts/lib/catalog.mjs";
import { catalogContext } from "../catalog.js";
import { catalog } from "../data.js";
import { normalizeNumber, setCodeOf } from "../refs.js";

describe("catalog contract", () => {
  const context = catalogContext(catalog);
  const buildIndex = addressableSets(catalog.sets);

  it("resolves the same addressable sets as the build", () => {
    expect([...context.setByLiveCode.keys()].sort()).toEqual([...buildIndex.keys()].sort());

    for (const [code, set] of context.setByLiveCode) {
      expect(buildIndex.get(code)?.tcgdexId, code).toBe(set.tcgdexId);
    }
  });

  it("normalises live numbers the same way as the build", () => {
    for (const card of catalog.cards) {
      const code = setCodeOf(card.ref);
      const number = card.ref.slice(code.length + 1);
      expect(liveNumber(number), card.ref).toBe(normalizeNumber(number));
    }
  });
});
