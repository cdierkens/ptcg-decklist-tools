import { describe, expect, it } from "vitest";

import { countByName, deckView } from "../index.js";
import { normalize } from "./support.js";

describe("deckView", () => {
  const deck = normalize(
    "2 Ultra Ball SVI 196\n2 Ultra Ball MEG 131\n2 Acerola's Mischief MEG 113\n2 Acerola's Mischief",
  );

  it("projects sections and totals without re-deriving them", () => {
    const view = deckView(deck);

    expect(view.sections.map((section) => section.section)).toEqual(["trainer"]);
    expect(view.sections.reduce((sum, section) => sum + section.count, 0)).toBe(deck.total);
    expect(view.functional.reduce((sum, entry) => sum + entry.count, 0)).toBe(deck.total);
    expect(view.list.reduce((sum, entry) => sum + entry.count, 0)).toBe(deck.total);
  });

  it("exposes functional, list, and name projections", () => {
    const view = deckView(deck);

    expect(view.names).toEqual(countByName(deck));
    expect(view.functional.map((entry) => entry.key)).toEqual(
      [...view.functional].map((entry) => entry.key).sort(),
    );
    expect(view.list.some((entry) => entry.ref === "" && entry.count === 2)).toBe(true);
  });
});
