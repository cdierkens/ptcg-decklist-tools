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

Issues live in this repo's GitHub Issues, via the `gh` CLI.
