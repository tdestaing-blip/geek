import type { Edition, EditionIdentifier, Game, Platform } from "@geek/domain";
import type { GeekSupabaseClient } from "@geek/supabase";

import type { Page, PageRequest } from "../pagination";
import { resolvePage, toRange } from "../pagination";
import type { EntityResult, ReadResult } from "../result";
import { databaseFailure, mapRows } from "../result";
import { toEdition, toGame, toPlatform } from "./mapping";

/**
 * Reads of Geek's catalog.
 *
 * The catalog is public: these work for a signed-out visitor, which is what
 * makes a shared game page linkable and indexable.
 *
 * Game and Edition are fetched separately rather than as one nested blob. An
 * Edition page needs its Game, but a Game page does not need every Edition of
 * a Game that has forty of them, and one function returning both would force
 * that cost on every caller.
 */

const EDITIONS_PAGE = { defaultLimit: 50, maxLimit: 100 } as const;
const PLATFORMS_PAGE = { defaultLimit: 50, maxLimit: 100 } as const;

const GAME_COLUMNS = "id, canonical_title, description, original_release_date";
const PLATFORM_COLUMNS = "id, slug, name";
const EDITION_COLUMNS =
  "id, game_id, platform_id, edition_name, region_code, supported_languages, release_date, publisher_name, packaging_type";
const EDITION_IDENTIFIER_COLUMNS = "id, edition_id, scheme, value, authority";
const BATCH_LIMIT = 100;

/** Reads a bounded set of Games without turning catalog grids into N+1 queries. */
export async function getGamesByIds(
  client: GeekSupabaseClient,
  gameIds: readonly string[],
): Promise<ReadResult<readonly Game[]>> {
  const ids = boundedDistinctIds(gameIds);
  if (ids.length === 0) return { outcome: "ok", data: [] };
  const { data, error } = await client
    .from("games")
    .select(GAME_COLUMNS)
    .in("id", ids)
    .order("canonical_title", { ascending: true })
    .order("id", { ascending: true });
  if (error !== null) return databaseFailure(error);
  return mapRows(() => data.map(toGame));
}

/** Reads a bounded set of Editions while preserving their canonical identities. */
export async function getEditionsByIds(
  client: GeekSupabaseClient,
  editionIds: readonly string[],
): Promise<ReadResult<readonly Edition[]>> {
  const ids = boundedDistinctIds(editionIds);
  if (ids.length === 0) return { outcome: "ok", data: [] };
  const { data, error } = await client
    .from("editions")
    .select(EDITION_COLUMNS)
    .in("id", ids)
    .order("id", { ascending: true });
  if (error !== null) return databaseFailure(error);
  return mapRows(() => data.map(toEdition));
}

/** Reads a bounded set of Platforms for catalog presentation joins. */
export async function getPlatformsByIds(
  client: GeekSupabaseClient,
  platformIds: readonly string[],
): Promise<ReadResult<readonly Platform[]>> {
  const ids = boundedDistinctIds(platformIds);
  if (ids.length === 0) return { outcome: "ok", data: [] };
  const { data, error } = await client
    .from("platforms")
    .select(PLATFORM_COLUMNS)
    .in("id", ids)
    .order("name", { ascending: true })
    .order("id", { ascending: true });
  if (error !== null) return databaseFailure(error);
  return mapRows(() => data.map(toPlatform));
}

/**
 * Reads one Game.
 *
 * An id that matches nothing is `not_found`, never an error: it usually means a
 * stale link rather than anything being broken. `maybeSingle` is what keeps the
 * two apart, since a plain `single` would report an absent row as a failure
 * indistinguishable from a real one.
 */
export async function getGame(
  client: GeekSupabaseClient,
  gameId: string,
): Promise<EntityResult<Game>> {
  const { data, error } = await client
    .from("games")
    .select(GAME_COLUMNS)
    .eq("id", gameId)
    .maybeSingle();

  if (error !== null) {
    return databaseFailure(error);
  }

  if (data === null) {
    return { outcome: "not_found" };
  }

  return mapRows(() => toGame(data));
}

/** Reads one canonical Platform by Geek-owned identity. */
export async function getPlatform(
  client: GeekSupabaseClient,
  platformId: string,
): Promise<EntityResult<Platform>> {
  const { data, error } = await client
    .from("platforms")
    .select(PLATFORM_COLUMNS)
    .eq("id", platformId)
    .maybeSingle();

  if (error !== null) return databaseFailure(error);
  if (data === null) return { outcome: "not_found" };
  return mapRows(() => toPlatform(data));
}

