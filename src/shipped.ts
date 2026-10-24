/**
 * The shipped data seam.
 *
 * Two sizes of data ship with the package:
 *
 * - `shippedSets` and `shippedArchetypes` are small enough for the core entry
 *   point, so format windows and alias matching work without importing cards.
 * - the card list lives on the `./data` subpath through `data.ts`.
 *
 * This module owns the small half and the defaults. Keeping it separate makes
 * "what ships in the core" and "what needs the data subpath" explicit.
 */

import archetypesJson from "./data/archetypes.json" with { type: "json" };
import setsJson from "./data/sets.json" with { type: "json" };
import versionJson from "./data/version.json" with { type: "json" };

import { catalogContext, type CatalogContext } from "./catalog.js";
import type { CatalogArchetype, CatalogSet } from "./types.js";

/** The shipped set index, oldest first. */
export const shippedSets: readonly CatalogSet[] = setsJson as readonly CatalogSet[];

/** The shipped, window-scoped Limitless aliases. */
export const shippedArchetypes: readonly CatalogArchetype[] =
  archetypesJson as readonly CatalogArchetype[];

/** The build date of the shipped catalog, `YYYY-MM-DD`. */
export const shippedCatalogVersion: string = versionJson.version;

let setContext: CatalogContext | undefined;

/**
 * A set-only context for the shipped data. Format checks need set order and
 * live-code resolution, not cards, so they do not pull the large data subpath.
 */
export function shippedSetContext(): CatalogContext {
  setContext ??= catalogContext({
    cards: [],
    catalogVersion: shippedCatalogVersion,
    sets: shippedSets,
  });
  return setContext;
}
