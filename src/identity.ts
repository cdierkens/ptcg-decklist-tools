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

import { functionalCounts, listCounts } from "./deck.js";
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
  const lines = [...functionalCounts(normalized).entries()]
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
  const lines = listCounts(normalized).map(
    ({ count, key, ref }) => `${key}:${ref}:${count}`,
  );
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
