# Catalog rules have one build/runtime contract

The runtime catalog context and the build derivation still implement live-number and addressable-set rules separately. Both suites passed while disagreeing: the runtime uppercased promo suffixes and the build preserved lowercase local ids, producing refs such as `AQ-103a` that the runtime would not resolve.

The build and runtime now share a contract test over the shipped set index and every shipped ref. It checks that both choose the same addressable set and normalise the same live number. The test is deliberately allowed to cross the build seam; it is the place where two implementations must agree.

## Considered Options

- **Share one JavaScript module between build and runtime** — removes the duplication, but the runtime is TypeScript and the build runs before `tsc`; the extra packaging seam costs more than it saves.
- **Generate a ref-rules JSON artifact** — one source of truth, but another generated file and schema to maintain.
- **Let each side test itself** — current cost: both pass while shipped refs are unresolvable.
- **Contract test over the shipped data** — chosen; keeps the two implementations, but makes divergence a failing test.
