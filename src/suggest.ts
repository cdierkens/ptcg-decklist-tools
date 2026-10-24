/**
 * Suggest archetypes from a normalised deck.
 *
 * The shipped Limitless alias table is the source of truth for labels. An alias
 * is matched only when every icon species is present, summing copies across
 * printings. When no alias matches, the fallback groups Pokémon by evolution
 * line and proposes a card pair; it never invents an alias.
 *
 * Suggestions are advisory. This module never writes an archetype.
 */

import { archetypes as shippedArchetypes } from "./archetypes.js";
import { parseFormatLabel } from "./format.js";
import { isOk } from "./result.js";
import type {
  ArchetypeSuggestion,
  CatalogArchetype,
  CatalogCard,
  NormalizedDeck,
  NormalizedEntry,
  SuggestArchetypeOptions,
} from "./types.js";

interface SpeciesUse {
  count: number;
  name: string;
  nameCount: number;
}

interface AliasGroup {
  readonly aliases: CatalogArchetype[];
  readonly copies: number;
  readonly order: number;
  readonly representative: CatalogArchetype;
  readonly specificity: number;
  readonly uses: readonly SpeciesUse[];
  readonly windows: string[];
}

interface LineGroup {
  copies: number;
  readonly entries: NormalizedEntry[];
  readonly line: string;
  order: number;
  readonly stages: Set<string>;
  score: number;
  weight: number;
}

function plus(a: number, b: number): number {
  return a + b;
}

function formatCounts(uses: readonly SpeciesUse[]): string {
  return uses.map((use) => `${use.count}× ${use.name}`).join(", ");
}

function formatWindows(windows: readonly string[]): string {
  return windows.join(", ");
}

function selectedWindow(options: SuggestArchetypeOptions): string | null {
  if (options.window === undefined) return null;
  const label = typeof options.window === "string" ? options.window : options.window.label;
  const parsed = parseFormatLabel(label, options.catalog);
  return (isOk(parsed) ? parsed.value.label : label.trim()).toUpperCase();
}

/** Sum copies by species and keep a readable name for each one. */
function speciesUses(deck: NormalizedDeck): Map<string, SpeciesUse> {
  const uses = new Map<string, SpeciesUse>();

  for (const entry of deck.entries) {
    const card = entry.card;
    if (card === null || card.category !== "pokemon" || card.species === null) continue;
    if (entry.count <= 0) continue;

    const current = uses.get(card.species);
    if (current === undefined) {
      uses.set(card.species, { count: entry.count, name: entry.name, nameCount: entry.count });
      continue;
    }

    current.count += entry.count;
    if (entry.count > current.nameCount) {
      current.name = entry.name;
      current.nameCount = entry.count;
    }
  }

  return uses;
}

function aliasGroups(deck: NormalizedDeck, options: SuggestArchetypeOptions): AliasGroup[] {
  const uses = speciesUses(deck);
  if (uses.size === 0) return [];

  const table = options.archetypes ?? shippedArchetypes;
  const window = selectedWindow(options);
  const groups = new Map<string, AliasGroup>();

  for (let order = 0; order < table.length; order += 1) {
    const alias = table[order];
    if (alias === undefined) continue;
    if (window !== null && alias.window.toUpperCase() !== window) continue;
    if (alias.cards.length === 0) continue;

    const matchedUses = alias.cards.map((slug) => uses.get(slug));
    if (!matchedUses.every((use): use is SpeciesUse => use !== undefined)) continue;

    const key = [...alias.cards].map((slug) => slug.toLowerCase()).sort().join("\u0000");
    const existing = groups.get(key);
    if (existing !== undefined) {
      existing.aliases.push(alias);
      if (!existing.windows.includes(alias.window)) existing.windows.push(alias.window);
      continue;
    }

    groups.set(key, {
      aliases: [alias],
      copies: matchedUses.map((use) => use.count).reduce(plus, 0),
      order,
      representative: alias,
      specificity: alias.cards.length,
      uses: matchedUses,
      windows: [alias.window],
    });
  }

  return [...groups.values()].sort((left, right) => {
    if (left.specificity !== right.specificity) return right.specificity - left.specificity;
    if (left.copies !== right.copies) return right.copies - left.copies;
    if (left.order !== right.order) return left.order - right.order;
    return left.representative.id.localeCompare(right.representative.id);
  });
}

function aliasSuggestions(deck: NormalizedDeck, options: SuggestArchetypeOptions): ArchetypeSuggestion[] {
  const groups = aliasGroups(deck, options);
  if (groups.length === 0) return [];

  const multiCardCount = groups.filter((group) => group.specificity > 1).length;

  return groups.map((group) => {
    const reasons = [`Matched ${formatCounts(group.uses)} in ${formatWindows(group.windows)}.`];

    if (group.specificity > 1) {
      const otherLabels = [...new Set(group.aliases.map((alias) => alias.label))].filter(
        (label) => label !== group.representative.label,
      );
      if (otherLabels.length > 0) {
        reasons.push(
          `Same icons also label ${otherLabels.join(", ")}; kept ${group.representative.label}.`,
        );
      }
      reasons.push(
        multiCardCount === 1
          ? "Unique two-card alias at this specificity."
          : `${multiCardCount} two-card aliases matched; no single winner.`,
      );
    } else {
      reasons.push("One-card alias; it cannot distinguish variants, so confidence is low.");
    }

    return {
      id: group.representative.id,
      label: group.representative.label,
      cards: [...group.representative.cards],
      confidence: group.specificity > 1 ? (multiCardCount === 1 ? 0.9 : 0.6) : 0.4,
      basis: "alias",
      reasons,
    };
  });
}

