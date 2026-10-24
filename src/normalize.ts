/**
 * Normalise a parsed decklist against the catalog.
 *
 * Parsing keeps the text as written: names, refs, line numbers, and section
 * headers. Normalisation answers the questions identity needs: which card is
 * this, which section is it really in, which entries are the same card, and
 * which printing should be shown. Unresolved entries are kept, with their
 * provisional key, so a card printed after this catalog still counts.
 *
 * The design is in `docs/specs/2026-10-23-decklist-identity.md` §3.
 */

import {
  catalogContext,
  chooseRepresentative,
  resolveName,
  resolveRef,
  type CatalogContext,
} from "./catalog.js";
import { createNormalizedDeck } from "./deck.js";
import { DecklistError } from "./errors.js";
import { foldName } from "./fold.js";
import { err, ok, type Result } from "./result.js";
import type {
  CatalogCard,
  DecklistWarning,
  DecklistWarningCode,
  DecklistWarningDetails,
  DeckSection,
  NormalizedDeck,
  NormalizedEntry,
  NormalizeOptions,
  ParsedDecklist,
  ParsedEntry,
} from "./types.js";

interface ResolvedLine {
  readonly card: CatalogCard | null;
  readonly count: number;
  readonly key: string;
  readonly name: string;
  readonly printing: { readonly count: number; readonly ref: string } | null;
  readonly section: DeckSection;
}

interface Accumulator {
  readonly card: CatalogCard | null;
  count: number;
  readonly key: string;
  readonly name: string;
  readonly printings: Map<string, { count: number; ref: string }>;
  section: DeckSection;
}

function warn(
  warnings: DecklistWarning[],
  code: DecklistWarningCode,
  line: number | null,
  message: string,
  details: DecklistWarningDetails = {},
): void {
  warnings.push({ code, details, line, message });
}

/** The catalog is authoritative for a resolved card's section. */
function sectionFor(
  entry: ParsedEntry,
  card: CatalogCard,
  warnings: DecklistWarning[],
): DeckSection {
  if (entry.section === "unknown") return card.category;
  if (entry.section !== card.category) {
    warn(
      warnings,
      "section-mismatch",
      entry.line,
      `Catalog says "${card.name}" is a ${card.category} card; the list put it under ${entry.section}.`,
      { actualSection: card.category, declaredSection: entry.section, name: card.name },
    );
  }
  return card.category;
}

function resolveEntry(
  entry: ParsedEntry,
  context: CatalogContext,
  warnings: DecklistWarning[],
): ResolvedLine {
  if (entry.ref !== null) {
    const resolved = resolveRef(context, entry.ref);
    if (resolved.kind === "resolved") {
      return {
        card: resolved.card,
        count: entry.count,
        key: `f:${resolved.card.function}`,
        name: resolved.card.name,
        printing: { count: entry.count, ref: resolved.card.ref },
        section: sectionFor(entry, resolved.card, warnings),
      };
    }

    warn(
      warnings,
      resolved.kind,
      entry.line,
      resolved.kind === "unknown-set"
        ? `Unknown set "${resolved.setCode}" for ref "${resolved.ref}".`
        : `Unknown card "${resolved.ref}".`,
      { ref: resolved.ref, setCode: resolved.setCode },
    );
    return {
      card: null,
      count: entry.count,
      key: `?:${resolved.ref}`,
      name: entry.name,
      printing: { count: entry.count, ref: resolved.ref },
      section: entry.section,
    };
  }

  const resolved = resolveName(context, entry.name);
  if (resolved.kind === "resolved") {
    return {
      card: resolved.card,
      count: entry.count,
      key: `f:${resolved.function}`,
      name: resolved.card.name,
      printing: null,
      section: sectionFor(entry, resolved.card, warnings),
    };
  }

  warn(
    warnings,
    resolved.kind === "ambiguous" ? "ambiguous-name" : "unknown-card",
    entry.line,
    resolved.kind === "ambiguous"
      ? `Name "${entry.name}" matches more than one card; keeping it unresolved.`
      : `Name "${entry.name}" is not in the catalog.`,
    { name: entry.name },
  );
  return {
    card: null,
    count: entry.count,
    key: `?${foldName(entry.name)}`,
    name: entry.name,
    printing: null,
    section: entry.section,
  };
}

function accumulate(lines: readonly ResolvedLine[], context: CatalogContext): NormalizedEntry[] {
  const merged = new Map<string, Accumulator>();

  for (const line of lines) {
    const current = merged.get(line.key);
    if (current === undefined) {
      const printings = new Map<string, { count: number; ref: string }>();
      if (line.printing !== null) printings.set(line.printing.ref, { ...line.printing });
      merged.set(line.key, {
        card: line.card,
        count: line.count,
        key: line.key,
        name: line.name,
        printings,
        section: line.section,
      });
      continue;
    }

    current.count += line.count;
    if (current.section === "unknown" && line.section !== "unknown") {
      current.section = line.section;
    }
    if (line.printing !== null) {
      const printing = current.printings.get(line.printing.ref);
      if (printing === undefined) {
        current.printings.set(line.printing.ref, { ...line.printing });
      } else {
        printing.count += line.count;
      }
    }
  }

  const entries: NormalizedEntry[] = [];
  for (const accumulator of merged.values()) {
    const printings = [...accumulator.printings.values()].sort((left, right) =>
      left.ref.localeCompare(right.ref),
    );
    entries.push({
      card: chooseRepresentative(context, printings) ?? accumulator.card,
      count: accumulator.count,
      key: accumulator.key,
      name: accumulator.name,
      printings,
      section: accumulator.section,
    });
  }

  return entries;
}

/**
 * Resolve a parsed decklist against the catalog.
 *
 * The catalog is required at runtime: the shipped data is opt-in, so the core
 * entry point does not import `./data`. Pass `catalog` from that subpath, or a
 * catalog of the same shape. Omitting it returns a `missing-catalog` error
 * rather than silently leaving every entry unresolved.
 */
export function normalizeDecklist(
  parsed: ParsedDecklist,
  options?: NormalizeOptions,
): Result<NormalizedDeck, DecklistError[]> {
  const catalog = options?.catalog;
  if (catalog === undefined) {
    return err([
      new DecklistError(
        "missing-catalog",
        "Normalisation needs a catalog; pass { catalog } from \"@dierkens.dev/ptcg-decklist-tools/data\".",
      ),
    ]);
  }

  const context = catalogContext(catalog);
  const warnings: DecklistWarning[] = [...parsed.warnings];
  const lines = parsed.entries.map((entry) => resolveEntry(entry, context, warnings));
  const entries = accumulate(lines, context);
  return ok(createNormalizedDeck(entries, warnings, context));
}
