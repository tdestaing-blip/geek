/**
 * Results of a Catalog search.
 *
 * One query can legitimately answer with either kind of catalog object: typing
 * "Zelda" should surface the Game, while "Wind Waker GameCube PAL" should
 * surface Editions. They are modelled as a discriminated union rather than one
 * shape with optional fields, so a caller cannot read an `editionId` off a
 * result that represents a Game, and cannot forget to handle one of the kinds.
 *
 * A result is an identity plus enough text to render a row. Anything more about
 * the Game or Edition is a follow-up read, so search stays a projection and
 * never becomes a second source of catalog truth.
 */

export type CatalogSearchResultKind = "game" | "edition";

const CATALOG_SEARCH_RESULT_KINDS: readonly string[] = ["game", "edition"];

/** Narrows a raw result kind, returning `null` for a value Geek does not know. */
export function parseCatalogSearchResultKind(value: string): CatalogSearchResultKind | null {
  return CATALOG_SEARCH_RESULT_KINDS.includes(value) ? (value as CatalogSearchResultKind) : null;
}

/**
 * A Game that matched the query.
 *
 * `title` is the Game's canonical title. There is no secondary label, because a
 * Game has no platform or region to qualify it.
 */
export type GameSearchResult = {
  readonly kind: "game";
  readonly gameId: string;
  readonly title: string;
  readonly relevanceScore: number;
};

/**
 * An Edition that matched the query.
 *
 * `title` is still the Game's canonical title, and `secondaryLabel` carries the
 * qualifiers that distinguish this release from its siblings, such as
 * "Nintendo GameCube · Player's Choice · PAL". Search deliberately does not
 * duplicate a separate Edition title.
 */
export type EditionSearchResult = {
  readonly kind: "edition";
  readonly editionId: string;
  readonly gameId: string;
  readonly platformId: string;
  readonly title: string;
  readonly secondaryLabel: string;
  readonly relevanceScore: number;
};

export type CatalogSearchResult = GameSearchResult | EditionSearchResult;
