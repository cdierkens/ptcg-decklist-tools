import { describe, expect, it } from "vitest";

import { diffDecklists } from "../index.js";
import { fixture, normalize } from "./support.js";

const dragapult = fixture("Dragapult-Dusknoir-30537.ptcgl.txt");

describe("diffDecklists", () => {
  it("classifies the same list as identical", () => {
    const deck = normalize(dragapult);
    const diff = diffDecklists(deck, deck);

    expect(diff).toEqual({ changes: [], classification: "identical", sameCount: 60 });
  });

  it("ignores localized display names when the cards are the same", () => {
    const english = normalize(dragapult);
    const german = normalize(fixture("Dragapult-Dusknoir-30537.de.ptcgl.txt"));

    expect(diffDecklists(english, german).classification).toBe("identical");
  });

  it("reports a printing swap as printing-only", () => {
    const before = normalize(dragapult);
    const after = normalize(dragapult.replace("3 Ultra Ball MEG 131", "3 Ultra Ball SVI 196"));
    const diff = diffDecklists(before, after);

    expect(diff.classification).toBe("printing-only");
    expect(diff.changes).toHaveLength(1);
    expect(diff.changes[0]).toMatchObject({
      confidence: 1,
      from: 3,
      kind: "printing",
      to: 3,
    });
    expect(diff.changes[0]?.entry.name).toBe("Ultra Ball");
    expect(diff.sameCount).toBe(60);
  });

  it("reports a count change as a count with full confidence", () => {
    const before = normalize(dragapult);
    const after = normalize(dragapult.replace("3 Dragapult ex TWM 130", "2 Dragapult ex TWM 130"));
    const diff = diffDecklists(before, after);

    expect(diff.classification).toBe("variant");
    expect(diff.changes).toHaveLength(1);
    expect(diff.changes[0]).toMatchObject({
      confidence: 1,
      from: 3,
      kind: "count",
      to: 2,
    });
    expect(diff.changes[0]?.entry.name).toBe("Dragapult ex");
    expect(diff.sameCount).toBe(57);
  });

  it("treats one added card as a one-change variant", () => {
    const before = normalize("4 Ultra Ball SVI 196\n16 Professor's Research SVI 189");
    const after = normalize(
      "4 Ultra Ball SVI 196\n16 Professor's Research SVI 189\n1 Boss's Orders MEG 114",
    );
    const diff = diffDecklists(before, after);

    expect(diff.classification).toBe("variant");
    expect(diff.changes).toHaveLength(1);
    expect(diff.changes[0]).toMatchObject({
      confidence: 1,
      from: 0,
      kind: "added",
      to: 1,
    });
    expect(diff.changes[0]?.entry.name).toBe("Boss's Orders");
    expect(diff.sameCount).toBe(20);
  });

  it("reports a removed card with full confidence", () => {
    const before = normalize(
      "4 Ultra Ball SVI 196\n16 Professor's Research SVI 189\n1 Boss's Orders MEG 114",
    );
    const after = normalize("4 Ultra Ball SVI 196\n16 Professor's Research SVI 189");
    const diff = diffDecklists(before, after);

    expect(diff.classification).toBe("variant");
    expect(diff.changes).toHaveLength(1);
    expect(diff.changes[0]).toMatchObject({
      confidence: 1,
      from: 1,
      kind: "removed",
      to: 0,
    });
    expect(diff.sameCount).toBe(20);
  });

  it("pairs unresolved entries by folded name at 0.8 for a count change", () => {
    const before = normalize("4 Pikachu SVI 999");
    const after = normalize("3 Pikachu SVI 999");
    const diff = diffDecklists(before, after);

    expect(diff.changes).toHaveLength(1);
    expect(diff.changes[0]).toMatchObject({
      confidence: 0.8,
      from: 4,
      kind: "count",
      to: 3,
    });
    expect(diff.changes[0]?.entry.name).toBe("Pikachu");
    expect(diff.sameCount).toBe(0);
  });

  it("pairs unresolved entries with different refs at 0.7 for a printing change", () => {
    const before = normalize("4 Pikachu SVI 999");
    const after = normalize("4 Pikachu SVI 998");
    const diff = diffDecklists(before, after);

    expect(diff.classification).toBe("variant");
    expect(diff.changes).toHaveLength(1);
    expect(diff.changes[0]).toMatchObject({
      confidence: 0.7,
      from: 4,
      kind: "printing",
      to: 4,
    });
    expect(diff.sameCount).toBe(4);
  });

  it("does not pair a resolved entry with an unresolved entry", () => {
    const resolved = normalize("4 Ultra Ball SVI 196");
    const unresolved = normalize("4 Ultra Ball XXX 1");
    const diff = diffDecklists(resolved, unresolved);

    expect(diff.classification).toBe("different");
    expect(diff.changes).toHaveLength(2);
    expect(diff.changes[0]).toMatchObject({
      confidence: 1,
      from: 4,
      kind: "removed",
      to: 0,
    });
    expect(diff.changes[1]).toMatchObject({
      confidence: 1,
      from: 0,
      kind: "added",
      to: 4,
    });
    expect(diff.sameCount).toBe(0);
  });

  it("uses maxChanges to separate a six-change variant from a different deck", () => {
    const before = normalize(dragapult);
    let afterText = dragapult;
    for (const line of [
      "1 Munkidori TWM 95",
      "1 Moltres PFL 14",
      "1 Shaymin DRI 10",
      "1 Fezandipiti ex ASC 142",
      "1 Meowth ex POR 62",
      "1 Judge POR 76",
    ]) {
      expect(afterText).toContain(`${line}\n`);
      afterText = afterText.replace(`${line}\n`, "");
    }
    const after = normalize(afterText);

    const strict = diffDecklists(before, after);
    expect(strict.classification).toBe("different");
    expect(strict.changes).toHaveLength(6);
    expect(strict.sameCount).toBe(54);

    const relaxed = diffDecklists(before, after, { maxChanges: 6 });
    expect(relaxed.classification).toBe("variant");
  });

  it("classifies two different decks as different", () => {
    const dragapultDeck = normalize(dragapult);
    const festival = normalize(fixture("Festival-Lead-30526.ptcgl.txt"));

    expect(diffDecklists(dragapultDeck, festival).classification).toBe("different");
  });
});
