import type { CalendarDate } from "../values";

/**
 * Catalog models: what physical games exist, independent of who owns one.
 *
 * Game, Edition and Platform are deliberately three separate types rather than
 * one flexible "catalog item". The distinction between the creative work and a
 * specific commercial release is the foundation the rest of the product rests
 * on, so it is expressed in the type system rather than in a `kind` field on a
 * shared shape.
 */

/**
 * The abstract creative work, such as "The Legend of Zelda: The Wind Waker".
 *
 * A Game is not tied to any one physical release and carries no platform,
 * region or packaging: those belong to its Editions.
 */
export type Game = {
  readonly id: string;
  readonly canonicalTitle: string;
  readonly description: string | null;
  readonly originalReleaseDate: CalendarDate | null;
};

/**
 * A hardware or software platform an Edition was released on.
 *
 * Reference data owned by the Catalog, never inferred from what users own.
 */
export type Platform = {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
};

/**
 * One specific commercially released physical version of a Game.
 *
 * Two releases of the same Game that differ in platform, region or packaging
 * are different Editions, because those differences change what a collector is
 * actually holding.
 *
 * Every field except `id`, `gameId`, `platformId` and `supportedLanguages` is
 * genuinely optional in the catalog: a newly imported Edition often knows only
 * which Game and Platform it belongs to.
 */
export type Edition = {
  readonly id: string;
  readonly gameId: string;
  readonly platformId: string;
  readonly editionName: string | null;
  readonly regionCode: string | null;
  readonly supportedLanguages: readonly string[];
  readonly releaseDate: CalendarDate | null;
  readonly publisherName: string | null;
  readonly packagingType: string | null;
};
