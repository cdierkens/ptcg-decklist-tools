/**
 * Identity for a normalised decklist.
 *
 * `deckId` answers "is this the same deck?" across printings and re-imports.
 * `listId` answers "is this the same list?" for exact duplicate detection and
 * printing-only diffs. The pre-images are deliberately different: the deck
 * pre-image is the functional multiset, the list pre-image is the printing
 * multiset. Both use WebCrypto, so the package stays dependency-free and works
 * in Node and every Tauri webview.
 *
 * The design is in `docs/specs/2026-10-23-decklist-identity.md` §4.
 */

import { foldName } from "./fold.js";
import type { DeckHash, NormalizedDeck } from "./types.js";

/** Bump only with a deliberate migration; it changes both pre-image domains. */
const HASH_VERSION = 1;
const DECK_DOMAIN = `ptcg-decklist@${HASH_VERSION}`;
const LIST_DOMAIN = `ptcg-decklist-list@${HASH_VERSION}`;

function compareKeys(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function toHex(buffer: ArrayBuffer): string {
  let hex = "";
  for (const byte of new Uint8Array(buffer)) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

async function hash(text: string, catalogVersion: string): Promise<DeckHash> {
  const bytes = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return {
    catalogVersion,
    hashVersion: HASH_VERSION,
    value: `sha256:${toHex(digest)}`,
  };
}

/**
 * The deck-identity pre-image: the domain, then one `key:count` line per
 * functional key, sorted by key. No section, name, printing, or order.
 */
export function canonicalText(normalized: NormalizedDeck): string {
  const counts = new Map<string, number>();
  for (const entry of normalized.entries) {
    counts.set(entry.key, (counts.get(entry.key) ?? 0) + entry.count);
  }

  const lines = [...counts.entries()]
    .sort(([left], [right]) => compareKeys(left, right))
    .map(([key, count]) => `${key}:${count}`);
  return [DECK_DOMAIN, ...lines].join("\n");
}

/**
 * The list-identity pre-image: the domain, then one `key:ref:count` line per
 * printing, sorted. Copies with no recorded printing use an empty ref, so a
 * ref-less name is a different list from the same name with a ref.
 */
function listCanonicalText(normalized: NormalizedDeck): string {
  const printings = new Map<string, { count: number; key: string; ref: string }>();
  const unprinted = new Map<string, number>();

  for (const entry of normalized.entries) {
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

  const lines = [
    ...[...printings.values()].map(
      (printing) => `${printing.key}:${printing.ref}:${printing.count}`,
    ),
    ...[...unprinted.entries()].map(([key, count]) => `${key}::${count}`),
  ];
  lines.sort(compareKeys);
  return [LIST_DOMAIN, ...lines].join("\n");
}

/** Hash the functional multiset. Stable across reprints and printing swaps. */
export function deckId(normalized: NormalizedDeck): Promise<DeckHash> {
  return hash(canonicalText(normalized), normalized.catalogVersion);
}

/** Hash the printing multiset. A printing swap changes this, not `deckId`. */
export function listId(normalized: NormalizedDeck): Promise<DeckHash> {
  return hash(listCanonicalText(normalized), normalized.catalogVersion);
}

interface NameGroup {
  count: number;
  name: string;
  resolved: boolean;
}

/**
 * Sum copies by name for the four-copy rule. This is deliberately not part of
 * identity: two Pikachu functions are different cards but share a name, and
 * both count toward the same four-copy limit.
 *
 * The written name is used when a card is unresolved, so a new set still
 * counts; a resolved card contributes its canonical English name.
 */
export function countByName(normalized: NormalizedDeck): { name: string; count: number }[] {
  const groups = new Map<string, NameGroup>();

  for (const entry of normalized.entries) {
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
