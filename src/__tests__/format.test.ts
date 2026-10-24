import { describe, expect, it } from "vitest";

import { catalog } from "../data.js";
import {
  CatalogContextError,
  FormatError,
  fittingWindows,
  isCatalogContextError,
  isErr,
  isFormatError,
  normalizeDecklist,
  parseDecklist,
  parseFormatLabel,
  unwrapOrThrow,
  validateDeck,
} from "../index.js";
import { normalize } from "./support.js";

function formatWindow(label: string) {
  return unwrapOrThrow(parseFormatLabel(label));
}

describe("parseFormatLabel", () => {
  it("canonicalises case and resolves the 30C collision", () => {
    expect(formatWindow("tef-30c")).toEqual({
      base: "TEF",
      label: "TEF-30C",
      latest: "30C",
    });
    expect(formatWindow("TEF-30C")).toEqual(formatWindow("tef-30c"));
  });

  it("accepts a set code containing a colon", () => {
    expect(formatWindow("shf:sv-tef")).toEqual({
      base: "SHF:SV",
      label: "SHF:SV-TEF",
      latest: "TEF",
    });
  });

  it("trims surrounding whitespace", () => {
    expect(formatWindow("  tef-30c  ")).toEqual(formatWindow("TEF-30C"));
  });

  it("returns a FormatError for an unknown newest set", () => {
    const result = parseFormatLabel("TEF-XXX");

    expect(isErr(result)).toBe(true);
    if (result.ok) throw new Error("expected an error");
    expect(result.error).toBeInstanceOf(FormatError);
    expect(isFormatError(result.error)).toBe(true);
    expect(result.error.code).toBe("unknown-set");
    expect(result.error.input).toBe("XXX");
  });

  it("returns a FormatError for an unknown base set", () => {
    const result = parseFormatLabel("ZZZ-30C");

    expect(isErr(result)).toBe(true);
    if (result.ok) throw new Error("expected an error");
    expect(result.error.code).toBe("unknown-set");
    expect(result.error.input).toBe("ZZZ");
  });

  it.each(["TEF", "TEF-30C-EXTRA", "TEF-", "", "   "])(
    "rejects the malformed label %j",
    (label) => {
      const result = parseFormatLabel(label);

      expect(isErr(result)).toBe(true);
      if (result.ok) throw new Error("expected an error");
      expect(result.error.code).toBe("invalid-label");
    },
  );

  it("rejects a reversed window", () => {
    const result = parseFormatLabel("30C-TEF");

    expect(isErr(result)).toBe(true);
    if (result.ok) throw new Error("expected an error");
    expect(result.error.code).toBe("invalid-label");
    expect(result.error.input).toBe("30C-TEF");
  });
});

