# ptcg-decklist-tools

Zero-dependency toolkit for Pokémon TCG decklists: parse, normalise, identify,
diff, and render. Published to npm as `@dierkens.dev/ptcg-decklist-tools`
(MIT, public).

Public API and provenance: `README.md`. Design:
`docs/specs/2026-10-23-decklist-identity.md`.

## Commands

- `pnpm run verify` — the gate: `typecheck`, `test`, `build`. CI and
  `prepublishOnly` run this.
- `pnpm run test` — unit tests plus coverage.
- `pnpm run catalog` — rebuild the shipped JSON from the pinned public TCGdex
  dump. It fails if a frozen fingerprint would change; accept one only with a
  deliberate `hashVersion` bump (`pnpm run catalog:accept`).
- `pnpm run archetypes` — fetch the configured Limitless windows and rewrite
  `src/data/archetypes.json` (network; cache in `.cache/archetypes`, `--refresh`
  to refetch). It fails if an alias icon has no shipped species; run it after
  changing `species.json` or rebuilding the catalog.
- `pnpm run harvest:limitless -- --list=30537 --out=.cache/limitless` — fetch
  public Limitless decklists and emit fixture-shaped text (network; never run in
  tests). The default validates every ref against `src/data/cards.json` and
  exits non-zero if one is missing; `--no-validate` skips that check.
- `pnpm changeset` / `pnpm run version` / `pnpm run release` — changesets;
  publishing needs a one-time npm OTP (2FA).

## Constraints

- **Zero runtime dependencies.** The package publishes to npm and must stay
  installable with nothing but TypeScript types.
- Plain TypeScript library. Not a PokeDojo package. No Effect,
  no `@pokedojo/*`, no Firestore, no React Router, no Turborepo.
- Error handling is a `Result` union — not `try/catch`. `unwrapOrThrow` is the
  escape hatch.
- Public API changes go through Changesets (`.changeset/`), not manual
  `CHANGELOG.md` edits.
- MIT, public scoped package; `publishConfig.access` is `public`.
- The catalog ships in the package. No runtime network calls. Data is derived
  from TCGdex (MIT) and Limitless facts; no card text or images.

## Docs

- `docs/specs/` — specs. Draft until grilled, then approved.
- `NOTICE` — data provenance and trademark disclaimer.

## Agent skills

Committed under `.agents/skills/`, sourced via `skills-lock.json`. Update them
deliberately with `npx skills update`, and review the diff.

### Issue tracker

Issues live in this repo's GitHub Issues, via the `gh` CLI. See
`docs/agents/issue-tracker.md`.

### Triage labels

Five canonical roles, each label string equal to its name. See
`docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See
`docs/agents/domain.md`.
