import { readFileSync } from "node:fs";

import { catalog } from "../data.js";
import {
  normalizeDecklist,
  parseDecklist,
  unwrapOrThrow,
  type NormalizedDeck,
} from "../index.js";

export function readFixture(relative: string): string {
  return readFileSync(new URL(relative, import.meta.url), "utf8");
}

export function fixture(name: string): string {
  return readFixture(`./fixtures/decklists/${name}`);
}

export function normalize(text: string): NormalizedDeck {
  return unwrapOrThrow(normalizeDecklist(unwrapOrThrow(parseDecklist(text)), { catalog }));
}
