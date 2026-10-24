/**
 * Render a normalised decklist to text.
 *
 * Rendering is intentionally conservative: it never chooses or invents a
 * printing. A resolved entry can carry several printings, so `ptcgl`, `list`,
 * and `print` emit one line per printing and keep any ref-less remainder as a
 * name-only line. `plain` collapses the entry to one count because it has no
 * refs. Unresolved entries keep the name they were written with; the print
 * sheet marks them so a deck check can see that the catalog did not prove them.
 *
 * The design is in `docs/specs/2026-10-23-decklist-identity.md` §8.
 */

import { printingLines, sectionGroups } from "./deck.js";
import type {
  DeckSection,
  NormalizedDeck,
  NormalizedEntry,
  RenderDecklistOptions,
  RenderStyle,
} from "./types.js";

const SECTION_LABEL: Record<DeckSection, string> = {
  energy: "Energy",
  pokemon: "Pokémon",
  trainer: "Trainer",
  unknown: "Unknown",
};

function plainLines(entry: NormalizedEntry): string[] {
  return entry.count > 0 ? [`${entry.count} ${entry.name}`] : [];
}

function bodyLines(deck: NormalizedDeck, render: (entry: NormalizedEntry) => string[]): string[] {
  return sectionGroups(deck).flatMap((group) => group.entries.flatMap(render));
}

function ptcgl(deck: NormalizedDeck): string {
  const blocks = sectionGroups(deck).map((group) =>
    [
      `${SECTION_LABEL[group.section]}: ${group.count}`,
      ...group.entries.flatMap(printingLines),
    ].join("\n"),
  );
  blocks.push(`Total Cards: ${deck.total}`);
  return `${blocks.join("\n\n")}\n`;
}

function list(deck: NormalizedDeck): string {
  const lines = bodyLines(deck, printingLines);
  return lines.length === 0 ? "" : `${lines.join("\n")}\n`;
}

function plain(deck: NormalizedDeck): string {
  const lines = bodyLines(deck, plainLines);
  return lines.length === 0 ? "" : `${lines.join("\n")}\n`;
}

function windowLabel(options: RenderDecklistOptions): string {
  if (options.window === undefined) return "not set";
  return (typeof options.window === "string" ? options.window : options.window.label).trim();
}

function print(deck: NormalizedDeck, options: RenderDecklistOptions): string {
  const player = options.player ?? "____________________________";
  const date = options.date ?? "____________";
  const header = [
    `Decklist: ${options.listName ?? "Untitled deck"}`,
    `Format: ${windowLabel(options)}`,
    `Catalog: ${deck.catalogVersion}`,
    `Player: ${player}`,
    `Date: ${date}`,
  ].join("\n");

  const blocks = sectionGroups(deck).map((group) =>
    [
      `${SECTION_LABEL[group.section]}: ${group.count}`,
      ...group.entries.flatMap((entry) =>
        printingLines(entry).map(
          (line) => `[ ] ${line}${entry.card === null ? "  (unresolved)" : ""}`,
        ),
      ),
    ].join("\n"),
  );
  blocks.push(`Total Cards: ${deck.total}`);

  return `${[header, ...blocks].join("\n\n")}\n`;
}

/**
 * Render a decklist. `ptcgl`, `list`, and `print` preserve split printings;
 * `plain` collapses each entry to one count and omits refs. Only `print` uses
 * the options: the deck name, format window, player, and date.
 */
export function renderDecklist(
  deck: NormalizedDeck,
  style: RenderStyle,
  options: RenderDecklistOptions = {},
): string {
  switch (style) {
    case "ptcgl":
      return ptcgl(deck);
    case "list":
      return list(deck);
    case "print":
      return print(deck, options);
    case "plain":
      return plain(deck);
  }
}
