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

import { DecklistError } from "./errors.js";
import { foldName } from "./fold.js";
import { err, ok, type Result } from "./result.js";
import type {
  Catalog,
  CatalogCard,
  CatalogSet,
  DecklistWarning,
  DecklistWarningCode,
  DeckSection,
  NormalizedDeck,
  NormalizedEntry,
  NormalizeOptions,
  ParsedDecklist,
  ParsedEntry,
} from "./types.js";

interface CatalogIndex {
  readonly cardsByFunction: ReadonlyMap<string, CatalogCard>;
  readonly cardsByRef: ReadonlyMap<string, CatalogCard>;
  readonly functionsByName: ReadonlyMap<string, ReadonlySet<string>>;
  readonly setOrderByLiveCode: ReadonlyMap<string, number>;
  readonly setsByLiveCode: ReadonlyMap<string, CatalogSet>;
}

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

const indexes = new WeakMap<Catalog, CatalogIndex>();

/** `TEF-130` -> `TEF`; also keeps gallery codes such as `BRS:TG` intact. */
function setCodeOf(ref: string): string {
  const dash = ref.lastIndexOf("-");
  return dash === -1 ? ref : ref.slice(0, dash);
}

/**
 * Live prints numeric local ids without leading zeroes; the catalog does too.
 * Accept `001`, `1`, and `0001` as the same card, and uppercase promo suffixes.
 */
function normalizeNumber(value: string): string {
  const trimmed = value.trim();
  const number = /^\d+$/.test(trimmed) ? trimmed.replace(/^0+(?=\d)/, "") : trimmed;
  return number.toUpperCase();
}

function setOrderOf(card: CatalogCard, orders: ReadonlyMap<string, number>): number {
  return orders.get(setCodeOf(card.ref)) ?? -1;
}

/** Positive when `a` is the better representative: higher set order, then lower ref. */
function compareCards(a: CatalogCard, b: CatalogCard, orders: ReadonlyMap<string, number>): number {
  const order = setOrderOf(a, orders) - setOrderOf(b, orders);
  return order === 0 ? b.ref.localeCompare(a.ref) : order;
}

/** Positive when `a` wins: more copies, then higher order, then lower ref. */
function comparePrintings(
  a: { readonly count: number; readonly ref: string },
  aCard: CatalogCard,
  b: { readonly count: number; readonly ref: string },
  bCard: CatalogCard,
  orders: ReadonlyMap<string, number>,
): number {
  return a.count === b.count ? compareCards(aCard, bCard, orders) : a.count - b.count;
}

function indexCatalog(catalog: Catalog): CatalogIndex {
  const cached = indexes.get(catalog);
  if (cached !== undefined) return cached;

  const setOrderByLiveCode = new Map<string, number>();
  const setsByLiveCode = new Map<string, CatalogSet>();
  for (const set of catalog.sets) {
    const code = set.liveCode.toUpperCase();
    setOrderByLiveCode.set(code, set.order);
    if (set.liveAddressable && !setsByLiveCode.has(code)) setsByLiveCode.set(code, set);
  }

  const cardsByRef = new Map<string, CatalogCard>();
  const cardsByFunction = new Map<string, CatalogCard>();
  const functionsByName = new Map<string, Set<string>>();

  for (const card of catalog.cards) {
    cardsByRef.set(card.ref, card);

    const representative = cardsByFunction.get(card.function);
    if (
      representative === undefined ||
      compareCards(card, representative, setOrderByLiveCode) > 0
    ) {
      cardsByFunction.set(card.function, card);
    }

    const name = foldName(card.name);
    const functions = functionsByName.get(name);
    if (functions === undefined) functionsByName.set(name, new Set([card.function]));
    else functions.add(card.function);
  }

  const index = {
    cardsByFunction,
    cardsByRef,
    functionsByName,
    setOrderByLiveCode,
    setsByLiveCode,
  };
  indexes.set(catalog, index);
  return index;
}

type RefResolution =
  | { readonly card: CatalogCard; readonly kind: "resolved"; readonly ref: string }
  | { readonly kind: "unknown-card"; readonly ref: string; readonly setCode: string }
  | { readonly kind: "unknown-set"; readonly ref: string; readonly setCode: string };

function resolveRef(
  ref: { readonly number: string; readonly setCode: string },
  index: CatalogIndex,
): RefResolution {
  const setCode = ref.setCode.trim().toUpperCase();
  const number = normalizeNumber(ref.number);
  const provisional = `${setCode}-${number}`;
  const set = index.setsByLiveCode.get(setCode);
  if (set === undefined) return { kind: "unknown-set", ref: provisional, setCode };

  const card = index.cardsByRef.get(`${set.liveCode}-${number}`);
  if (card === undefined) return { kind: "unknown-card", ref: provisional, setCode };
  return { card, kind: "resolved", ref: card.ref };
}

type NameResolution =
  | { readonly card: CatalogCard; readonly function: string; readonly kind: "resolved" }
  | { readonly kind: "ambiguous" }
  | { readonly kind: "unknown" };

function resolveName(name: string, index: CatalogIndex): NameResolution {
  const functions = index.functionsByName.get(foldName(name));
  if (functions === undefined || functions.size === 0) return { kind: "unknown" };
  if (functions.size > 1) return { kind: "ambiguous" };

  const [fn] = functions;
  if (fn === undefined) return { kind: "unknown" };
  const card = index.cardsByFunction.get(fn);
  if (card === undefined) return { kind: "unknown" };
  return { card, function: fn, kind: "resolved" };
}

function warn(
  warnings: DecklistWarning[],
  code: DecklistWarningCode,
  line: number | null,
  message: string,
): void {
  warnings.push({ code, line, message });
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
    );
  }
  return card.category;
}

function resolveEntry(
  entry: ParsedEntry,
  index: CatalogIndex,
  warnings: DecklistWarning[],
): ResolvedLine {
  if (entry.ref !== null) {
    const resolved = resolveRef(entry.ref, index);
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

  const resolved = resolveName(entry.name, index);
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

function chooseRepresentative(
  printings: readonly { readonly count: number; readonly ref: string }[],
  index: CatalogIndex,
): CatalogCard | null {
  let bestPrinting: { readonly count: number; readonly ref: string } | null = null;
  let bestCard: CatalogCard | null = null;

  for (const printing of printings) {
    const card = index.cardsByRef.get(printing.ref);
    if (card === undefined) continue;

    if (
      bestPrinting === null ||
      bestCard === null ||
      comparePrintings(
        printing,
        card,
        bestPrinting,
        bestCard,
        index.setOrderByLiveCode,
      ) > 0
    ) {
      bestPrinting = printing;
      bestCard = card;
    }
  }

  return bestCard;
}

function accumulate(
  lines: readonly ResolvedLine[],
  index: CatalogIndex,
): NormalizedEntry[] {
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
      card: chooseRepresentative(printings, index) ?? accumulator.card,
      count: accumulator.count,
      key: accumulator.key,
      name: accumulator.name,
      printings,
      section: accumulator.section,
    });
  }

  entries.sort((left, right) =>
    left.key < right.key ? -1 : left.key > right.key ? 1 : 0,
  );
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

  const index = indexCatalog(catalog);
  const warnings: DecklistWarning[] = [...parsed.warnings];
  const lines = parsed.entries.map((entry) => resolveEntry(entry, index, warnings));
  const entries = accumulate(lines, index);
  const total = entries.reduce((sum, entry) => sum + entry.count, 0);

  return ok({ catalogVersion: catalog.catalogVersion, entries, total, warnings });
}
