#!/usr/bin/env node
/**
 * Build the shipped catalog from a pinned public TCGdex dump.
 *
 * The dump is `tcgdex/cards-database` (MIT). It is data-as-TypeScript, so this
 * script transpiles it with the repo's existing TypeScript dependency and
 * evaluates it in a tiny CommonJS loader. Nothing here runs at package
 * install or at runtime; the JSON it writes is checked in and shipped.
 *
 * Usage:
 *   node scripts/build-catalog.mjs
 *   node scripts/build-catalog.mjs --accept       # accept fingerprint drift
 *   node scripts/build-catalog.mjs --refresh      # re-download the dump
 *   node scripts/build-catalog.mjs --source=DIR   # use an extracted dump
 *   node scripts/build-catalog.mjs --version=YYYY-MM-DD
 */

import {
  buildEvolutionLines,
  buildSets,
  buildSpeciesResolver,
  categoryMap,
  compareCards,
  english,
  fingerprintOf,
  liveNumber,
  localIdOf,
  releaseDate,
  speciesEntries,
  stageMap,
} from "./lib/catalog.mjs";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_COMMIT = "cbddf7e54033b1b58e44af1049c88832e55b94d0";
const SOURCE_URL = `https://codeload.github.com/tcgdex/cards-database/tar.gz/${SOURCE_COMMIT}`;
const CACHE = join(ROOT, ".cache", "tcgdex", SOURCE_COMMIT);
const DATA_DIR = join(ROOT, "src", "data");
const FINGERPRINTS = join(ROOT, "scripts", "catalog", "fingerprints.json");
const SPECIES = join(ROOT, "scripts", "catalog", "species.json");

const args = process.argv.slice(2);
const acceptDrift = args.includes("--accept");
const refresh = args.includes("--refresh");
const versionArg = args.find((arg) => arg.startsWith("--version="));
const sourceArg = args.find((arg) => arg.startsWith("--source="));
const catalogVersion = versionArg
  ? versionArg.slice("--version=".length)
  : new Date().toISOString().slice(0, 10);

if (!/^\d{4}-\d{2}-\d{2}$/.test(catalogVersion)) {
  fail(`catalog version must be YYYY-MM-DD, got ${JSON.stringify(catalogVersion)}`);
}

/* -------------------------------------------------------------------------- */
/* Source dump                                                                */
/* -------------------------------------------------------------------------- */

function fetchSource() {
  if (sourceArg) {
    const source = resolve(sourceArg.slice("--source=".length));
    if (!existsSync(join(source, "data"))) {
      fail(`--source does not look like a cards-database checkout: ${source}`);
    }
    return source;
  }

  const extracted = join(CACHE, `cards-database-${SOURCE_COMMIT}`);
  const archive = join(CACHE, "source.tar.gz");
  if (refresh || !existsSync(extracted)) {
    mkdirSync(CACHE, { recursive: true });
    if (refresh || !existsSync(archive)) {
      console.log(`Downloading TCGdex ${SOURCE_COMMIT.slice(0, 7)}…`);
      execFileSync("curl", ["-sSL", "-o", archive, SOURCE_URL], { stdio: "inherit" });
    }
    console.log("Extracting TCGdex dump…");
    execFileSync("tar", ["-xzf", archive, "-C", CACHE], { stdio: "inherit" });
  }
  return extracted;
}

/* -------------------------------------------------------------------------- */
/* Tiny TypeScript loader (the dump is data-as-TypeScript)                     */
/* -------------------------------------------------------------------------- */

const moduleCache = new Map();

