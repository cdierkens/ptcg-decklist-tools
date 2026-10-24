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

import type {
  DeckSection,
  NormalizedDeck,
  NormalizedEntry,
  RenderDecklistOptions,
  RenderStyle,
} from "./types.js";

const SECTION_ORDER: readonly DeckSection[] = ["pokemon", "trainer", "energy", "unknown"];
const SECTION_LABEL: Record<DeckSection, string> = {
  energy: "Energy",
  pokemon: "Pokémon",
  trainer: "Trainer",
  unknown: "Unknown",
};

interface SectionGroup {
  readonly count: number;
  readonly entries: readonly NormalizedEntry[];
  readonly section: DeckSection;
}

function compareEntries(left: NormalizedEntry, right: NormalizedEntry): number {
  if (left.name !== right.name) return left.name < right.name ? -1 : 1;
  return left.key < right.key ? -1 : left.key > right.key ? 1 : 0;
}

function sectionGroups(deck: NormalizedDeck): SectionGroup[] {
  const groups: SectionGroup[] = [];
  for (const section of SECTION_ORDER) {
    const entries = deck.entries.filter((entry) => entry.section === section).sort(compareEntries);
    if (entries.length === 0) continue;
    groups.push({
      count: entries.reduce((sum, entry) => sum + entry.count, 0),
      entries,
      section,
    });
  }
  return groups;
}

/** `TWM-130` prints as `TWM 130`; a ref with no hyphen is left alone. */
function printableRef(ref: string): string {
  const separator = ref.lastIndexOf("-");
  if (separator <= 0) return ref;
  return `${ref.slice(0, separator)} ${ref.slice(separator + 1)}`;
}

/**
 * One line per printing, then a name-only line for any copies that had no ref.
 * Clamping protects the invariant even if a caller hand-builds an entry whose
 * printing counts do not add up.
 */
function printingLines(entry: NormalizedEntry): string[] {
  const lines: string[] = [];
  let remaining = entry.count;

  for (const printing of entry.printings) {
    if (remaining <= 0) break;
    const count = Math.min(printing.count, remaining);
    if (count <= 0) continue;
    lines.push(`${count} ${entry.name} ${printableRef(printing.ref)}`);
    remaining -= count;
  }

  if (remaining > 0) lines.push(`${remaining} ${entry.name}`);
  return lines;
}

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
