import type { Edition, Game } from "@geek/domain";
import type { GeekSupabaseClient } from "@geek/supabase";

import type { Page, PageRequest } from "../pagination";
import { resolvePage, toRange } from "../pagination";
import type { EntityResult, ReadResult } from "../result";
import { databaseFailure, mapRows } from "../result";
import { toEdition, toGame } from "./mapping";

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

const GAME_COLUMNS = "id, canonical_title, description, original_release_date";
const EDITION_COLUMNS =
  "id, game_id, platform_id, edition_name, region_code, supported_languages, release_date, publisher_name, packaging_type";

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
