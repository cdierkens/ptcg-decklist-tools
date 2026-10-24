/**
 * Pure catalog derivation.
 *
 * The build script owns the network, the TypeScript dump loader, and the
 * filesystem. Everything in this module takes plain data and returns plain
 * data, so catalog rules can be tested without a checkout or a download.
 */

import { createHash } from "node:crypto";

export const categoryMap = {
  Energy: "energy",
  Pokemon: "pokemon",
  Trainer: "trainer",
};

export const stageMap = {
  Basic: "basic",
  Stage1: "stage1",
  Stage2: "stage2",
};

export function text(value) {
  if (typeof value !== "string") return null;
  const folded = value
    .normalize("NFC")
    .replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"')
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return folded === "" ? null : folded;
}

export function english(value) {
  if (value == null) return null;
  if (typeof value === "string") return text(value);
  if (Array.isArray(value)) return null;
  if (typeof value === "object") return text(value.en ?? Object.values(value)[0]);
  return null;
}

export function localeKey(value) {
  return (english(value) ?? "").toLowerCase();
}

export function releaseDate(value) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") return english(value);
  return null;
}

export function localIdOf(file) {
  return file.endsWith(".ts") ? file.slice(0, -3) : file;
}

/** Live prints numeric local ids without leading zeroes; promos keep their suffix. */
export function liveNumber(localId) {
  return /^\d+$/.test(localId) ? localId.replace(/^0+(?=\d)/, "") : localId;
}

export function compareCards(a, b) {
  if (a.setOrder !== b.setOrder) return a.setOrder - b.setOrder;
  const an = /^\d+$/.test(a.localId);
  const bn = /^\d+$/.test(b.localId);
  if (an && bn) return Number(a.localId) - Number(b.localId) || a.localId.localeCompare(b.localId);
  if (an !== bn) return an ? -1 : 1;
  return a.localId.localeCompare(b.localId);
}

/**
 * The parent-prefix rule for colliding live codes. Exactly one set in a
 * collision group must be a prefix of every other id; that set is addressable.
 */
export function addressableSetIds(setInputs) {
  const liveCodes = new Map();
  for (const input of setInputs) {
    const group = liveCodes.get(input.liveCode) ?? [];
    group.push(input);
    liveCodes.set(input.liveCode, group);
  }

  const addressable = new Set();
  for (const [liveCode, group] of liveCodes) {
    if (group.length === 1) {
      addressable.add(group[0].tcgdexId);
      continue;
    }

    const parents = group.filter(
      (candidate) =>
        candidate.tcgdexId !== ""
        && group.every(
          (other) =>
            other === candidate
            || (other.tcgdexId !== candidate.tcgdexId
              && other.tcgdexId.startsWith(candidate.tcgdexId)),
        ),
    );
    if (parents.length !== 1) {
      throw new Error(
        `Live code ${liveCode} has no unique parent set: `
          + group.map((entry) => entry.tcgdexId).sort().join(", "),
      );
    }
    addressable.add(parents[0].tcgdexId);
  }

  return addressable;
}

/** Turn loaded set inputs into the shipped set index, oldest first. */
export function buildSets(setInputs) {
  const addressable = addressableSetIds(setInputs);
  return setInputs
    .map((input) => ({
      era: input.era,
      liveAddressable: addressable.has(input.tcgdexId),
      liveCode: input.liveCode,
      name: input.name,
      order: 0,
      paddingWidth:
        input.cardFiles.length > 0 && /^\d+$/.test(localIdOf(input.cardFiles[0]))
          ? localIdOf(input.cardFiles[0]).length
          : 3,
      releaseDate: input.releaseDate,
      tcgdexId: input.tcgdexId,
    }))
    .sort(
      (a, b) =>
        (a.releaseDate ?? "9999-99-99").localeCompare(b.releaseDate ?? "9999-99-99")
        || a.tcgdexId.localeCompare(b.tcgdexId),
    )
    .map((set, order) => ({ ...set, order }));
}

/** A map from live code to its addressable set. Lowest order wins. */
export function addressableSets(sets) {
  const index = new Map();
  for (const set of sets) {
    if (!set.liveAddressable) continue;
    const current = index.get(set.liveCode);
    if (current === undefined || set.order < current.order) index.set(set.liveCode, set);
  }
  return index;
}

/**
 * Build the evolution-line resolver from every loaded card. Dex ids are unioned
 * across forms and evolve-from names, so a line id is stable within a catalog.
 */
