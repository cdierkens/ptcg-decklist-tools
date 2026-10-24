/**
 * Public data shapes.
 *
 * The design is in `docs/specs/2026-10-23-decklist-identity.md`. These are the
 * shapes the implementation is being built against; they are exported so
 * consumers can type their own storage before the functions land.
 */

/** What a card is, independent of where it was printed. */
export type CardCategory = "pokemon" | "trainer" | "energy";

/** A decklist section. `unknown` is only used before the catalog resolves it. */
export type DeckSection = "pokemon" | "trainer" | "energy" | "unknown";

/** One set, keyed by TCGdex id. Live codes are not unique. */
export interface CatalogSet {
  /** Live code as printed, e.g. `TEF`, `30C`. Not unique. */
  readonly liveCode: string;
  /** TCGdex set id, e.g. `sv05`, `30th`, `30th-c`. */
  readonly tcgdexId: string;
  readonly name: string;
  /** `sv`, `me`, `swsh`, … */
  readonly era: string;
  /** Position in release order. `0` is the oldest set. */
  readonly order: number;
  readonly releaseDate: null | string;
  /** Live `76` is TCGdex `076` when this is `3`. */
  readonly paddingWidth: number;
  /** Whether a Live ref resolves to this set after the parent-prefix rule. */
  readonly liveAddressable: boolean;
}

/** One printing, plus the derived fields identity and suggestions need. */
export interface CatalogCard {
  /** Live ref as written: `TEF-130`. */
  readonly ref: string;
  /** TCGdex id: `sv05-130`. */
  readonly tcgdexId: string;
  /** English canonical name. Localized names never enter identity. */
  readonly name: string;
  readonly category: CardCategory;
  /** 16-hex fingerprint of the card's behaviour. Frozen once published. */
  readonly function: string;
  readonly regulationMark: null | string;
  /** Evolution-line id for Pokémon; `null` for Trainer and Energy. */
  readonly line: null | string;
  readonly stage: null | "basic" | "stage1" | "stage2";
  /** Limitless sprite slug, e.g. `dragapult`, `ogerpon-wellspring`. */
  readonly species: null | string;
}

/** The catalog and its build date, ready to pass to `normalizeDecklist`. */
export interface Catalog {
  readonly cards: readonly CatalogCard[];
  readonly sets: readonly CatalogSet[];
  readonly catalogVersion: string;
}

/** Options for normalisation. The catalog is required at runtime. */
export interface NormalizeOptions {
  readonly catalog: Catalog;
}

/** One community archetype alias, with the 0–2 Pokémon Limitless uses as icons. */
export interface CatalogArchetype {
  /** Stable id: `limitless:284/3`; a base row normalises to variant 0. */
  readonly id: string;
  readonly label: string;
  /** 0–2 sprite slugs; empty means label-only and never matched by card. */
  readonly cards: readonly string[];
  /** Window label, e.g. `TEF-30C`. */
  readonly window: string;
}

/** The two parts of a parsed card line. */
export interface CardRef {
  readonly setCode: string;
  readonly number: string;
}

/** A line as parsed, before any catalog lookup. */
export interface ParsedEntry {
  readonly count: number;
  readonly name: string;
  readonly ref: CardRef | null;
  readonly section: DeckSection;
  /** 1-based line number in the source text. */
  readonly line: number;
}

export type DecklistWarningCode =
  | "unrecognised-line"
  | "invalid-count"
  | "unknown-set"
  | "unknown-card"
  | "ambiguous-name"
  | "section-mismatch"
  | "total-mismatch"
  | "no-ref";

/** A non-fatal observation. Warnings never change a hash; they explain it. */
export interface DecklistWarning {
  readonly code: DecklistWarningCode;
  readonly message: string;
  readonly line: number | null;
}

export interface ParsedDecklist {
  readonly entries: readonly ParsedEntry[];
  readonly warnings: readonly DecklistWarning[];
  /** The declared total, if the source had one. */
  readonly total: number | null;
}

