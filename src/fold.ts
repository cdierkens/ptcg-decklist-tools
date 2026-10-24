/**
 * Text folding shared by parsing and normalisation.
 *
 * Folding is deliberately not case folding: card names are case-sensitive in
 * the catalog, and a lowercased unresolved name should not collide with a
 * different one. It only removes presentation differences that a client or a
 * keyboard introduces.
 */
export function foldName(value: string): string {
  return value
    .normalize("NFC")
    .replace(/[\u2018\u2019\u201A\u201B\u02BC\u2032\uFF07]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u2033\uFF02]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}