function resolveTs(base) {
  for (const candidate of [base, `${base}.ts`, join(base, "index.ts")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  throw new Error(`cannot resolve ${base}`);
}

function loadTs(file) {
  const resolved = resolveTs(resolve(file));
  if (moduleCache.has(resolved)) return moduleCache.get(resolved).exports;

  const source = readFileSync(resolved, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  const module = { exports: {} };
  moduleCache.set(resolved, module);
  const nodeRequire = createRequire(resolved);
  const localRequire = (specifier) =>
    specifier.startsWith(".")
      ? loadTs(resolve(dirname(resolved), specifier))
      : nodeRequire(specifier);

  new Function("exports", "require", "module", "__filename", "__dirname", output)(
    module.exports,
    localRequire,
    module,
    resolved,
    dirname(resolved),
  );
  return module.exports;
}

/* -------------------------------------------------------------------------- */
/* Utilities                                                                  */
/* -------------------------------------------------------------------------- */

function fail(message) {
  console.error(`\nCatalog build failed: ${message}\n`);
  process.exit(1);
}

/* -------------------------------------------------------------------------- */
/* Load sets and cards                                                        */
/* -------------------------------------------------------------------------- */

const sourceRoot = fetchSource();
const dataRoot = join(sourceRoot, "data");
const setInputs = [];

for (const eraFile of readdirSync(dataRoot).filter((file) => file.endsWith(".ts"))) {
  const eraDir = join(dataRoot, localIdOf(eraFile));
  if (!existsSync(eraDir) || !statSync(eraDir).isDirectory()) continue;

  for (const setFile of readdirSync(eraDir).filter((file) => file.endsWith(".ts"))) {
    const set = loadTs(join(eraDir, setFile)).default;
    const liveCode = set?.abbreviations?.official;
    if (typeof liveCode !== "string" || liveCode === "") continue;

    const setDir = join(eraDir, localIdOf(setFile));
    const cardFiles = existsSync(setDir) && statSync(setDir).isDirectory()
      ? readdirSync(setDir).filter((file) => file.endsWith(".ts")).sort()
      : [];

    setInputs.push({
      cardFiles,
      era: set.serie?.id ?? localIdOf(eraFile),
      liveCode,
      name: english(set.name) ?? set.id,
      releaseDate: releaseDate(set.releaseDate),
      set,
      setDir,
      tcgdexId: set.id,
    });
  }
}

if (setInputs.length === 0) fail("no sets with a Live code were found");

let sets;
try {
  sets = buildSets(setInputs);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

const setByTcgdexId = new Map(sets.map((set) => [set.tcgdexId, set]));
if (setByTcgdexId.size !== sets.length) fail("duplicate set tcgdex id");

const cards = [];
for (const input of setInputs) {
  for (const file of input.cardFiles) {
    const source = loadTs(join(input.setDir, file)).default;
    if (!source) fail(`empty card module: ${input.tcgdexId}/${file}`);
    const localId = localIdOf(file);
    cards.push({
      category: source.category,
      localId,
      name: english(source.name),
      set: setByTcgdexId.get(input.tcgdexId),
      source,
      tcgdexId: `${input.tcgdexId}-${localId}`,
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Evolution lines                                                            */
/* -------------------------------------------------------------------------- */

const lineOf = buildEvolutionLines(cards);

/* -------------------------------------------------------------------------- */
/* Species mapping                                                            */
/* -------------------------------------------------------------------------- */

const speciesMap = JSON.parse(readFileSync(SPECIES, "utf8"));
let resolvedSpecies;
try {
  resolvedSpecies = speciesEntries(speciesMap);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
const speciesOf = buildSpeciesResolver(resolvedSpecies);
const speciesMatched = new Map(resolvedSpecies.map((entry) => [entry.slug, 0]));

/* -------------------------------------------------------------------------- */
/* Functional fingerprints                                                    */
/* -------------------------------------------------------------------------- */

const previousFingerprints = existsSync(FINGERPRINTS)
  ? JSON.parse(readFileSync(FINGERPRINTS, "utf8"))
  : {};
if (
  previousFingerprints === null
  || typeof previousFingerprints !== "object"
  || Array.isArray(previousFingerprints)
) {
  fail(`${FINGERPRINTS} must be a JSON object`);
}
for (const [tcgdexId, fingerprint] of Object.entries(previousFingerprints)) {
  if (typeof fingerprint !== "string" || !/^[0-9a-f]{16}$/.test(fingerprint)) {
    fail(`${FINGERPRINTS} has an invalid fingerprint for ${tcgdexId}`);
  }
}

const fingerprintByTcgdexId = new Map();
const collisions = new Map();
const drift = [];
const added = [];

for (const card of cards) {
  const fresh = fingerprintOf(card.source);
  const frozen = previousFingerprints[card.tcgdexId];
  const chosen = frozen === undefined || acceptDrift ? fresh.short : frozen;

  if (frozen !== undefined && frozen !== fresh.short) {
    drift.push({ from: frozen, tcgdexId: card.tcgdexId, to: fresh.short });
  }
  if (frozen === undefined) added.push(card.tcgdexId);

  fingerprintByTcgdexId.set(card.tcgdexId, chosen);

  const collision = collisions.get(chosen);
  if (collision === undefined) {
    collisions.set(chosen, { full: fresh.full, tcgdexId: card.tcgdexId });
  } else if (collision.full !== fresh.full) {
    fail(
      `fingerprint collision ${chosen}: ${collision.tcgdexId} and ${card.tcgdexId}. `
        + "This must be fixed before publishing.",
    );
  }
}

if (drift.length > 0 && !acceptDrift) {
  console.error("\nFrozen fingerprints would change:\n");
  for (const entry of drift) {
    console.error(`  ${entry.tcgdexId}  ${entry.from} -> ${entry.to}`);
  }
  console.error(
    "\nA shipped fingerprint is frozen. Accepting a change requires a deliberate "
      + "hashVersion bump, then re-run with --accept.\n",
  );
  process.exit(1);
}

if (drift.length > 0) {
  console.log(`Accepted ${drift.length} fingerprint change(s). Bump hashVersion.`);
}

/* -------------------------------------------------------------------------- */
/* Project the shipped catalog                                                */
/* -------------------------------------------------------------------------- */

const addressableCards = cards
  .filter((card) => card.set?.liveAddressable === true)
  .sort(compareCards);

const refs = new Map();
const outputCards = [];
for (const card of addressableCards) {
  if (!card.set) fail(`card ${card.tcgdexId} has no set`);
  if (!card.name) fail(`card ${card.tcgdexId} has no English name`);
  const category = categoryMap[card.category];
  if (!category) fail(`card ${card.tcgdexId} has unknown category ${card.category}`);
  if (!card.set.liveAddressable) fail(`card ${card.tcgdexId} is in a non-addressable set`);

  const ref = `${card.set.liveCode}-${liveNumber(card.localId)}`;
  if (refs.has(ref)) {
    fail(`duplicate ref ${ref}: ${refs.get(ref)} and ${card.tcgdexId}`);
  }
  refs.set(ref, card.tcgdexId);

  const species = speciesOf(card);
  if (species !== null) speciesMatched.set(species, (speciesMatched.get(species) ?? 0) + 1);

  outputCards.push({
    category,
    function: fingerprintByTcgdexId.get(card.tcgdexId),
    line: lineOf(card),
    name: card.name,
    ref,
    regulationMark: card.source.regulationMark ?? null,
    species,
    stage: stageMap[card.source.stage] ?? null,
    tcgdexId: card.tcgdexId,
  });
}

const unmatchedSpecies = [...speciesMatched.entries()]
  .filter(([, count]) => count === 0)
  .map(([slug]) => slug);
if (unmatchedSpecies.length > 0) {
  fail(
    `species mapping has no card for: ${unmatchedSpecies.join(", ")}. `
      + "A wrong mapping fails alias matching silently, so it fails the build.",
  );
}

for (const card of outputCards) {
  if (!/^[0-9a-f]{16}$/.test(card.function)) {
    fail(`card ${card.tcgdexId} has an invalid fingerprint ${card.function}`);
  }
  if (card.ref.includes(" ")) fail(`card ${card.tcgdexId} has a ref with a space: ${card.ref}`);
}

if (new Set(cards.map((card) => card.tcgdexId)).size !== cards.length) {
  fail("duplicate card tcgdex id");
}

const nextFingerprints = { ...previousFingerprints };
for (const card of cards) {
  nextFingerprints[card.tcgdexId] = fingerprintByTcgdexId.get(card.tcgdexId);
}
const sortedFingerprints = Object.fromEntries(
  Object.keys(nextFingerprints).sort().map((key) => [key, nextFingerprints[key]]),
);
const fingerprintsJson = `{\n${Object.entries(sortedFingerprints)
  .map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)}`)
  .join(",\n")}\n}\n`;
if (
  !existsSync(FINGERPRINTS)
  || readFileSync(FINGERPRINTS, "utf8") !== fingerprintsJson
) {
  writeFileSync(FINGERPRINTS, fingerprintsJson);
}

/* -------------------------------------------------------------------------- */
/* Write                                                                      */
/* -------------------------------------------------------------------------- */

mkdirSync(DATA_DIR, { recursive: true });
writeFileSync(join(DATA_DIR, "sets.json"), `${JSON.stringify(sets, null, 2)}\n`);
writeFileSync(
  join(DATA_DIR, "cards.json"),
  `[\n${outputCards.map((card) => JSON.stringify(card)).join(",\n")}\n]\n`,
);
if (!existsSync(join(DATA_DIR, "archetypes.json"))) {
  writeFileSync(join(DATA_DIR, "archetypes.json"), "[]\n");
}
writeFileSync(join(DATA_DIR, "version.json"), `${JSON.stringify({ version: catalogVersion }, null, 2)}\n`);

console.log(
  `\nCatalog ${catalogVersion}: ${sets.length} sets, ${outputCards.length} cards, `
    + `${outputCards.filter((card) => card.species !== null).length} with a species.`,
);
console.log(
  `Fingerprints: ${outputCards.length - added.length} frozen, ${added.length} new, `
    + `${drift.length} accepted change(s).`,
);
console.log(`Non-addressable sets: ${sets.filter((set) => !set.liveAddressable).map((set) => set.tcgdexId).join(", ") || "none"}.`);