/** One resolved card, merged across printings. */
export interface NormalizedEntry {
  /** `null` when the catalog could not resolve the entry. */
  readonly card: CatalogCard | null;
  /**
   * Display name: the catalog's canonical name when resolved, otherwise the
   * folded name from the list. Never hashed.
   */
  readonly name: string;
  /** `f:<function>` | `?:<SET>-<NUM>` | `?<folded name>`. */
  readonly key: string;
  readonly count: number;
  readonly section: DeckSection;
  /** The printings contributing to this entry, for display and printing diffs. */
  readonly printings: readonly { readonly ref: string; readonly count: number }[];
}

export interface NormalizedDeck {
  readonly entries: readonly NormalizedEntry[];
  readonly total: number;
  readonly warnings: readonly DecklistWarning[];
  readonly catalogVersion: string;
}

/** A hash and the versions needed to compare it with another. */
export interface DeckHash {
  readonly value: string;
  readonly hashVersion: number;
  readonly catalogVersion: string;
}

/** An inclusive range of sets, labelled the way Limitless labels it. */
export interface FormatWindow {
  /** Oldest included set code, e.g. `TEF`. */
  readonly base: string;
  /** Newest included set code, e.g. `30C`. */
  readonly latest: string;
  /** Derived: `TEF-30C`. */
  readonly label: string;
}

export interface FormatReport {
  readonly window: FormatWindow;
  /** Entries with at least one contributing printing outside the window. */
  readonly outside: readonly NormalizedEntry[];
  /** Set codes the catalog does not know, including unknown window ends. */
  readonly unknownSets: readonly string[];
  /** Names over four copies, excluding basic Energy. */
  readonly fourCopy: readonly { readonly name: string; readonly count: number }[];
  readonly ok: boolean;
}

/** Options for fitting a deck to candidate windows. */
export interface FittingWindowsOptions {
  /** Restrict candidate bases to sets in this catalog era, e.g. `sv`. */
  readonly era?: string;
  /** Catalog whose set order to use; defaults to the shipped set index. */
  readonly catalog?: Catalog;
}

/** Options for comparing two normalised decks. */
export interface DiffDecklistsOptions {
  /** Maximum differing entries still called a variant. Defaults to 5. */
  readonly maxChanges?: number;
  /** Accepted for API symmetry; normalised entries already carry catalog data. */
  readonly catalog?: Catalog;
}

export type DiffChangeKind = "added" | "removed" | "count" | "printing";

export interface DiffChange {
  readonly kind: DiffChangeKind;
  readonly entry: NormalizedEntry;
  readonly from: number;
  readonly to: number;
  /** 0–1 confidence in the pairing. */
  readonly confidence: number;
}

export type DeckDiffClassification = "identical" | "printing-only" | "variant" | "different";

export interface DeckDiff {
  readonly classification: DeckDiffClassification;
  readonly changes: readonly DiffChange[];
  /** Copies whose card and count are unchanged. */
  readonly sameCount: number;
}

export type ArchetypeBasis = "alias" | "lines";

export interface ArchetypeSuggestion {
  /** `limitless:284/3`, or a synthetic id for a line suggestion. */
  readonly id: string;
  readonly label: string;
  /** 0–2 sprite slugs for an alias, or 1–2 for a line suggestion. */
  readonly cards: readonly string[];
  readonly confidence: number;
  readonly basis: ArchetypeBasis;
  /** Why this won, shown to the player before they confirm. */
  readonly reasons: readonly string[];
}

/** Options for archetype suggestions. */
export interface SuggestArchetypeOptions {
  /** Scope alias matching to one window; defaults to every shipped window. */
  readonly window?: FormatWindow | string;
  /** Alias table; defaults to the shipped table. */
  readonly archetypes?: readonly CatalogArchetype[];
  /** Catalog used to resolve a window label; defaults to the shipped sets. */
  readonly catalog?: Catalog;
}
