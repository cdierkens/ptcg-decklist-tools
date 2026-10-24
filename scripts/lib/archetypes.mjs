/**
 * Pure archetype-table helpers.
 *
 * Network and filesystem live in `scripts/build-archetypes.mjs`. The table is a
 * snapshot of Limitless aliases, keyed by deck and variant so a label rename
 * does not rewrite history.
 */

import { htmlToText } from "./limitless.mjs";

const WINDOW = /^[A-Z0-9:]+-[A-Z0-9:]+$/;

/**
 * @typedef {{ deckId: string, variantId: string | null, label: string, slugs: string[] }} Alias
 * @typedef {{ id: string, label: string, cards: string[], window: string }} Archetype
 */

/**
 * `limitless:{deckId}/{variantId}`. A base index row has no variant, and the
 * spec normalises it to variant 0 so every id has the same shape.
 * @param {{ deckId: string, variantId: string | null }} alias
 */
export function archetypeId(alias) {
  const deckId = String(alias.deckId ?? "").trim();
  if (deckId === "") throw new Error("archetype row has no deck id");
  const variantId =
    alias.variantId === null || alias.variantId === undefined || alias.variantId === ""
      ? "0"
      : String(alias.variantId).trim();
  return `limitless:${deckId}/${variantId}`;
}

/**
 * Convert one parsed Limitless index row into a shipped row.
 * @param {Alias} alias
 * @param {string} window
 * @returns {Archetype}
 */
export function toArchetype(alias, window) {
  if (!WINDOW.test(window)) {
    throw new Error(`invalid archetype window ${JSON.stringify(window)}`);
  }

  const label = htmlToText(String(alias.label ?? ""));
  if (label === "") throw new Error(`${archetypeId(alias)} has no label`);

  const cards = [...new Set((alias.slugs ?? []).map((slug) => String(slug).trim()).filter(Boolean))];
  if (cards.length > 2) {
    throw new Error(`${archetypeId(alias)} has more than two sprite slugs; use at most two`);
  }

  return {
    id: archetypeId(alias),
    label,
    cards,
    window,
  };
}

/**
 * Build one window's rows in index order.
 * @param {Alias[]} aliases
 * @param {string} window
 * @returns {Archetype[]}
 */
export function buildArchetypeRows(aliases, window) {
  const rows = [];
  const seen = new Set();

  for (const alias of aliases) {
    const row = toArchetype(alias, window);
    if (seen.has(row.id)) {
      throw new Error(`duplicate archetype id ${row.id} in ${window}`);
    }
    seen.add(row.id);
    rows.push(row);
  }

  return rows;
}

/**
 * Slugs that do not appear on any shipped card. A wrong mapping would make an
 * alias unmatchable, so the build treats this as fatal.
 * @param {Array<{ cards: string[] }>} rows
 * @param {Set<string>} knownSpecies
 */
export function missingSpecies(rows, knownSpecies) {
  const missing = new Set();
  for (const row of rows) {
    for (const slug of row.cards) {
      if (!knownSpecies.has(slug)) missing.add(slug);
    }
  }
  return [...missing].sort();
}
