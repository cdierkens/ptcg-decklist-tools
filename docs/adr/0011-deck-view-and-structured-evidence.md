# Expose deck view and structured evidence

The built-in renderer was the only consumer of the normalized deck's projections. A consumer that needed a custom sheet, section count, or printing line had to re-derive those facts, recreating the duplication the deck module was meant to remove. Warnings and suggestion reasons were English prose only, so a consumer could not localise them or render its own explanation without parsing strings.

`deckView` exposes the safe read-only projections: section groups, functional counts, list counts, and name counts. The constructor, hash pre-images, and mutable internals stay private. `DecklistWarning.details` and `ArchetypeSuggestion.evidence` carry structured facts beside the existing `message` and `reasons`, so current callers keep working while new callers read data rather than prose.

## Considered Options

- **Export every projection function directly** — maximal access, but exposes mutable maps and internal shapes that are not a stable interface.
- **Keep projections internal** — smallest surface, but forces consumers to fork section and printing rules.
- **Replace prose with structured data** — cleaner model, but breaks every current caller and loses the ready-to-show message.
- **Read-only view plus structured facts beside prose** — chosen; one projection interface, compatibility preserved, and consumers can localise without parsing.
