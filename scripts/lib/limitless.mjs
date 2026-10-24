/**
 * Pure helpers for the Limitless fixture harvester.
 *
 * The network and filesystem live in `scripts/harvest-limitless.mjs`; everything
 * here takes HTML or plain data so it can be tested without a browser or a
 * second request. The HTML path is documented in
 * `docs/specs/2026-10-23-decklist-identity.md` §11.
 */

const SECTION_NAMES = new Map([
  ["pokemon", "pokemon"],
  ["pokémon", "pokemon"],
  ["trainer", "trainer"],
  ["dresseur", "trainer"],
  ["entrenador", "trainer"],
  ["allenatore", "trainer"],
  ["treinador", "trainer"],
  ["energy", "energy"],
  ["energie", "energy"],
  ["énergie", "energy"],
  ["energía", "energy"],
  ["energia", "energy"],
]);

export const SECTION_LABELS = {
  pokemon: "Pokémon",
  trainer: "Trainer",
  energy: "Energy",
  unknown: "Unknown",
};

export const SECTION_ORDER = ["pokemon", "trainer", "energy", "unknown"];

const NAMED_ENTITIES = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
  Aacute: "Á",
  Acirc: "Â",
  Agrave: "À",
  Auml: "Ä",
  Atilde: "Ã",
  AElig: "Æ",
  Ccedil: "Ç",
  Eacute: "É",
  Ecirc: "Ê",
  Egrave: "È",
  Iacute: "Í",
  Icirc: "Î",
  Igrave: "Ì",
  Ntilde: "Ñ",
  Oacute: "Ó",
  Ocirc: "Ô",
  Ograve: "Ò",
  Oslash: "Ø",
  Otilde: "Õ",
  Ouml: "Ö",
  OElig: "Œ",
  Uacute: "Ú",
  Ucirc: "Û",
  Ugrave: "Ù",
  Uuml: "Ü",
  aacute: "á",
  acirc: "â",
  agrave: "à",
  aelig: "æ",
  atilde: "ã",
  auml: "ä",
  ccedil: "ç",
  eacute: "é",
  ecirc: "ê",
  egrave: "è",
  iacute: "í",
  icirc: "î",
  igrave: "ì",
  ntilde: "ñ",
  oacute: "ó",
  ocirc: "ô",
  oelig: "œ",
  ograve: "ò",
  oslash: "ø",
  otilde: "õ",
  ouml: "ö",
  szlig: "ß",
  uacute: "ú",
  ucirc: "û",
  ugrave: "ù",
  uuml: "ü",
};

/** Decode numeric entities plus the named entities Limitless and the locales use. */
export function decodeEntities(value) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z][a-z0-9]+);/gi, (entity, name) => NAMED_ENTITIES[name] ?? entity);
}