export function buildEvolutionLines(cards) {
  const dexParent = new Map();

  function find(value) {
    let current = value;
    while (dexParent.get(current) !== current) current = dexParent.get(current);
    while (dexParent.get(value) !== current) {
      const next = dexParent.get(value);
      dexParent.set(value, current);
      value = next;
    }
    return current;
  }

  function union(left, right) {
    const a = find(left);
    const b = find(right);
    if (a !== b) dexParent.set(Math.max(a, b), Math.min(a, b));
  }

  const nameToDex = new Map();
  for (const card of cards) {
    if (card.category !== "Pokemon") continue;
    const dexIds = Array.isArray(card.source.dexId) ? card.source.dexId : [];
    for (const dexId of dexIds) {
      if (!dexParent.has(dexId)) dexParent.set(dexId, dexId);
      const key = localeKey(card.name);
      if (key === "") continue;
      const known = nameToDex.get(key) ?? new Set();
      known.add(dexId);
      nameToDex.set(key, known);
    }
  }

  for (const card of cards) {
    if (card.category !== "Pokemon") continue;
    const dexIds = Array.isArray(card.source.dexId) ? card.source.dexId : [];
    for (let index = 1; index < dexIds.length; index += 1) {
      union(dexIds[0], dexIds[index]);
    }

    const from = localeKey(card.source.evolveFrom);
    if (from !== "") {
      const parentDexIds = nameToDex.get(from) ?? new Set();
      for (const childDex of dexIds) {
        for (const parentDex of parentDexIds) union(childDex, parentDex);
      }
    }
  }

  return (card) => {
    if (card.category !== "Pokemon") return null;
    const dexIds = Array.isArray(card.source.dexId) ? card.source.dexId : [];
    if (dexIds.length === 0) return null;
    return `dex:${Math.min(...dexIds.map(find))}`;
  };
}

/** Validate and normalise the checked-in species override table. */
export function speciesEntries(speciesMap) {
  if (!Array.isArray(speciesMap)) throw new Error("species map must be a JSON array");
  return speciesMap.map((entry, index) => {
    if (
      !entry
      || typeof entry.slug !== "string"
      || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.slug)
      || typeof entry.name !== "string"
    ) {
      throw new Error(`species[${index}] must be { slug, name, nameIncludes? }`);
    }
    return {
      name: entry.name,
      nameIncludes: typeof entry.nameIncludes === "string" ? entry.nameIncludes : null,
      slug: entry.slug,
    };
  });
}

/** Resolve a Pokémon card to its curated Limitless sprite slug. */
export function buildSpeciesResolver(entries) {
  return (card) => {
    if (card.category !== "Pokemon" || !card.name) return null;
    const name = card.name;
    const matches = entries.filter((entry) => {
      const starts = name === entry.name || name.startsWith(`${entry.name} `);
      if (!starts) return false;
      return entry.nameIncludes === null || name.toLowerCase().includes(entry.nameIncludes.toLowerCase());
    });
    if (matches.length === 0) return null;
    matches.sort((a, b) => (b.nameIncludes?.length ?? 0) - (a.nameIncludes?.length ?? 0));
    return matches[0].slug;
  };
}

function localizedText(value) {
  return english(value);
}

function canonicalAttacks(source) {
  return (Array.isArray(source.attacks) ? source.attacks : [])
    .map((attack) => ({
      cost: Array.isArray(attack.cost) ? [...attack.cost].sort() : [],
      damage: attack.damage ?? null,
      effect: localizedText(attack.effect),
      name: localizedText(attack.name),
    }))
    .sort(
      (a, b) =>
        (a.name ?? "").localeCompare(b.name ?? "")
        || JSON.stringify(a).localeCompare(JSON.stringify(b)),
    );
}

function canonicalAbilities(source) {
  return (Array.isArray(source.abilities) ? source.abilities : [])
    .map((ability) => ({
      effect: localizedText(ability.effect),
      name: localizedText(ability.name),
      type: ability.type ?? null,
    }))
    .sort(
      (a, b) =>
        (a.name ?? "").localeCompare(b.name ?? "")
        || (a.type ?? "").localeCompare(b.type ?? ""),
    );
}

function canonicalPairs(source) {
  return (Array.isArray(source.weaknesses) ? source.weaknesses : []).map((entry) => ({
    type: entry.type ?? null,
    value: entry.value ?? null,
  }));
}

function canonicalResistances(source) {
  return (Array.isArray(source.resistances) ? source.resistances : []).map((entry) => ({
    type: entry.type ?? null,
    value: entry.value ?? null,
  }));
}

/** The exact card facts that decide what a card does. */
export function canonicalCard(source) {
  return {
    abilities: canonicalAbilities(source),
    attacks: canonicalAttacks(source),
    category: source.category ?? null,
    effect: localizedText(source.effect),
    energyType: source.energyType ?? null,
    hp: source.hp ?? null,
    item: source.item
      ? {
          effect: localizedText(source.item.effect),
          name: localizedText(source.item.name),
        }
      : null,
    name: localizedText(source.name),
    resistances: canonicalResistances(source),
    retreat: source.retreat ?? null,
    stage: source.stage ?? null,
    suffix: source.suffix ?? null,
    trainerType: source.trainerType ?? null,
    types: Array.isArray(source.types) ? [...source.types].sort() : [],
    weaknesses: canonicalPairs(source),
  };
}

/** The full hash plus the frozen 16-hex fingerprint. */
export function fingerprintOf(source) {
  const canonical = JSON.stringify(canonicalCard(source));
  const full = createHash("sha256").update(canonical).digest("hex");
  return { full, short: full.slice(0, 16) };
}
