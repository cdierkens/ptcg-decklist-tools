# Catalog from public TCGdex data

The shipped catalog is built from a public TCGdex dump plus a checked-in line/species override table, not from PokeDojo's private registry. A public MIT package must be reproducible by anyone; depending on a private source would make the data unbuildable outside this workspace. TCGdex supplies sets, printings, and card facts under MIT; the overrides carry only the curated evolution-line and sprite-slug mappings that TCGdex does not. Fingerprints and `catalogVersion` are build artifacts. No card text or images ship, and the README/NOTICE carry attribution and the trademark disclaimer.

## Considered Options

- **PokeDojo registry** — authoritative but private; breaks reproducibility.
- **Vendored snapshot with no provenance** — reproducible but unattributable.
- **Public TCGdex + checked-in overrides** — chosen.
