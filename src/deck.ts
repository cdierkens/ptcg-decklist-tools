/**
 * The normalized deck module.
 *
 * `NormalizedDeck` is the value every other operation reads. This module owns
 * how it is built, what its invariants are, and the projections its consumers
 * need: functional counts for identity, printing counts for list identity,
 * section groups for rendering, and name counts for the four-copy check.
 *
 * The live object also carries its catalog context. A stored deck carries the
 * `catalogVersion`; pass its catalog when restoring a custom catalog.
 */

import { catalogContext, type CatalogContext } from "./catalog.js";
import { foldName } from "./fold.js";
import { printableRef } from "./refs.js";
import { shippedSetContext } from "./shipped.js";
import type {
  Catalog,
  DeckSection,
  DecklistWarning,
  NormalizedDeck,
  NormalizedEntry,
} from "./types.js";

const deckContexts = new WeakMap<NormalizedDeck, CatalogContext>();

export interface SectionGroup {
  readonly count: number;
  readonly entries: readonly NormalizedEntry[];
  readonly section: DeckSection;
}

interface ListCount {
  readonly count: number;
  readonly key: string;
  readonly ref: string;
}

const SECTION_ORDER: readonly DeckSection[] = ["pokemon", "trainer", "energy", "unknown"];

function compareKeys(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareEntries(left: NormalizedEntry, right: NormalizedEntry): number {
  if (left.name !== right.name) return left.name < right.name ? -1 : 1;
  return compareKeys(left.key, right.key);
}

/** Build the one shape the rest of the package reads. */
export function createNormalizedDeck(
  entries: readonly NormalizedEntry[],
  warnings: readonly DecklistWarning[],
  context: CatalogContext,
): NormalizedDeck {
  const sorted = [...entries].sort((left, right) => compareKeys(left.key, right.key));
  const deck: NormalizedDeck = {
    catalogVersion: context.catalog.catalogVersion,
    entries: sorted,
    total: sorted.reduce((sum, entry) => sum + entry.count, 0),
    warnings: [...warnings],
  };
  deckContexts.set(deck, context);
  return deck;
}

/**
 * The catalog context for a live deck. An explicit catalog wins; otherwise the
 * context attached at normalisation is reused. A restored deck with no context
 * falls back to the shipped set index.
 */
export function contextForDeck(deck: NormalizedDeck, catalog?: Catalog): CatalogContext {
  if (catalog !== undefined) return catalogContext(catalog);
  return deckContexts.get(deck) ?? shippedSetContext();
}

/** Every printing that can scope an entry, including its representative card. */
export function refsForEntry(entry: NormalizedEntry): readonly string[] {
  if (entry.printings.length > 0) return entry.printings.map((printing) => printing.ref);
  return entry.card === null ? [] : [entry.card.ref];
}

/** Functional counts: the deck-identity pre-image, before serialisation. */
export function functionalCounts(deck: NormalizedDeck): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entry of deck.entries) {
    counts.set(entry.key, (counts.get(entry.key) ?? 0) + entry.count);
  }
  return counts;
}

/**
 * Printing counts: one row per `key + ref`, plus an empty-ref row for copies
 * that have no recorded printing. The list-identity pre-image is built from
 * these rows.
 */
export function listCounts(deck: NormalizedDeck): ListCount[] {
  const printings = new Map<string, { count: number; key: string; ref: string }>();
  const unprinted = new Map<string, number>();

  for (const entry of deck.entries) {
    let printed = 0;
    for (const printing of entry.printings) {
      printed += printing.count;
      const id = `${entry.key}\u0000${printing.ref}`;
      const current = printings.get(id);
      if (current === undefined) {
        printings.set(id, { count: printing.count, key: entry.key, ref: printing.ref });
      } else {
        current.count += printing.count;
      }
    }

    const absent = entry.count - printed;
    if (entry.printings.length === 0 || absent > 0) {
      unprinted.set(entry.key, (unprinted.get(entry.key) ?? 0) + absent);
    }
  }

  return [
    ...printings.values(),
    ...[...unprinted.entries()].map(([key, count]) => ({ count, key, ref: "" })),
  ];
}

/** Section groups in render order, each sorted by display name. */
export function sectionGroups(deck: NormalizedDeck): SectionGroup[] {
  const groups: SectionGroup[] = [];
  for (const section of SECTION_ORDER) {
    const entries = deck.entries
      .filter((entry) => entry.section === section)
      .sort(compareEntries);
    if (entries.length === 0) continue;
    groups.push({
      count: entries.reduce((sum, entry) => sum + entry.count, 0),
      entries,
      section,
    });
  }
  return groups;
}

/** One line per printing, then a name-only line for copies with no ref. */
export function printingLines(entry: NormalizedEntry): string[] {
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

interface NameGroup {
  count: number;
  name: string;
  resolved: boolean;
}

/**
 * Sum copies by name for the four-copy rule. Names are folded; resolved cards
 * contribute their canonical English name.
 */
export function countByName(deck: NormalizedDeck): { name: string; count: number }[] {
  const groups = new Map<string, NameGroup>();

  for (const entry of deck.entries) {
    const key = foldName(entry.name);
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, {
        count: entry.count,
        name: entry.name,
        resolved: entry.card !== null,
      });
      continue;
    }

    group.count += entry.count;
    if (!group.resolved && entry.card !== null) {
      group.name = entry.name;
      group.resolved = true;
    }
  }

  return [...groups.entries()]
    .sort(([left], [right]) => compareKeys(left, right))
    .map(([, group]) => ({ count: group.count, name: group.name }));
}