/** Strip tags and collapse runs of whitespace, as a browser would for text. */
export function htmlToText(html) {
  return decodeEntities(html.replace(/<[^>]*>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
}

/** A lowercase, filesystem-safe slug for matching and labels. */
export function slug(value) {
  return htmlToText(String(value))
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

/** Preserve case in fixture names while replacing unsafe characters. */
export function fileName(value) {
  return htmlToText(String(value))
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** The base name of a harvested fixture. */
export function fixtureBaseName(label, listId, lang) {
  const base = `${fileName(label || "list")}-${listId}`;
  return lang === "en" ? base : `${base}.${fileName(lang)}`;
}

/** Map a heading such as `Pokémon (23)` to a section. */
export function sectionFor(label) {
  const key = htmlToText(label)
    .replace(/\s*\(\d+\)\s*$/, "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
  return SECTION_NAMES.get(key) ?? "unknown";
}

/**
 * @typedef {{ setCode: string, number: string, name: string, count: number, section: string, basicEnergy: boolean }} Card
 * @typedef {{ id: string, label: string, deckId: string | null, variantId: string | null, rank: number | null, slugs: string[] }} Alias
 */

/**
 * Parse the deck index table. One row per alias variant.
 * @returns {Alias[]}
 */
export function parseIndex(html) {
  const table = html.match(/<table class="data-table striped">([\s\S]*?)<\/table>/);
  if (!table) throw new Error("Limitless deck index has no data table");

  /** @type {Alias[]} */
  const aliases = [];
  const seen = new Set();

  for (const row of table[1].matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
    const body = row[1];
    const link = body.match(/href="\/decks\/(\d+)(?:\?variant=(\d+))?"/);
    if (!link) continue;

    const labelMatch = body.match(/<td><a href="\/decks\/\d+[^"]*">([\s\S]*?)<\/a><\/td>/);
    const label = htmlToText(labelMatch?.[1] ?? "");
    if (!label) continue;

    const id = link[2] ? `${link[1]}/${link[2]}` : link[1];
    if (seen.has(id)) continue;
    seen.add(id);

    const rank = body.match(/<td>(\d+)<\/td>/);
    const slugs = [...body.matchAll(/<img class="pokemon"[^>]*alt="([^"]+)"/g)].map((match) =>
      decodeEntities(match[1]).trim(),
    );

    aliases.push({
      id,
      label,
      deckId: link[1],
      variantId: link[2] ?? null,
      rank: rank ? Number(rank[1]) : null,
      slugs,
    });
  }

  return aliases;
}

/**
 * Read the selected variant label and the list ids in the Latest results table.
 * If the page has no Latest results section, return no lists rather than
 * scraping unrelated links.
 * @returns {{ label: string, lists: string[] }}
 */
export function parseVariantPage(html, fallbackLabel) {
  const selected = html.match(/<option value="\d+"\s+selected\s*>([^<]+)<\/option>/);
  const label = selected ? htmlToText(selected[1]) : fallbackLabel;

  const heading = html.match(/<h2[^>]*>Latest results<\/h2>/);
  if (!heading || heading.index === undefined) return { label, lists: [] };

  const after = html.slice(heading.index + heading[0].length);
  const end = after.search(/<\/table>/);
  const section = end === -1 ? after : after.slice(0, end);
  const lists = [...section.matchAll(/href="\/decks\/list\/(\d+)"/g)].map((match) => match[1]);

  return { label, lists: [...new Set(lists)] };
}

/**
 * Read headings and cards from a decklist page. Cards keep their section so an
 * unknown heading degrades to `unknown` instead of dropping cards.
 * @returns {{ label: string, cards: Card[], headings: Array<{ section: string, count: number }> }}
 */
export function parseListPage(html) {
  const title = html.match(/<title>([\s\S]*?)<\/title>/);
  const titleText = title ? htmlToText(title[1]) : "";
  const label = titleText.replace(/\s+by\s+.*$/i, "").replace(/\s+–\s+Limitless$/i, "").trim();

  /** @type {Card[]} */
  const cards = [];
  /** @type {Array<{ section: string, count: number }>} */
  const headings = [];
  let section = "unknown";

  const pattern =
    /<div class="decklist-column-heading">([^<]+)<\/div>|<div class="decklist-card"([^>]*)>[\s\S]*?<span class="card-count">(\d+)<\/span>\s*<span class="card-name">([^<]+)<\/span>/g;

  for (const match of html.matchAll(pattern)) {
    if (match[1] !== undefined) {
      const raw = htmlToText(match[1]);
      const declared = raw.match(/\((\d+)\)\s*$/);
      section = sectionFor(raw);
      headings.push({ section, count: declared ? Number(declared[1]) : 0 });
      continue;
    }

    const attrs = match[2] ?? "";
    const setCode = attrs.match(/\bdata-set="([^"]*)"/)?.[1];
    const number = attrs.match(/\bdata-number="([^"]*)"/)?.[1];
    if (setCode === undefined || number === undefined) {
      throw new Error("decklist card is missing data-set or data-number");
    }

    cards.push({
      setCode: decodeEntities(setCode).trim(),
      number: decodeEntities(number).trim(),
      count: Number(match[3]),
      name: htmlToText(match[4]),
      section,
      basicEnergy: /\bdata-basic-energy="\d+"/.test(attrs),
    });
  }

  if (cards.length === 0) throw new Error("decklist page has no cards");
  return { label, cards, headings };
}

/** @param {Array<{ count: number }>} cards */
export function sum(cards) {
  return cards.reduce((total, card) => total + card.count, 0);
}

/** @param {Card[]} cards */
export function toPtcgl(cards) {
  const lines = [];
  for (const section of SECTION_ORDER) {
    const inSection = cards.filter((card) => card.section === section);
    if (inSection.length === 0) continue;
    lines.push(`${SECTION_LABELS[section]}: ${sum(inSection)}`);
    for (const card of inSection) {
      lines.push(`${card.count} ${card.name} ${card.setCode} ${card.number}`);
    }
    lines.push("");
  }
  lines.push(`Total Cards: ${sum(cards)}`);
  return `${lines.join("\n")}\n`;
}

/** @param {Card[]} cards */
export function toPaste(cards) {
  const lines = [];
  for (const section of SECTION_ORDER) {
    for (const card of cards.filter((entry) => entry.section === section)) {
      lines.push(`${card.count} ${card.name} ${card.setCode} ${card.number}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

/** @param {Card[]} cards */
export function hasSplitPrintings(cards) {
  const seen = new Map();
  for (const card of cards) {
    const key = card.name.toLowerCase();
    const refs = seen.get(key) ?? new Set();
    refs.add(`${card.setCode} ${card.number}`);
    seen.set(key, refs);
    if (refs.size > 1) return true;
  }
  return false;
}

/**
 * Refs from a harvested list that the shipped catalog cannot address.
 * @param {Array<{ setCode: string, number: string }>} cards
 * @param {Set<string>} knownRefs
 */
export function missingRefs(cards, knownRefs) {
  return cards
    .map((card) => `${card.setCode}-${card.number}`)
    .filter((ref) => !knownRefs.has(ref));
}

/**
 * Merge a previous manifest with this run's entries so repeated harvests into
 * the same directory accumulate instead of replacing earlier lists.
 * @param {Array<{ name: string }> | undefined} existing
 * @param {Array<{ name: string }>} fresh
 */
export function mergeManifest(existing, fresh) {
  const merged = new Map();
  for (const entry of existing ?? []) merged.set(entry.name, entry);
  for (const entry of fresh) merged.set(entry.name, entry);
  return [...merged.values()].sort((left, right) => left.name.localeCompare(right.name));
}
