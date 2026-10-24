export interface CatalogSetLike {
  readonly liveAddressable: boolean;
  readonly liveCode: string;
  readonly order: number;
  readonly tcgdexId: string;
}

export function liveNumber(localId: string): string;

export function addressableSets(
  sets: readonly CatalogSetLike[],
): Map<string, CatalogSetLike>;
