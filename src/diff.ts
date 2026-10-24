/**
 * Compare two normalised decklists.
 *
 * Pairing follows the design table in `docs/specs/2026-10-23-decklist-identity.md`
 * §6: resolved entries pair on their functional key; unresolved entries pair on
 * their folded name. A resolved pair is compared by count first, then by its
 * printing multiset. Unresolved pairs use the same order but lower confidence.
 *
 * Classification uses the same facts as `deckId`/`listId` without hashing:
 * identical when the functional multiset and printings match, printing-only
 * when only printings differ, and variant when the change is small and mostly
 * leaves copies unchanged.
 */

import { foldName } from "./fold.js";
import type {
  DeckDiff,
  DiffChange,
  DiffDecklistsOptions,
  NormalizedDeck,
  NormalizedEntry,
} from "./types.js";

function functionalCounts(deck: NormalizedDeck): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entry of deck.entries) {
    counts.set(entry.key, (counts.get(entry.key) ?? 0) + entry.count);
  }
  return counts;
}

function functionalEqual(left: NormalizedDeck, right: NormalizedDeck): boolean {
  const leftCounts = functionalCounts(left);
  const rightCounts = functionalCounts(right);
  if (leftCounts.size !== rightCounts.size) return false;

  for (const [key, count] of leftCounts) {
    if (rightCounts.get(key) !== count) return false;
  }
  return true;
}

function samePrintings(left: NormalizedEntry, right: NormalizedEntry): boolean {
  if (left.printings.length !== right.printings.length) return false;

  const counts = new Map<string, number>();
  for (const printing of left.printings) {
    counts.set(printing.ref, (counts.get(printing.ref) ?? 0) + printing.count);
  }
  for (const printing of right.printings) {
    const count = counts.get(printing.ref);
    if (count === undefined || count !== printing.count) return false;
  }
  return true;
}

function sameRefs(left: NormalizedEntry, right: NormalizedEntry): boolean {
  const leftRefs = left.printings.map((printing) => printing.ref).sort();
  const rightRefs = right.printings.map((printing) => printing.ref).sort();
  if (leftRefs.length !== rightRefs.length) return false;
  return leftRefs.every((ref, index) => ref === rightRefs[index]);
}

function push(
  changes: DiffChange[],
  kind: DiffChange["kind"],
  entry: NormalizedEntry,
  from: number,
  to: number,
  confidence: number,
): void {
  changes.push({ confidence, entry, from, kind, to });
}

function takeResolved(
  entriesByKey: Map<string, NormalizedEntry[]>,
  key: string,
): NormalizedEntry | undefined {
  const entries = entriesByKey.get(key);
  return entries?.shift();
}

function takeByName(
  entries: NormalizedEntry[],
  before: NormalizedEntry,
): NormalizedEntry | undefined {
  if (entries.length === 0) return undefined;

  const matchingRef = entries.findIndex((entry) => sameRefs(before, entry));
  const index = matchingRef >= 0 ? matchingRef : 0;
  const [entry] = entries.splice(index, 1);
  return entry;
}

function classify(
  before: NormalizedDeck,
  after: NormalizedDeck,
  changes: readonly DiffChange[],
  sameCount: number,
  options: DiffDecklistsOptions,
): DeckDiff["classification"] {
  if (functionalEqual(before, after)) {
    if (changes.length === 0) return "identical";
    if (changes.every((change) => change.kind === "printing")) return "printing-only";
  }

  const maxChanges = options.maxChanges ?? 5;
  const total = Math.max(before.total, after.total);
  const mostlySame = total > 0 && sameCount * 10 >= total * 9;

  return changes.length > 0 && changes.length <= maxChanges && mostlySame
    ? "variant"
    : "different";
}

/**
 * Diff two normalised decks.
 *
 * The function is synchronous: it compares the already-normalised entries and
 * does not hash. `catalog` is accepted for API symmetry with the other
 * catalogue-aware functions; pairing never guesses beyond the entries.
 */
export function diffDecklists(
  before: NormalizedDeck,
  after: NormalizedDeck,
  options: DiffDecklistsOptions = {},
): DeckDiff {
  const resolvedAfter = new Map<string, NormalizedEntry[]>();
  const unresolvedAfter = new Map<string, NormalizedEntry[]>();

  for (const entry of after.entries) {
    const bucket = entry.card === null ? unresolvedAfter : resolvedAfter;
    const key = entry.card === null ? foldName(entry.name) : entry.key;
    const entries = bucket.get(key);
    if (entries === undefined) bucket.set(key, [entry]);
    else entries.push(entry);
  }

  const changes: DiffChange[] = [];
  const matched = new Set<NormalizedEntry>();
  let sameCount = 0;

  for (const beforeEntry of before.entries) {
    let afterEntry: NormalizedEntry | undefined;
    if (beforeEntry.card === null) {
      const entries = unresolvedAfter.get(foldName(beforeEntry.name));
      afterEntry = entries === undefined ? undefined : takeByName(entries, beforeEntry);
    } else {
      afterEntry = takeResolved(resolvedAfter, beforeEntry.key);
    }

    if (afterEntry === undefined) {
      push(changes, "removed", beforeEntry, beforeEntry.count, 0, 1);
      continue;
    }

    matched.add(afterEntry);
    if (beforeEntry.count !== afterEntry.count) {
      push(
        changes,
        "count",
        afterEntry,
        beforeEntry.count,
        afterEntry.count,
        beforeEntry.card === null ? 0.8 : 1,
      );
    } else if (!samePrintings(beforeEntry, afterEntry)) {
      push(
        changes,
        "printing",
        afterEntry,
        beforeEntry.count,
        afterEntry.count,
        beforeEntry.card === null ? 0.7 : 1,
      );
      sameCount += beforeEntry.count;
    } else {
      sameCount += beforeEntry.count;
    }
  }

  for (const afterEntry of after.entries) {
    if (!matched.has(afterEntry)) {
      push(changes, "added", afterEntry, 0, afterEntry.count, 1);
    }
  }

  return {
    changes,
    classification: classify(before, after, changes, sameCount, options),
    sameCount,
  };
}
