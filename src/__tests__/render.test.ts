import { describe, expect, it } from "vitest";

import { catalogVersion } from "../data.js";
import { listId, renderDecklist } from "../index.js";
import { fixture, normalize, readFixture } from "./support.js";

const manifest = JSON.parse(fixture("manifest.json")) as Array<{
  readonly label: string;
  readonly name: string;
}>;

const styles = ["ptcgl", "list", "print", "plain"] as const;

describe("renderDecklist goldens", () => {
  for (const item of manifest) {
    for (const style of styles) {
      it(`renders ${item.name} as ${style}`, () => {
        const deck = normalize(fixture(`${item.name}.ptcgl.txt`));
        const options = style === "print" ? { listName: item.label, window: "TEF-30C" } : undefined;

        expect(renderDecklist(deck, style, options)).toBe(
          readFixture(`./fixtures/rendered/${item.name}.${style}.txt`),
        );
      });
    }
  }
});

describe("renderDecklist", () => {
  it("writes PTCGL section headers and a total", () => {
    const rendered = renderDecklist(normalize(fixture("Dragapult-Dusknoir-30537.ptcgl.txt")), "ptcgl");

    expect(rendered).toContain("Pokémon: 23");
    expect(rendered).toContain("Trainer: 29");
    expect(rendered).toContain("Energy: 8");
    expect(rendered).toContain("Total Cards: 60");
    expect(rendered).not.toContain("Pokémon: 0");
  });

  it("keeps split printings on ref styles and collapses them for plain", () => {
    const deck = normalize(
      "2 Ultra Ball SVI 196\n2 Ultra Ball MEG 131\n1 Boss's Orders MEG 114",
    );
    const list = renderDecklist(deck, "list");

    expect(list).toContain("2 Ultra Ball MEG 131");
    expect(list).toContain("2 Ultra Ball SVI 196");
    expect(list).not.toContain("4 Ultra Ball");

    const plain = renderDecklist(deck, "plain");
    expect(plain).toContain("4 Ultra Ball");
    expect(plain).toContain("1 Boss's Orders");
    expect(plain).not.toContain("MEG");
    expect(plain).not.toContain("SVI");
  });

  it("does not invent refs for entries that only had names", () => {
    const deck = normalize(fixture("typed-no-refs.txt"));
    const lines = renderDecklist(deck, "list").trim().split("\n");

    for (const line of lines) {
      expect(line).not.toMatch(/\s[A-Z0-9]{2,} \d+$/u);
    }
  });

  it("writes a Limitless-shaped list without headers or a total", () => {
    const rendered = renderDecklist(normalize(fixture("Dragapult-Dusknoir-30537.paste.txt")), "list");

    expect(rendered).toContain("4 Dreepy TWM 128");
    expect(rendered).toContain("3 Basic Psychic Energy MEE 13");
    expect(rendered).not.toContain("Pokémon:");
    expect(rendered).not.toContain("Total Cards:");
  });

  it("collapses printings and omits refs for plain text", () => {
    const rendered = renderDecklist(
      normalize(fixture("Festival-Lead-30526.ptcgl.txt")),
      "plain",
    );

    expect(rendered).toContain("3 Applin");
    expect(rendered).toContain("1 Applin");
    expect(rendered).not.toMatch(/APP|TWM|MEP|SVI|\b[A-Z]{2,} \d+\b/u);
    expect(rendered).not.toContain("Total Cards:");
  });

  it("marks unresolved entries on the print sheet", () => {
    const deck = normalize(
      "Pokémon: 4\n4 Pikachu SVI 999\n\nTrainer: 4\n4 Ultra Ball SVI 196",
    );
    const rendered = renderDecklist(deck, "print", { window: "TEF-30C" });

    expect(rendered).toContain("Format: TEF-30C");
    expect(rendered).toContain(`Catalog: ${catalogVersion}`);
    expect(rendered).toContain("4 Pikachu SVI 999  (unresolved)");
    expect(rendered).toContain("[ ] 4 Ultra Ball SVI 196");
    expect(rendered).toContain("Total Cards: 8");
  });

  it("marks a name-only unresolved entry and does not invent a ref", () => {
    const deck = normalize("4 Pikachu");
    const rendered = renderDecklist(deck, "print");

    expect(rendered).toContain("Unknown: 4");
    expect(rendered).toContain("[ ] 4 Pikachu  (unresolved)");
    expect(rendered).not.toMatch(/Pikachu [A-Z]{2,} \d+/u);
  });

  it("uses supplied list name, player, and date on the print sheet", () => {
    const deck = normalize("4 Ultra Ball SVI 196");
    const rendered = renderDecklist(deck, "print", {
      date: "2026-10-24",
      listName: "League deck",
      player: "Chris",
      window: { base: "TEF", label: "TEF-30C", latest: "30C" },
    });

    expect(rendered).toContain("Decklist: League deck");
    expect(rendered).toContain("Format: TEF-30C");
    expect(rendered).toContain("Player: Chris");
    expect(rendered).toContain("Date: 2026-10-24");
    expect(rendered).toContain("Catalog: 2026-10-23");
  });

  it("round-trips PTCGL output through parse and normalize", async () => {
    const deck = normalize(fixture("Festival-Lead-30526.ptcgl.txt"));
    const roundTrip = normalize(renderDecklist(deck, "ptcgl"));

    expect(await listId(roundTrip)).toEqual(await listId(deck));
  });

  it("round-trips Limitless list output through parse and normalize", async () => {
    const deck = normalize(fixture("Festival-Lead-30526.ptcgl.txt"));
    const roundTrip = normalize(renderDecklist(deck, "list"));

    expect(await listId(roundTrip)).toEqual(await listId(deck));
  });
});