/** Lists canonical Platforms alphabetically for catalog discovery surfaces. */
export async function getPlatforms(
  client: GeekSupabaseClient,
  page?: PageRequest,
): Promise<ReadResult<Page<Platform>>> {
  const { limit, offset } = resolvePage(page, PLATFORMS_PAGE);
  const range = toRange(limit, offset);
  const { data, error } = await client
    .from("platforms")
    .select(PLATFORM_COLUMNS)
    .order("name", { ascending: true })
    .order("id", { ascending: true })
    .range(range.from, range.to);

  if (error !== null) return databaseFailure(error);
  return mapRows(() => ({ items: data.map(toPlatform), limit, offset }));
}

/** Reads one Edition. Its Game is a separate read, by `edition.gameId`. */
export async function getEdition(
  client: GeekSupabaseClient,
  editionId: string,
): Promise<EntityResult<Edition>> {
  const { data, error } = await client
    .from("editions")
    .select(EDITION_COLUMNS)
    .eq("id", editionId)
    .maybeSingle();

  if (error !== null) {
    return databaseFailure(error);
  }

  if (data === null) {
    return { outcome: "not_found" };
  }

  return mapRows(() => toEdition(data));
}

/** Lists the typed identifiers recorded for one canonical Edition. */
export async function getEditionIdentifiers(
  client: GeekSupabaseClient,
  editionId: string,
): Promise<ReadResult<readonly EditionIdentifier[]>> {
  const { data, error } = await client
    .from("edition_identifiers")
    .select(EDITION_IDENTIFIER_COLUMNS)
    .eq("edition_id", editionId)
    .order("scheme", { ascending: true })
    .order("value", { ascending: true })
    .order("id", { ascending: true });

  if (error !== null) return databaseFailure(error);
  return mapRows(() =>
    data.map((row) => ({
      id: row.id,
      editionId: row.edition_id,
      scheme: row.scheme,
      value: row.value,
      authority: row.authority,
    })),
  );
}

/**
 * Lists the Editions of one Game, oldest release first.
 *
 * A Game whose id does not exist returns an empty page rather than
 * `not_found`. The question this answers is "which Editions does this Game
 * have", and none is a truthful answer; callers that need to distinguish a
 * missing Game are already reading the Game itself.
 *
 * Ordering puts undated Editions last, so incomplete catalog data collects at
 * the end of the list instead of at the top of the screen.
 */
export async function getEditionsForGame(
  client: GeekSupabaseClient,
  gameId: string,
  page?: PageRequest,
): Promise<ReadResult<Page<Edition>>> {
  const { limit, offset } = resolvePage(page, EDITIONS_PAGE);
  const range = toRange(limit, offset);

  const { data, error } = await client
    .from("editions")
    .select(EDITION_COLUMNS)
    .eq("game_id", gameId)
    .order("release_date", { ascending: true, nullsFirst: false })
    .order("id", { ascending: true })
    .range(range.from, range.to);

  if (error !== null) {
    return databaseFailure(error);
  }

  return mapRows(() => ({ items: data.map(toEdition), limit, offset }));
}

/** Lists canonical Editions for one Platform, with no Game identity inference. */
export async function getEditionsForPlatform(
  client: GeekSupabaseClient,
  platformId: string,
  page?: PageRequest,
): Promise<ReadResult<Page<Edition>>> {
  const { limit, offset } = resolvePage(page, EDITIONS_PAGE);
  const range = toRange(limit, offset);
  const { data, error } = await client
    .from("editions")
    .select(EDITION_COLUMNS)
    .eq("platform_id", platformId)
    .order("game_id", { ascending: true })
    .order("release_date", { ascending: true, nullsFirst: false })
    .order("id", { ascending: true })
    .range(range.from, range.to);

  if (error !== null) return databaseFailure(error);
  return mapRows(() => ({ items: data.map(toEdition), limit, offset }));
}

function boundedDistinctIds(ids: readonly string[]): readonly string[] {
  const distinct = [...new Set(ids)];
  if (distinct.length > BATCH_LIMIT) {
    throw new RangeError(`Catalog batch reads support at most ${BATCH_LIMIT} ids`);
  }
  return distinct;
}
