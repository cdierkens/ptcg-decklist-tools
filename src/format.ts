import { FormatError } from "./errors.js";
import { countByName } from "./identity.js";
import { err, ok } from "./result.js";
import { sets as shippedSets } from "./sets.js";
import type { Result } from "./result.js";
import type {
  Catalog,
  CatalogSet,
  FittingWindowsOptions,
  FormatReport,
  FormatWindow,
  NormalizedDeck,
  NormalizedEntry,
} from "./types.js";

/**
 * Basic Energy is exempt from the four-copy rule. The catalog does not carry
 * the subtype, so match the canonical English names that ship today. A
 * localized unresolved name cannot be classified; the report stays advisory.
 */
const BASIC_ENERGY =
  /^(?:Basic )?(?:Grass|Fire|Water|Lightning|Psychic|Fighting|Darkness|Metal|Fairy) Energy$/u;

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Live codes are not unique; the addressable set wins, lowest order first. */
function indexSets(sets: readonly CatalogSet[]): Map<string, CatalogSet> {
  const index = new Map<string, CatalogSet>();
  for (const set of sets) {
    if (!set.liveAddressable) continue;
    const current = index.get(set.liveCode);
    if (current === undefined || set.order < current.order) index.set(set.liveCode, set);
  }
  return index;
}

function resolveSet(code: string, index: Map<string, CatalogSet>): CatalogSet | undefined {
  return index.get(code.trim().toUpperCase());
}

function invalidLabel(input: string, message: string): Result<never, FormatError> {
  return err(new FormatError("invalid-label", input, message));
}

function unknownSet(input: string): Result<never, FormatError> {
  return err(new FormatError("unknown-set", input, `Unknown set "${input}".`));
}

/**
 * Resolve a Limitless-style window label such as `TEF-30C`. Both ends must be
 * live-addressable sets, and the base cannot be newer than the latest set.
 */
export function parseFormatLabel(
  label: string,
  catalog?: Catalog,
): Result<FormatWindow, FormatError> {
  const trimmed = label.trim();
  const parts = trimmed.split("-");
  if (parts.length !== 2) {
    return invalidLabel(trimmed, `"${label}" is not a BASE-LATEST window label.`);
  }

  const rawBase = parts[0]?.trim() ?? "";
  const rawLatest = parts[1]?.trim() ?? "";
  if (rawBase === "" || rawLatest === "") {
    return invalidLabel(trimmed, `"${label}" is missing a window end.`);
  }

  const index = indexSets(catalog?.sets ?? shippedSets);
  const base = resolveSet(rawBase, index);
  if (base === undefined) return unknownSet(rawBase);

  const latest = resolveSet(rawLatest, index);
  if (latest === undefined) return unknownSet(rawLatest);

  if (base.order > latest.order) {
    return invalidLabel(trimmed, `"${label}" starts after it ends.`);
  }

  return ok({
    base: base.liveCode,
    label: `${base.liveCode}-${latest.liveCode}`,
    latest: latest.liveCode,
  });
}

function refsForEntry(entry: NormalizedEntry): readonly string[] {
  if (entry.printings.length > 0) return entry.printings.map((printing) => printing.ref);
  return entry.card === null ? [] : [entry.card.ref];
}

function setCodeForRef(ref: string): string {
  const dash = ref.indexOf("-");
  return dash === -1 ? ref : ref.slice(0, dash);
}

/**
 * Check which entries sit outside a window and which names exceed four copies.
 * Advisory only: Standard legality is a regulation-mark rule, and promos can
 * sit outside the set order. Four-copy counting is name-based, not identity.
 */
export function validateDeck(
  deck: NormalizedDeck,
  window: FormatWindow,
  catalog?: Catalog,
): FormatReport {
  const index = indexSets(catalog?.sets ?? shippedSets);
  const unknown = new Set<string>();

  const base = resolveSet(window.base, index);
  if (base === undefined) unknown.add(window.base.trim().toUpperCase());

  const latest = resolveSet(window.latest, index);
  if (latest === undefined) unknown.add(window.latest.trim().toUpperCase());

  const outside: NormalizedEntry[] = [];
  for (const entry of deck.entries) {
    let entryOutside = false;
    for (const ref of refsForEntry(entry)) {
      const code = setCodeForRef(ref).trim().toUpperCase();
      const set = resolveSet(code, index);
      if (set === undefined) {
        unknown.add(code);
        continue;
      }
      if (base !== undefined && latest !== undefined) {
        if (set.order < base.order || set.order > latest.order) entryOutside = true;
      }
    }
    if (entryOutside) outside.push(entry);
  }

  const fourCopy = countByName(deck).filter(
    ({ count, name }) => count > 4 && !BASIC_ENERGY.test(name),
  );

  const unknownSets = [...unknown].sort(compare);
  return {
    fourCopy,
    ok: outside.length === 0 && unknownSets.length === 0 && fourCopy.length === 0,
    outside,
    unknownSets,
    window,
  };
}

/**
 * Candidate windows that contain every known printing.
 *
 * The deck's oldest card only bounds the candidates: every live-addressable set
 * at or before it is tried as a possible base, optionally narrowed by `era`.
 * The latest end is the catalog's newest live-addressable set, so the result is
 * a current window and the deck never chooses its own base. Any unknown set, or
 * any entry with no set at all, means the deck cannot be proven to fit, so the
 * result is empty.
 */
export function fittingWindows(
  deck: NormalizedDeck,
  options: FittingWindowsOptions = {},
): FormatWindow[] {
  const catalogSets = options.catalog?.sets ?? shippedSets;
  const index = indexSets(catalogSets);
  const orders: number[] = [];

  for (const entry of deck.entries) {
    const refs = refsForEntry(entry);
    if (refs.length === 0) return [];
    for (const ref of refs) {
      const set = resolveSet(setCodeForRef(ref), index);
      if (set === undefined) return [];
      orders.push(set.order);
    }
  }

  if (orders.length === 0) return [];

  const oldest = Math.min(...orders);
  const newest = Math.max(...orders);

  let latest: CatalogSet | undefined;
  for (const set of catalogSets) {
    if (!set.liveAddressable) continue;
    if (latest === undefined || set.order > latest.order) latest = set;
  }
  if (latest === undefined || latest.order < newest) return [];

  const bases = new Map<string, CatalogSet>();
  for (const set of catalogSets) {
    if (!set.liveAddressable || set.order > oldest) continue;
    if (options.era !== undefined && set.era !== options.era) continue;
    const current = bases.get(set.liveCode);
    if (current === undefined || set.order < current.order) bases.set(set.liveCode, set);
  }

  return [...bases.values()]
    .sort((left, right) => left.order - right.order)
    .map((base) => ({
      base: base.liveCode,
      label: `${base.liveCode}-${latest.liveCode}`,
      latest: latest.liveCode,
    }));
}
