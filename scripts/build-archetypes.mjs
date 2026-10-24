#!/usr/bin/env node
/**
 * Build the shipped, window-scoped Limitless archetype table.
 *
 * The table is a snapshot. It is not fetched at install or runtime. Run this
 * deliberately after `pnpm run catalog` so every icon slug is checked against
 * the new card list:
 *
 *   pnpm run archetypes
 *   pnpm run archetypes -- --refresh
 *   pnpm run archetypes -- --window=TEF-30C --window=SVI-ASC
 *
 * The default windows live in `scripts/catalog/archetype-windows.json`: the
 * current rotation, the previous latest-set window, and the previous rotation.
 * A label-only alias is kept with `cards: []`; an alias with more than two
 * icons fails the build.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { buildArchetypeRows, missingSpecies } from "./lib/archetypes.mjs";
import { addressableSets } from "./lib/catalog.mjs";
import { parseIndex } from "./lib/limitless.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const BASE = "https://limitlesstcg.com";
const WINDOWS = join(ROOT, "scripts", "catalog", "archetype-windows.json");
const CARDS = join(ROOT, "src", "data", "cards.json");
const SETS = join(ROOT, "src", "data", "sets.json");
const CACHE = join(ROOT, ".cache", "archetypes");

const options = {
  window: { type: "string", multiple: true },
  out: { type: "string", default: "src/data/archetypes.json" },
  refresh: { type: "boolean", default: false },
  delay: { type: "string", default: "750" },
  help: { type: "boolean", default: false },
};

const { values: args } = parseArgs({ options, allowPositionals: false });

if (args.help) {
  process.stdout.write(
    [
      "Build the shipped Limitless archetype table.",
      "",
      "  --window=LABEL   window to snapshot (repeatable; defaults to the config)",
      "  --out=FILE       output JSON (default src/data/archetypes.json)",
      "  --refresh        ignore cached HTML and fetch every window again",
      "  --delay=MS       delay between requests (default 750)",
      "",
    ].join("\n"),
  );
  process.exit(0);
}

const delayMs = Number(args.delay);
if (!Number.isFinite(delayMs) || delayMs < 0) {
  throw new Error(`--delay must be a non-negative number, got ${args.delay}`);
}

const outFile = resolve(ROOT, args.out);
const cards = JSON.parse(await readFile(CARDS, "utf8"));
const sets = JSON.parse(await readFile(SETS, "utf8"));
const knownSpecies = new Set(cards.map((card) => card.species).filter(Boolean));

const windowConfig = args.window?.length
  ? args.window
  : JSON.parse(await readFile(WINDOWS, "utf8"));
if (!Array.isArray(windowConfig) || windowConfig.length === 0) {
  throw new Error(`no windows configured in ${WINDOWS}`);
}
if (windowConfig.some((window) => typeof window !== "string")) {
  throw new Error(`${WINDOWS} must be an array of window labels`);
}

const addressable = addressableSets(sets);

function validateWindow(label) {
  const parts = label.split("-");
  if (parts.length !== 2) throw new Error(`invalid window ${JSON.stringify(label)}`);
  const [baseCode, latestCode] = parts;
  const base = addressable.get(baseCode);
  const latest = addressable.get(latestCode);
  if (!base) throw new Error(`window ${label} has unknown base ${baseCode}`);
  if (!latest) throw new Error(`window ${label} has unknown latest ${latestCode}`);
  if (base.order > latest.order) throw new Error(`window ${label} starts after it ends`);
}

for (const window of windowConfig) validateWindow(window);
if (new Set(windowConfig).size !== windowConfig.length) {
  throw new Error(`duplicate window in ${WINDOWS}`);
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function get(path, attempts = 3) {
  const url = new URL(path, BASE);
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          accept: "text/html,application/xhtml+xml",
          "user-agent": "@dierkens.dev/ptcg-decklist-tools archetype builder",
        },
      });
      if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
      const text = await response.text();
      await sleep(delayMs);
      return text;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(delayMs * attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function loadWindow(window) {
  const file = join(CACHE, `${window.replace(/[^A-Za-z0-9.-]+/g, "_")}.html`);
  if (!args.refresh) {
    try {
      return await readFile(file, "utf8");
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }

  const html = await get(
    `/decks?variants=true&show=100&format=${encodeURIComponent(window)}`,
  );
  await mkdir(CACHE, { recursive: true });
  await writeFile(file, html, "utf8");
  return html;
}

const rows = [];
for (const window of windowConfig) {
  const html = await loadWindow(window);
  const aliases = parseIndex(html);
  if (aliases.length === 0) {
    throw new Error(`Limitless has no aliases for ${window}`);
  }
  const windowRows = buildArchetypeRows(aliases, window);
  const missing = missingSpecies(windowRows, knownSpecies);
  if (missing.length > 0) {
    throw new Error(
      `${window} aliases use species with no shipped card: ${missing.join(", ")}. `
        + "Add the species mapping and rebuild the catalog.",
    );
  }
  rows.push(...windowRows);
  process.stdout.write(`${window}: ${windowRows.length} aliases\n`);
}

const body = rows.length === 0
  ? "[]\n"
  : `[\n${rows.map((row) => `  ${JSON.stringify(row)}`).join(",\n")}\n]\n`;
await mkdir(dirname(outFile), { recursive: true });
await writeFile(outFile, body, "utf8");

process.stdout.write(
  `Wrote ${rows.length} archetypes across ${windowConfig.length} windows to ${outFile}.\n`,
);
