# Frozen 64-bit fingerprints

Each catalog card carries a 16-hex (64-bit) functional fingerprint, computed once and frozen. With ~18,400 printings, a 32-bit fingerprint has a ~4% birthday-collision chance across the catalog; 64 bits is ~10⁻¹¹. A collision would silently merge two decks, the one failure worth four extra bytes. Rebuilding the catalog reuses the checked-in map, computes only new cards, and prints a diff for anything that would move; accepting that diff requires a deliberate `hashVersion` bump. This is what makes a three-month release cadence safe: the catalog grows, existing deck ids do not move. Set, number, art, rarity, illustrator, language, and regulation mark are excluded, so a reprint or a new mark does not fork identity.

## Considered Options

- **32-bit fingerprint** — too many cards for a safe birthday bound.
- **Full-card JSON hash** — moves on any upstream text/format change.
- **Frozen 64-bit fingerprint** — chosen; stable, with an explicit migration.
