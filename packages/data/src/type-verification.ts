/**
 * Compile-time proof of the guarantees this layer claims.
 *
 * The file has no runtime purpose. Its value is that `pnpm typecheck` fails if
 * any of these stop holding — including the `@ts-expect-error` lines, which
 * fail when the error they expect *disappears*. Each one is a rule that would
 * otherwise only be enforced by everyone remembering it.
 */
import type { CatalogMedia, Copy, Edition, Game, GameSearchResult } from "@geek/domain";
import type { GeekSupabaseClient } from "@geek/supabase";

import type { CollectionEntry } from "./collection/collection";
import type { MyCopyDetail } from "./collection/copy-detail";

declare const client: GeekSupabaseClient;

/** True only for `any`, which no query result here may be. */
type IsAny<T> = 0 extends 1 & T ? true : false;

type Assert<T extends true> = T;

// ---------------------------------------------------------------------------
// Status values cannot be widened back to arbitrary strings
// ---------------------------------------------------------------------------

export const validVisibility: Copy["visibility"] = "public";

// @ts-expect-error a value the database CHECK forbids is not a Copy visibility
export const invalidVisibility: Copy["visibility"] = "sealed";

// @ts-expect-error trade availability is a closed set, not free text
export const invalidTradeAvailability: Copy["availability"] = "maybe";

// @ts-expect-error catalog media kinds are finite, not provider-defined strings
export const invalidCatalogMediaKind: CatalogMedia["kind"] = "screenshot";

// @ts-expect-error rights status must be explicitly known at the domain boundary
export const invalidCatalogMediaRights: CatalogMedia["rightsStatus"] = "development_only";

// @ts-expect-error the 1-5 grade cannot be an arbitrary number
export const invalidGrade: NonNullable<
  MyCopyDetail["components"][number]["state"]
>["conditionGrade"] = 7;

// ---------------------------------------------------------------------------
// A Game is not an Edition
// ---------------------------------------------------------------------------

declare const game: Game;
declare const edition: Edition;

// @ts-expect-error an Edition needs a Game and a Platform; a Game is not one
export const gameAsEdition: Edition = game;

// @ts-expect-error and an Edition is not the creative work it is a release of
export const editionAsGame: Game = edition;

// ---------------------------------------------------------------------------
// A Game search result carries no Edition identity
// ---------------------------------------------------------------------------

declare const gameResult: GameSearchResult;

// @ts-expect-error the field the generated RPC type wrongly promises is absent
export const leakedEditionId: string = gameResult.editionId;

// ---------------------------------------------------------------------------
// Private data is not reachable through a Copy
// ---------------------------------------------------------------------------

declare const copy: Copy;

// @ts-expect-error purchase price lives on CopyPrivateDetails, never on Copy
export const leakedPrice: unknown = copy.purchasePrice;

/** A detail result keeps private data in its own field, of its own type. */
export type PrivateDetailsAreSeparate = Assert<
  MyCopyDetail["privateDetails"] extends MyCopyDetail["copy"] ? false : true
>;

// ---------------------------------------------------------------------------
// Embedded selects resolve to real shapes rather than `any`
// ---------------------------------------------------------------------------

/**
 * Mirrors the collection query's embedding. If PostgREST's type inference ever
 * fails to resolve one of these relationships it degrades to `any`, and every
 * mapper downstream would silently stop being checked.
 */
export async function collectionRowsAreTyped(): Promise<string> {
  const { data, error } = await client
    .from("copies")
    .select("id, visibility, games!copies_game_id_fkey!inner (id, canonical_title)")
    .limit(1);

  if (error !== null) {
    throw new Error(`${error.code}: ${error.message}`, { cause: error });
  }

  const first = data[0];

  if (first === undefined) {
    return "";
  }

  type NotAny = Assert<IsAny<typeof first> extends false ? true : false>;
  const proof: NotAny = true;
  void proof;

  return first.games.canonical_title;
}

/** The entry shape a collection list hands to a screen. */
export type CollectionEntryIsMapped = Assert<
  CollectionEntry["game"]["canonicalTitle"] extends string ? true : false
>;
