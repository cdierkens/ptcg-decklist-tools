#!/usr/bin/env node
/**
 * Harvest decklists from Limitless into fixture-shaped text.
 *
 * Limitless is the source of truth for the format's decklists, but the package
 * cannot call it at runtime (the catalog ships in the package and there are no
 * runtime dependencies). This script is the bridge: run it deliberately, check
 * in the output, and keep the network out of tests.
 *
 * The HTML path is the one documented in
 * `docs/specs/2026-10-23-decklist-identity.md` §11:
 *
 *   /decks?variants=true&show=100          one row per alias variant
 *   /decks/{deckId}?variant={variantId}    variant <select> + latest results
 *   /decks/list/{listId}                   decklist columns and cards
 *
 * Usage:
 *   node scripts/harvest-limitless.mjs --out=.cache/limitless
 *   node scripts/harvest-limitless.mjs --alias=284/3 --samples=3 --out=.cache/limitless
 *   node scripts/harvest-limitless.mjs --list=30537 --lang=de --out=src/__tests__/fixtures/decklists
 *
 * Output is one `.ptcgl.txt` (PTCGL export), one `.paste.txt` (Limitless
 * paste), and one `.json` per list. `--lang=de` localises card names; Limitless
 * keeps the column headings in English, which is exactly what the localized
 * fixture is meant to catch.
 *
 * This script is not part of the published package. It uses only Node built-ins.
 */

import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import {
  fixtureBaseName,
  hasSplitPrintings,
  mergeManifest,
  missingRefs as missingCatalogRefs,
  parseIndex,
  parseListPage,
  parseVariantPage,
  sum,
  toPaste,
  toPtcgl,
} from "./lib/limitless.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const BASE = "https://limitlesstcg.com";

const options = {
  alias: { type: "string", multiple: true },
  list: { type: "string", multiple: true },
  samples: { type: "string", default: "1" },
  aliases: { type: "string", default: "3" },
  out: { type: "string", default: ".cache/limitless" },
  lang: { type: "string", default: "en" },
  format: { type: "string", default: "TEF-30C" },
  delay: { type: "string", default: "750" },
  validate: { type: "boolean", default: true },
  "no-validate": { type: "boolean", default: false },
  help: { type: "boolean", default: false },
};

const { values: args } = parseArgs({ options, allowPositionals: false });

if (args.help) {
  process.stdout.write(
    [
      "Harvest Limitless decklists into fixture text.",
      "",
      "  --out=DIR        output directory (default .cache/limitless)",
      "  --alias=ID       deck id, optionally with /variant (repeatable)",
      "  --list=ID        list id (repeatable; skips the deck index)",
      "  --aliases=N      top aliases to sample when --alias is absent (default 3)",
      "  --samples=N      lists to take per alias (default 1)",
      "  --lang=CODE      Limitless card-name language (default en)",
      "  --format=LABEL   format filter for the deck index (default TEF-30C)",
      "  --delay=MS       delay between requests (default 750)",
      "  --no-validate    do not check refs against src/data/cards.json",
      "",
    ].join("\n"),
  );
  process.exit(0);
}

const delayMs = Number(args.delay);
const samples = Number(args.samples);
const aliasLimit = Number(args.aliases);
const lang = args.lang;
const aliasArgs = args.alias ?? [];
const listArgs = args.list ?? [];
const validate = args.validate && !args["no-validate"];

if (!Number.isFinite(delayMs) || delayMs < 0) {
  throw new Error(`--delay must be a non-negative number, got ${args.delay}`);
}
if (!Number.isSafeInteger(samples) || samples < 1) {
  throw new Error(`--samples must be a positive integer, got ${args.samples}`);
}
if (!Number.isSafeInteger(aliasLimit) || aliasLimit < 1) {
  throw new Error(`--aliases must be a positive integer, got ${args.aliases}`);
}

const outDir = resolve(ROOT, args.out);
await mkdir(outDir, { recursive: true });

/** @param {string} path */
async function get(path, attempts = 3) {
  const url = new URL(path, BASE);
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          accept: "text/html,application/xhtml+xml",
          "user-agent": "@dierkens.dev/ptcg-decklist-tools fixture harvester",
        },
      });
      if (!response.ok) {
        throw new Error(`${url} returned HTTP ${response.status}`);
      }
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

/** @param {number} ms */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** @type {Map<string, string> | null} */
let catalog = null;

async function loadCatalog() {
  if (!validate || catalog) return catalog;
  const raw = await readFile(join(ROOT, "src/data/cards.json"), "utf8");
  catalog = new Map(JSON.parse(raw).map((card) => [card.ref, card.name]));
  return catalog;
}

