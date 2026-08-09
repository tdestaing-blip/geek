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
  readonly edition: Edition;
  readonly game: Game;
  readonly platform: Platform;
};

/**
 * The shape of one row, catalog context included.
 *
 * Written as one embedded select so a collection of any size costs a single
 * query. The obvious alternative — read the Copies, then look up each Edition,
 * then each Game — is the N+1 that makes a list of fifty items a hundred and
 * fifty round trips.
 *
 * The joins are inner joins: every Copy has an Edition, every Edition has a
 * Game and a Platform, all enforced by non-null foreign keys. A missing one
 * would be a broken database rather than a Copy to render without its title.
 */
const COLLECTION_SELECT = `
  id, edition_id, owner_id, visibility, trade_availability, created_at,
  editions!inner (
    id, game_id, platform_id, edition_name, region_code, supported_languages,
    release_date, publisher_name, packaging_type,
    games!inner (id, canonical_title, description, original_release_date),
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
      edition: toEdition(row.editions),
      game: toGame(row.editions.games),
      platform: toPlatform(row.editions.platforms),
    })),
    limit,
    offset,
  }));
}
