/**
 * Parse a decklist from any of the three sources: a PTCGL export, a Limitless
 * paste, or a hand-typed list.
 *
 * Parsing is total and throw-free. Fatal errors are returned in the `Result`;
 * everything recoverable is a `DecklistWarning` so the caller can show the
 * entries and explain the odd line.
 *
 * The design is in `docs/specs/2026-10-23-decklist-identity.md` §2.
 */

import { DecklistError } from "./errors.js";
import { err, ok, type Result } from "./result.js";
import type {
  CardRef,
  DeckSection,
  DecklistWarning,
  ParsedDecklist,
  ParsedEntry,
} from "./types.js";

/** `4 Charizard ex OBF 125`; the count must be the first token. */
const CARD_LINE = /^(\d+)\s+(.+)$/u;

/** `Pokémon: 18`, `Total Cards: 60`, `Karten gesamt: 60`. */
const HEADER_LINE = /^(.+):\s*(\d+)$/u;

/**
 * A ref at the end of a card line. Set codes are uppercase (`SVI`, `30C`,
 * `SHF:SV`); requiring that avoids reading `4 Mew 151` as set `Mew`, number
 * `151`. Numbers may be promos (`TG01`, `SWSH014`, `SV001`) but must contain a
 * digit.
 */
const REF_SUFFIX = /\s+([A-Z0-9][A-Z0-9:]+)\s+([A-Z0-9]*\d[A-Z0-9]*)$/u;

const SECTION_HEADERS = new Map<string, DeckSection>([
  ["pokemon", "pokemon"],
  ["pokemons", "pokemon"],
  ["trainer", "trainer"],
  ["trainers", "trainer"],
  ["dresseur", "trainer"],
  ["entrenador", "trainer"],
  ["allenatore", "trainer"],
  ["treinador", "trainer"],
  ["energy", "energy"],
  ["energies", "energy"],
  ["energie", "energy"],
  ["energia", "energy"],
]);

const TOTAL_HEADERS = new Set([
  "total",
  "total cards",
  "total card",
  "gesamt",
  "karten gesamt",
  "cartes au total",
  "total de cartes",
  "cartas totales",
  "total de cartas",
  "carte totali",
  "totale carte",
  "cartas no total",
]);

/**
 * Fold a header for lookup: strip accents, casefold, collapse whitespace.
 * `Pokémon`, `Pokemon`, and `POKÉMON` are the same header.
 */
function headerKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Fold a display name: NFC, straight quotes, collapsed whitespace, trim. */
function foldName(value: string): string {
  return value
    .normalize("NFC")
    .replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function warning(
  code: DecklistWarning["code"],
  message: string,
  line: number | null,
): DecklistWarning {
  return { code, line, message };
}

/**
 * Parse one card line. Returns `null` when the line cannot be read as a card;
 * the caller turns that into an `unrecognised-line` diagnostic.
 */
function parseCard(
  line: string,
  lineNumber: number,
  section: DeckSection,
  warnings: DecklistWarning[],
): ParsedEntry | null {
  const match = CARD_LINE.exec(line);
  if (!match) return null;

  const countText = match[1];
  const rest = match[2]?.trim() ?? "";
  if (countText === undefined || rest === "") return null;

  const count = Number(countText);
  if (!Number.isSafeInteger(count) || count < 0) {
    warnings.push(warning("invalid-count", `Invalid card count "${countText}".`, lineNumber));
    return null;
  }
  if (count === 0 || count > 60) {
    warnings.push(
      warning(
        "invalid-count",
        `Card count ${count} is outside the expected 1–60 range; keeping it.`,
        lineNumber,
      ),
    );
  }

  let name = rest;
  let ref: CardRef | null = null;
  const suffix = REF_SUFFIX.exec(rest);
  if (suffix !== null) {
    const setCode = suffix[1];
    const number = suffix[2];
    if (setCode !== undefined && number !== undefined && /[A-Z]/u.test(setCode)) {
      const candidate = rest.slice(0, suffix.index).trim();
      if (candidate === "") {
        warnings.push(warning("unrecognised-line", `Card line has a ref but no name: "${line}".`, lineNumber));
        return null;
      }
      name = candidate;
      ref = { number, setCode };
    }
  }

  const folded = foldName(name);
  if (folded === "") {
    warnings.push(warning("unrecognised-line", `Card line has no name: "${line}".`, lineNumber));
    return null;
  }

  return { count, line: lineNumber, name: folded, ref, section };
}

/** Parse a decklist. Never throws. */
export function parseDecklist(text: string): Result<ParsedDecklist, DecklistError[]> {
  if (typeof text !== "string") {
    return err([new DecklistError("empty-input", "Decklist input must be a string.")]);
  }

  const withoutBom = text.replace(/^\uFEFF/u, "");
  if (withoutBom.trim() === "") {
    return err([new DecklistError("empty-input", "Decklist is empty.")]);
  }

  const lines = withoutBom.split(/\r\n|\n|\r/u);
  const entries: ParsedEntry[] = [];
  const warnings: DecklistWarning[] = [];
  const sectionDeclarations: { count: number; line: number; section: DeckSection }[] = [];
  const totalDeclarations: { count: number; line: number }[] = [];

  let section: DeckSection = "unknown";
  let total: number | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const raw = lines[index] ?? "";
    const line = raw.trim();
    if (line === "") continue;

    // A card line begins with a count. Check that first so a card name with a
    // colon (`4 Professor's Research: ...`) is not mistaken for a header.
    if (CARD_LINE.test(line)) {
      const warningsBefore = warnings.length;
      const entry = parseCard(line, lineNumber, section, warnings);
      if (entry === null) {
        if (warnings.length === warningsBefore) {
          warnings.push(warning("unrecognised-line", `Unrecognised line: "${line}".`, lineNumber));
        }
      } else {
        entries.push(entry);
      }
      continue;
    }

    const header = HEADER_LINE.exec(line);
    if (header === null) {
      warnings.push(warning("unrecognised-line", `Unrecognised line: "${line}".`, lineNumber));
      continue;
    }

    const label = header[1]?.trim() ?? "";
    const countText = header[2];
    if (label === "" || countText === undefined) {
      warnings.push(warning("unrecognised-line", `Unrecognised line: "${line}".`, lineNumber));
      continue;
    }

    const count = Number(countText);
    if (!Number.isSafeInteger(count) || count < 0) {
      warnings.push(warning("invalid-count", `Invalid header count "${countText}".`, lineNumber));
      continue;
    }

    const key = headerKey(label);
    if (TOTAL_HEADERS.has(key)) {
      totalDeclarations.push({ count, line: lineNumber });
      total = count;
      continue;
    }

    const mapped = SECTION_HEADERS.get(key);
    if (mapped === undefined) {
      warnings.push(
        warning(
          "unrecognised-line",
          `Unrecognised section header "${label}: ${count}"; entries below it have no section.`,
          lineNumber,
        ),
      );
      section = "unknown";
      continue;
    }

    section = mapped;
    sectionDeclarations.push({ count, line: lineNumber, section: mapped });
  }

  if (entries.length === 0) {
    return err([
      new DecklistError(
        "no-entries",
        "No card lines were found. Section headers alone are not a decklist.",
      ),
    ]);
  }

  const sectionSums = new Map<DeckSection, number>();
  for (const entry of entries) {
    sectionSums.set(entry.section, (sectionSums.get(entry.section) ?? 0) + entry.count);
  }

  for (const declaration of sectionDeclarations) {
    const actual = sectionSums.get(declaration.section) ?? 0;
    if (actual !== declaration.count) {
      warnings.push(
        warning(
          "section-mismatch",
          `${declaration.section} header declares ${declaration.count}, parsed ${actual}.`,
          declaration.line,
        ),
      );
    }
  }

  if (totalDeclarations.length > 0) {
    const last = totalDeclarations[totalDeclarations.length - 1];
    total = last?.count ?? null;

    const distinct = new Set(totalDeclarations.map((declaration) => declaration.count));
    if (distinct.size > 1) {
      warnings.push(
        warning(
          "total-mismatch",
          `Conflicting total headers: ${[...distinct].join(", ")}.`,
          last?.line ?? null,
        ),
      );
    }

    const sum = entries.reduce((sumSoFar, entry) => sumSoFar + entry.count, 0);
    if (total !== null && total !== sum) {
      warnings.push(
        warning(
          "total-mismatch",
          `Total header declares ${total}, parsed ${sum}.`,
          last?.line ?? null,
        ),
      );
    }
  }

  return ok({ entries, total, warnings });
}