describe("validateDeck", () => {
  const window = formatWindow("TEF-30C");

  it("reports an older printing as outside", () => {
    const report = validateDeck(normalize("4 Ultra Ball SVI 196"), window);

    expect(report.window).toBe(window);
    expect(report.outside.map((entry) => entry.name)).toEqual(["Ultra Ball"]);
    expect(report.unknownSets).toEqual([]);
    expect(report.fourCopy).toEqual([]);
    expect(report.ok).toBe(false);
  });

  it("accepts a card inside the window", () => {
    const report = validateDeck(normalize("4 Acerola's Mischief MEG 113"), window);

    expect(report.outside).toEqual([]);
    expect(report.unknownSets).toEqual([]);
    expect(report.fourCopy).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it("is inclusive at both ends", () => {
    const report = validateDeck(
      normalize("4 Scyther TEF 1\n1 Exeggcute 30C 1"),
      window,
    );

    expect(report.outside).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it("marks an entry outside when any contributing printing is outside", () => {
    const report = validateDeck(
      normalize("2 Ultra Ball MEG 131\n2 Ultra Ball SVI 196"),
      window,
    );

    expect(report.outside.map((entry) => entry.name)).toEqual(["Ultra Ball"]);
    expect(report.ok).toBe(false);
  });

  it("reports unknown deck set codes once and sorted", () => {
    const report = validateDeck(
      normalize("4 Ultra Ball XXX 196\n2 Ultra Ball YYY 1"),
      window,
    );

    expect(report.unknownSets).toEqual(["XXX", "YYY"]);
    expect(report.outside).toEqual([]);
    expect(report.ok).toBe(false);
  });

  it("checks four copies by name, not by function", () => {
    const report = validateDeck(normalize("4 Pikachu 30C 23\n4 Pikachu 30C 24"), window);

    expect(report.fourCopy).toEqual([{ count: 8, name: "Pikachu" }]);
    expect(report.outside).toEqual([]);
    expect(report.ok).toBe(false);
  });

  it("does not flag basic Energy", () => {
    const report = validateDeck(normalize("20 Basic Fire Energy MEE 10"), window);

    expect(report.fourCopy).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it("uses the representative printing for a ref-less card", () => {
    const report = validateDeck(normalize("4 Acerola's Mischief"), window);

    expect(report.outside).toEqual([]);
    expect(report.unknownSets).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it("reports an unknown window endpoint", () => {
    const report = validateDeck(normalize("4 Acerola's Mischief MEG 113"), {
      base: "XXX",
      label: "XXX-30C",
      latest: "30C",
    });

    expect(report.unknownSets).toEqual(["XXX"]);
    expect(report.outside).toEqual([]);
    expect(report.ok).toBe(false);
  });

  it("reports an unknown latest endpoint", () => {
    const report = validateDeck(normalize("4 Acerola's Mischief MEG 113"), {
      base: "TEF",
      label: "TEF-XXX",
      latest: "XXX",
    });

    expect(report.unknownSets).toEqual(["XXX"]);
    expect(report.outside).toEqual([]);
    expect(report.ok).toBe(false);
  });

  it("uses an injected catalog that matches the deck context", () => {
    const custom = {
      ...catalog,
      sets: catalog.sets.filter((set) => set.liveCode === "TEF" || set.liveCode === "30C"),
    };
    const deck = unwrapOrThrow(
      normalizeDecklist(unwrapOrThrow(parseDecklist("4 Ultra Ball SVI 196")), {
        catalog: custom,
      }),
    );
    const report = validateDeck(deck, window, custom);

    expect(report.unknownSets).toEqual(["SVI"]);
    expect(report.ok).toBe(false);
  });

  it("reuses the catalog attached at normalisation", () => {
    const custom = {
      ...catalog,
      sets: catalog.sets.filter((set) => set.liveCode === "TEF" || set.liveCode === "30C"),
    };
    const deck = unwrapOrThrow(
      normalizeDecklist(unwrapOrThrow(parseDecklist("4 Ultra Ball SVI 196")), {
        catalog: custom,
      }),
    );

    const report = validateDeck(deck, window);

    expect(report.unknownSets).toEqual(["SVI"]);
    expect(report.ok).toBe(false);
  });

  it("refuses a restored custom deck without its catalog", () => {
    const custom = {
      ...catalog,
      sets: catalog.sets.filter((set) => set.liveCode === "TEF" || set.liveCode === "30C"),
    };
    const deck = unwrapOrThrow(
      normalizeDecklist(unwrapOrThrow(parseDecklist("4 Ultra Ball SVI 196")), {
        catalog: custom,
      }),
    );
    const restored = JSON.parse(JSON.stringify(deck)) as typeof deck;

    let thrown: unknown;
    try {
      validateDeck(restored, window);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(CatalogContextError);
    expect(isCatalogContextError(thrown) && thrown.code).toBe("missing-context");
  });

  it("refuses an explicit catalog with a different version", () => {
    const deck = normalize("4 Ultra Ball SVI 196");
    const mismatched = { ...catalog, catalogVersion: "1999-01-01" };

    let thrown: unknown;
    try {
      validateDeck(deck, window, mismatched);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(CatalogContextError);
    expect(isCatalogContextError(thrown) && thrown.code).toBe("context-mismatch");
  });

  it("uses the shipped context for a restored shipped deck", () => {
    const deck = normalize("4 Ultra Ball SVI 196");
    const restored = JSON.parse(JSON.stringify(deck)) as typeof deck;

    expect(validateDeck(restored, window).unknownSets).toEqual([]);
  });

  it("falls back by version for a legacy deck without a context fingerprint", () => {
    const deck = normalize("4 Ultra Ball SVI 196");
    const { catalogContextId: _ignored, ...legacy } = deck;

    expect(validateDeck(legacy, window).unknownSets).toEqual([]);
  });
});

describe("fittingWindows", () => {
  it("returns candidate bases at or before the oldest card, never newer", () => {
    const windows = fittingWindows(normalize("4 Scyther TEF 1"), { era: "sv" });
    const bases = windows.map((candidate) => candidate.base);

    expect(bases).toContain("SVI");
    expect(bases).toContain("TEF");
    expect(bases).not.toContain("TWM");

    for (const candidate of windows) {
      expect(candidate.latest).toBe("30C");
      expect(candidate.label).toBe(`${candidate.base}-${candidate.latest}`);
    }
  });

  it("returns no window when the era has no base old enough", () => {
    expect(fittingWindows(normalize("4 Scyther TEF 1"), { era: "me" })).toEqual([]);
  });

  it("returns no window for an unknown set", () => {
    expect(fittingWindows(normalize("4 Ultra Ball XXX 196"), { era: "sv" })).toEqual([]);
  });

  it("returns no window when no card has a set", () => {
    expect(fittingWindows(normalize("4 Pikachu"), { era: "sv" })).toEqual([]);
  });

  it("returns no window when one card has no set", () => {
    expect(
      fittingWindows(normalize("4 Pikachu\n4 Scyther TEF 1"), { era: "sv" }),
    ).toEqual([]);
  });

  it("tries every era when none is given", () => {
    const bases = fittingWindows(normalize("4 Scyther TEF 1")).map((candidate) => candidate.base);

    expect(bases[0]).toBe("BS");
    expect(bases).toContain("TEF");
  });

  it("uses every printing, not only the representative", () => {
    const deck = normalize("2 Ultra Ball MEG 131\n2 Ultra Ball SVI 196");
    const bases = fittingWindows(deck, { era: "sv" }).map((candidate) => candidate.base);

    expect(bases).toContain("SVI");
    expect(bases).not.toContain("TWM");
  });

  it("can fit a deck whose oldest card is the newest set", () => {
    const bases = fittingWindows(normalize("1 Exeggcute 30C 1"), { era: "me" }).map(
      (candidate) => candidate.base,
    );

    expect(bases).toContain("30C");
  });

  it("uses an injected catalog that matches the deck context", () => {
    const custom = {
      ...catalog,
      sets: catalog.sets.filter(
        (set) => set.liveCode === "SVI" || set.liveCode === "TEF",
      ),
    };
    const deck = unwrapOrThrow(
      normalizeDecklist(unwrapOrThrow(parseDecklist("4 Scyther TEF 1")), {
        catalog: custom,
      }),
    );
    const windows = fittingWindows(deck, {
      catalog: custom,
      era: "sv",
    });

    expect(windows.map((candidate) => candidate.base)).toEqual(["SVI", "TEF"]);
    expect(windows.every((candidate) => candidate.latest === "TEF")).toBe(true);
  });

  it("reuses the catalog attached at normalisation for the set order", () => {
    const custom = {
      ...catalog,
      sets: catalog.sets.filter(
        (set) => set.liveCode === "SVI" || set.liveCode === "TEF",
      ),
    };
    const deck = unwrapOrThrow(
      normalizeDecklist(unwrapOrThrow(parseDecklist("4 Scyther TEF 1")), {
        catalog: custom,
      }),
    );

    const windows = fittingWindows(deck, { era: "sv" });

    expect(windows.map((candidate) => candidate.base)).toEqual(["SVI", "TEF"]);
    expect(windows.every((candidate) => candidate.latest === "TEF")).toBe(true);
  });
});
