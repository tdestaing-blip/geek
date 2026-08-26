import type { Copy, Edition, Game, Platform } from "@geek/domain";
import type { GeekSupabaseClient } from "@geek/supabase";

import { resolveCaller } from "../caller";
import { toEdition, toGame, toPlatform } from "../catalog/mapping";
import type { Page, PageRequest } from "../pagination";
import { resolvePage, toRange } from "../pagination";
import type { OwnedResult } from "../result";
import { databaseFailure, mapRows } from "../result";
import { toCopy } from "./mapping";

/**
 * The caller's collection.
 *
 * A Collection is not a table. It is the set of Copies a person currently owns,
 * derived on read from `copies.owner_id`, which is why nothing here creates or
 * persists a collection object. Ownership is the fact; the collection is the
 * view of it.
 */

const COLLECTION_PAGE = { defaultLimit: 50, maxLimit: 100 } as const;

/**
 * One Copy with the catalog context needed to render it in a list.
 *
 * Shaped for a collection row or card: what the game is, which release it is,
 * and the owner's own flags. Component states, private details and anything
 * else belonging to a single Copy are deliberately absent — they are a detail
 * read, and fetching them for every row of a large collection would be waste.
 */
export type CollectionEntry = {
  readonly copy: Copy;
  readonly edition: Edition | null;
  readonly game: Game;
  readonly platform: Platform | null;
};

/**
 * The shape of one row, catalog context included.
 *
 * Written as one embedded select so a collection of any size costs a single
 * query. The obvious alternative — read the Copies, then look up each Edition,
 * then each Game — is the N+1 that makes a list of fifty items a hundred and
 * fifty round trips.
 *
 * Game is an inner join because every Copy identifies its Game. Edition and
 * Platform are optional so a Quick Copy remains a normal collection entry.
 */
const COLLECTION_SELECT = `
  id, game_id, edition_id, owner_id, visibility, availability, created_at,
  games!copies_game_id_fkey!inner (id, canonical_title, description, original_release_date),
  editions!copies_edition_id_fkey (
    id, game_id, platform_id, edition_name, region_code, supported_languages,
    release_date, publisher_name, packaging_type,
    platforms!inner (id, slug, name)
  )
`;

/**
 * Reads the signed-in user's collection, most recently added first.
 *
 * Takes no owner id, by design: see `resolveCaller`. Whose collection this is
 * cannot be influenced by the caller.
 *
 * Visibility is not filtered. A collector's own private Copies are part of
 * their own collection, and hiding them from the person who owns them would be
 * a bug rather than a privacy measure. Row-level security already prevents this
 * from returning anyone else's.
 */
export async function getMyCollection(
  client: GeekSupabaseClient,
  page?: PageRequest,
): Promise<OwnedResult<Page<CollectionEntry>>> {
  const { limit, offset } = resolvePage(page, COLLECTION_PAGE);
  const caller = await resolveCaller(client);

  if (caller.outcome !== "ok") {
    return caller;
  }

  const range = toRange(limit, offset);

  const { data, error } = await client
    .from("copies")
    .select(COLLECTION_SELECT)
    .eq("owner_id", caller.userId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(range.from, range.to);

  if (error !== null) {
    return databaseFailure(error);
  }

  return mapRows(() => ({
    items: data.map((row) => ({
      copy: toCopy(row),
      edition: row.editions === null ? null : toEdition(row.editions),
      game: toGame(row.games),
      platform: row.editions === null ? null : toPlatform(row.editions.platforms),
    })),
    limit,
    offset,
  }));
}

/** Reads the caller's Copies for one exact Edition without choosing among duplicates. */
export async function getMyCopiesForEdition(
  client: GeekSupabaseClient,
  editionId: string,
): Promise<OwnedResult<readonly Copy[]>> {
  const caller = await resolveCaller(client);
  if (caller.outcome !== "ok") return caller;

  const { data, error } = await client
    .from("copies")
    .select("id, game_id, edition_id, owner_id, visibility, availability, created_at")
    .eq("owner_id", caller.userId)
    .eq("edition_id", editionId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (error !== null) return databaseFailure(error);
  return mapRows(() => data.map(toCopy));
}