function attackerWeight(card: CatalogCard): number {
  let weight = 1;
  if (card.stage === "stage2") weight += 2;
  else if (card.stage === "stage1") weight += 1;

  const name = card.name.toLowerCase();
  if (name.endsWith(" ex")) weight += 1;
  if (name.startsWith("mega ")) weight += 1;
  if (name.endsWith(" vstar")) weight += 1;
  return weight;
}

function entryScore(entry: NormalizedEntry): number {
  const card = entry.card;
  return card === null ? 0 : entry.count * attackerWeight(card);
}

function lineName(name: string): string {
  return name.replace(/ (?:ex|EX|GX|V|VMAX|VSTAR)$/u, "");
}

function lineGroups(deck: NormalizedDeck): LineGroup[] {
  const groups = new Map<string, LineGroup>();
  let order = 0;

  for (const entry of deck.entries) {
    const card = entry.card;
    if (card === null || card.category !== "pokemon" || card.line === null) continue;
    if (entry.count <= 0) continue;

    const existing = groups.get(card.line);
    if (existing === undefined) {
      const stages = new Set<string>();
      if (card.stage !== null) stages.add(card.stage);
      groups.set(card.line, {
        copies: entry.count,
        entries: [entry],
        line: card.line,
        order,
        stages,
        score: 0,
        weight: attackerWeight(card),
      });
      order += 1;
      continue;
    }

    existing.copies += entry.count;
    existing.entries.push(entry);
    existing.weight = Math.max(existing.weight, attackerWeight(card));
    if (card.stage !== null) existing.stages.add(card.stage);
  }

  const lines = [...groups.values()];
  for (const group of lines) {
    group.score = group.copies * group.weight * (1 + 0.25 * group.stages.size);
  }

  return lines.sort((left, right) => {
    if (left.score !== right.score) return right.score - left.score;
    if (left.copies !== right.copies) return right.copies - left.copies;
    if (left.order !== right.order) return left.order - right.order;
    return left.line.localeCompare(right.line);
  });
}

function lineCards(group: LineGroup): string[] {
  const species = new Map<string, { copies: number; name: string; nameCount: number; weighted: number }>();

  for (const entry of group.entries) {
    const card = entry.card;
    if (card === null || card.species === null) continue;
    const weight = attackerWeight(card);
    const current = species.get(card.species);
    if (current === undefined) {
      species.set(card.species, {
        copies: entry.count,
        name: entry.name,
        nameCount: entry.count,
        weighted: entry.count * weight,
      });
      continue;
    }
    current.copies += entry.count;
    current.weighted += entry.count * weight;
    if (entry.count > current.nameCount) {
      current.name = entry.name;
      current.nameCount = entry.count;
    }
  }

  return [...species.entries()]
    .sort(([leftSlug, left], [rightSlug, right]) => {
      if (left.weighted !== right.weighted) return right.weighted - left.weighted;
      if (left.copies !== right.copies) return right.copies - left.copies;
      return leftSlug.localeCompare(rightSlug);
    })
    .slice(0, 2)
    .map(([slug]) => slug);
}

function bestEntry(entries: readonly NormalizedEntry[]): NormalizedEntry | undefined {
  let best: NormalizedEntry | undefined;
  for (const entry of entries) {
    if (best === undefined || entryScore(entry) > entryScore(best)) best = entry;
  }
  return best;
}

function lineLabel(group: LineGroup): string {
  const name = bestEntry(group.entries)?.card?.name;
  return `${lineName(name ?? "Line")} line`;
}

function lineReasons(group: LineGroup): string[] {
  const card = bestEntry(group.entries)?.card;
  const traits: string[] = [];
  if (card?.stage === "stage2") traits.push("Stage 2");
  else if (card?.stage === "stage1") traits.push("Stage 1");
  const name = card?.name.toLowerCase() ?? "";
  if (name.endsWith(" ex")) traits.push("ex");
  if (name.startsWith("mega ")) traits.push("Mega");
  if (name.endsWith(" vstar")) traits.push("VSTAR");
  if (traits.length === 0) traits.push("basic attacker");

  return [
    `No alias matched; grouped ${group.copies} cards across ${group.stages.size} evolution stage(s) on ${group.line}.`,
    `Favours ${traits.join(", ")}.`,
    "Line fallback is capped at 0.5 confidence.",
  ];
}

function lineSuggestions(deck: NormalizedDeck): ArchetypeSuggestion[] {
  const groups = lineGroups(deck);
  const maxScore = groups[0]?.score ?? 0;

  const suggestions: ArchetypeSuggestion[] = [];
  for (const group of groups) {
    const cards = lineCards(group);
    if (cards.length === 0) continue;
    const ratio = maxScore === 0 ? 0 : group.score / maxScore;

    suggestions.push({
      id: `line:${group.line}`,
      label: lineLabel(group),
      cards,
      confidence: Math.round(Math.min(0.5, 0.25 + 0.25 * ratio) * 100) / 100,
      basis: "lines",
      reasons: lineReasons(group),
    });
  }

  return suggestions;
}

/**
 * Suggest aliases, then fall back to evolution lines when no alias matches.
 *
 * Pass `{ window: "TEF-30C" }` to scope the table. Without a window every
 * shipped window is tried, and the reasons say which one matched. The result is
 * advisory: nothing here writes or stores an archetype.
 */
export function suggestArchetype(
  deck: NormalizedDeck,
  options: SuggestArchetypeOptions = {},
): ArchetypeSuggestion[] {
  const aliases = aliasSuggestions(deck, options);
  return aliases.length > 0 ? aliases : lineSuggestions(deck);
}
