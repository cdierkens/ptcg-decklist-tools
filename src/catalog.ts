/**
 * Catalog context.
 *
 * A catalog is a data contract. Resolving a decklist against it needs derived
 * indexes and a few ordering rules: which set a live code means when codes
 * collide, which printing represents a functional card, and which card a folded
 * name identifies. This module owns those rules behind two interfaces: a small
 * set context for format checks, and a full catalog context for normalisation.
 */

import { foldName } from "./fold.js";
import { normalizeNumber, normalizeSetCode, setCodeOf } from "./refs.js";
import type { CardRef, Catalog, CatalogCard, CatalogSet } from "./types.js";

/** Set order and live-code resolution. Format checks need only this much. */
export interface SetContext {
  readonly id: string;
  readonly catalogVersion: string;
  readonly sets: readonly CatalogSet[];
  /** Live-addressable sets by uppercase live code; the lowest-order set wins. */
  readonly setByLiveCode: ReadonlyMap<string, CatalogSet>;
  readonly setOrderByLiveCode: ReadonlyMap<string, number>;
}

/** A set context plus the card indexes normalisation needs. */
export interface CatalogContext extends SetContext {
  readonly catalog: Catalog;
  readonly cardsByRef: ReadonlyMap<string, CatalogCard>;
  /** One representative printing per functional fingerprint. */
  readonly cardsByFunction: ReadonlyMap<string, CatalogCard>;
  readonly functionsByName: ReadonlyMap<string, ReadonlySet<string>>;
}

export type RefResolution =
  | { readonly card: CatalogCard; readonly kind: "resolved"; readonly ref: string }
  | { readonly kind: "unknown-card"; readonly ref: string; readonly setCode: string }
  | { readonly kind: "unknown-set"; readonly ref: string; readonly setCode: string };

export type NameResolution =
  | { readonly card: CatalogCard; readonly function: string; readonly kind: "resolved" }
  | { readonly kind: "ambiguous" }
  | { readonly kind: "unknown" };

const contexts = new WeakMap<Catalog, CatalogContext>();

/** Positive when `a` is the better representative: higher set order, then lower ref. */
export function compareCards(
  context: SetContext,
  left: CatalogCard,
  right: CatalogCard,
): number {
  const leftOrder = context.setOrderByLiveCode.get(setCodeOf(left.ref)) ?? -1;
  const rightOrder = context.setOrderByLiveCode.get(setCodeOf(right.ref)) ?? -1;
  const order = leftOrder - rightOrder;
  return order === 0 ? right.ref.localeCompare(left.ref) : order;
}

/** Positive when `a` wins: more copies, then higher order, then lower ref. */
export function comparePrintings(
  context: SetContext,
  left: { readonly count: number; readonly ref: string },
  leftCard: CatalogCard,
  right: { readonly count: number; readonly ref: string },
  rightCard: CatalogCard,
): number {
  return left.count === right.count
    ? compareCards(context, leftCard, rightCard)
    : left.count - right.count;
}

/** The representative printing for a functional card. */
export function chooseRepresentative(
  context: CatalogContext,
  printings: readonly { readonly count: number; readonly ref: string }[],
): CatalogCard | null {
  let bestPrinting: { readonly count: number; readonly ref: string } | null = null;
  let bestCard: CatalogCard | null = null;

  for (const printing of printings) {
    const card = context.cardsByRef.get(printing.ref);
    if (card === undefined) continue;

    if (
      bestPrinting === null ||
      bestCard === null ||
      comparePrintings(context, printing, card, bestPrinting, bestCard) > 0
    ) {
      bestPrinting = printing;
      bestCard = card;
    }
  }

  return bestCard;
}

/** A stable fingerprint of the set facts a context is built from. */
function contextId(catalogVersion: string, sets: readonly CatalogSet[]): string {
  const text = [
    catalogVersion,
    ...sets.map(
      (set) =>
        `${set.liveCode}:${set.tcgdexId}:${set.order}:${set.liveAddressable ? 1 : 0}`,
    ),
  ].join("\n");

  let hash = 0xcbf29ce484222325n;
  for (const character of text) {
    hash ^= BigInt(character.codePointAt(0) ?? 0);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `catalog:${hash.toString(16).padStart(16, "0")}`;
}

/** Build a set context from a catalog version and its sets. */
export function createSetContext(
  catalogVersion: string,
  sets: readonly CatalogSet[],
): SetContext {
  const setByLiveCode = new Map<string, CatalogSet>();
  const setOrderByLiveCode = new Map<string, number>();
  for (const set of sets) {
    const code = normalizeSetCode(set.liveCode);
    if (!setOrderByLiveCode.has(code)) setOrderByLiveCode.set(code, set.order);
    if (!set.liveAddressable) continue;

    const current = setByLiveCode.get(code);
    if (current === undefined || set.order < current.order) {
      setByLiveCode.set(code, set);
      setOrderByLiveCode.set(code, set.order);
    }
  }

  return {
    catalogVersion,
    id: contextId(catalogVersion, sets),
    setByLiveCode,
    setOrderByLiveCode,
    sets,
  };
}

/** Build or reuse the indexes a full catalog needs. */
export function catalogContext(catalog: Catalog): CatalogContext {
  const cached = contexts.get(catalog);
  if (cached !== undefined) return cached;

  const setContext = createSetContext(catalog.catalogVersion, catalog.sets);
  const cardsByRef = new Map<string, CatalogCard>();
  const cardsByFunction = new Map<string, CatalogCard>();
  const functionsByName = new Map<string, Set<string>>();

  const index: CatalogContext = {
    ...setContext,
    cardsByFunction,
    cardsByRef,
    catalog,
    functionsByName,
  };

  for (const card of catalog.cards) {
    cardsByRef.set(card.ref, card);

    const representative = cardsByFunction.get(card.function);
    if (representative === undefined || compareCards(index, card, representative) > 0) {
      cardsByFunction.set(card.function, card);
    }

    const name = foldName(card.name);
    const functions = functionsByName.get(name);
    if (functions === undefined) functionsByName.set(name, new Set([card.function]));
    else functions.add(card.function);
  }

  contexts.set(catalog, index);
  return index;
}

/** Look up a live-addressable set by code. */
export function setForCode(
  context: SetContext,
  code: string,
): CatalogSet | undefined {
  return context.setByLiveCode.get(normalizeSetCode(code));
}

/** Resolve a parsed ref against the catalog. */
export function resolveRef(context: CatalogContext, ref: CardRef): RefResolution {
  const setCode = normalizeSetCode(ref.setCode);
  const number = normalizeNumber(ref.number);
  const provisional = `${setCode}-${number}`;
  const set = context.setByLiveCode.get(setCode);
  if (set === undefined) return { kind: "unknown-set", ref: provisional, setCode };

  const card = context.cardsByRef.get(`${set.liveCode}-${number}`);
  if (card === undefined) return { kind: "unknown-card", ref: provisional, setCode };
  return { card, kind: "resolved", ref: card.ref };
}

/** Resolve a ref-less name only when the catalog has exactly one function for it. */
export function resolveName(context: CatalogContext, name: string): NameResolution {
  const functions = context.functionsByName.get(foldName(name));
  if (functions === undefined || functions.size === 0) return { kind: "unknown" };
  if (functions.size > 1) return { kind: "ambiguous" };

  const [fn] = functions;
  if (fn === undefined) return { kind: "unknown" };
  const card = context.cardsByFunction.get(fn);
  if (card === undefined) return { kind: "unknown" };
  return { card, function: fn, kind: "resolved" };
}