/** @param {Array<{ setCode: string, number: string }>} cards */
async function missingRefs(cards) {
  const known = await loadCatalog();
  if (!known) return [];
  return missingCatalogRefs(cards, known);
}

/** @param {string} name @param {string} content */
async function write(name, content) {
  await writeFile(join(outDir, name), content, "utf8");
}

async function readManifest() {
  try {
    const raw = await readFile(join(outDir, "manifest.json"), "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

/**
 * @param {{ id: string | null, label: string, listId: string, lang: string }} item
 */
async function harvestList(item) {
  const query = item.lang === "en" ? "" : `?lang=${encodeURIComponent(item.lang)}`;
  const html = await get(`/decks/list/${item.listId}${query}`);
  const { label, cards, headings } = parseListPage(html);

  const base = fixtureBaseName(item.label || label || "list", item.listId, item.lang);

  const ptcgl = toPtcgl(cards);
  const paste = toPaste(cards);
  const missing = await missingRefs(cards);

  await write(`${base}.ptcgl.txt`, ptcgl);
  await write(`${base}.paste.txt`, paste);

  const meta = {
    source: `https://limitlesstcg.com/decks/list/${item.listId}${query}`,
    aliasId: item.id,
    label: item.label || label,
    pageLabel: label,
    listId: item.listId,
    lang: item.lang,
    sections: headings,
    total: sum(cards),
    cards,
    missingCatalogRefs: missing,
  };
  await write(`${base}.json`, `${JSON.stringify(meta, null, 2)}\n`);

  if (missing.length > 0) {
    process.stderr.write(
      `${base}: ${missing.length} ref(s) absent from the catalog: ${missing.join(", ")}\n`,
    );
  }

  return {
    name: base,
    source: meta.source,
    aliasId: item.id,
    label: meta.label,
    listId: item.listId,
    lang: item.lang,
    total: meta.total,
    missingCatalogRefs: missing,
    splitPrintings: hasSplitPrintings(cards),
    promo: cards.some((card) => /^(SVP|MEP|BWP|XYP|SMP)$/.test(card.setCode)),
    basicEnergy: cards.some((card) => card.basicEnergy),
  };
}

const harvested = [];

if (listArgs.length > 0) {
  for (const listId of listArgs) {
    harvested.push(await harvestList({ id: null, label: "", listId, lang }));
  }
} else {
  const indexHtml = await get(
    `/decks?variants=true&show=100&format=${encodeURIComponent(args.format)}`,
  );
  const aliases = parseIndex(indexHtml);

  const wanted =
    aliasArgs.length > 0
      ? aliases.filter((alias) => aliasArgs.includes(alias.id) || aliasArgs.includes(alias.deckId))
      : aliases.slice(0, aliasLimit);

  if (wanted.length === 0) {
    throw new Error(
      `no aliases matched ${aliasArgs.join(", ") || `the top ${aliasLimit}`}; available: ${aliases
        .map((alias) => alias.id)
        .join(", ")}`,
    );
  }

  for (const alias of wanted) {
    const html = await get(
      `/decks/${alias.deckId}${alias.variantId ? `?variant=${alias.variantId}` : ""}`,
    );
    const variant = parseVariantPage(html, alias.label);
    const lists = variant.lists.slice(0, samples);
    if (lists.length === 0) {
      process.stderr.write(`${alias.id} (${alias.label}) has no latest lists\n`);
      continue;
    }
    for (const listId of lists) {
      harvested.push(
        await harvestList({
          id: alias.id,
          label: variant.label === alias.label ? alias.label : `${alias.label} ${variant.label}`,
          listId,
          lang,
        }),
      );
    }
  }
}

const manifest = mergeManifest(await readManifest(), harvested);
await write("manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);

if (harvested.some((entry) => entry.missingCatalogRefs.length > 0)) {
  process.stderr.write(
    "Some refs are not addressable in src/data/cards.json; fix the catalog or the fixture.\n",
  );
  process.exitCode = 1;
}

process.stdout.write(`Wrote ${harvested.length} list(s) to ${outDir}\n`);
for (const entry of harvested) {
  const flags = [
    entry.splitPrintings ? "split" : null,
    entry.promo ? "promo" : null,
    entry.basicEnergy ? "energy" : null,
    entry.lang !== "en" ? entry.lang : null,
  ].filter(Boolean);
  process.stdout.write(
    `  ${entry.name} — ${entry.total} cards${flags.length > 0 ? ` [${flags.join(",")}]` : ""}\n`,
  );
}
