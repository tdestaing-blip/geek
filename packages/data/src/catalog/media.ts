import type { CatalogMedia } from "@geek/domain";
import type { GeekSupabaseClient } from "@geek/supabase";

import type { ReadResult } from "../result";
import { databaseFailure, mapRows } from "../result";
import { toCatalogMedia } from "./mapping";

const PRIMARY_COVER_COLUMNS =
  "id, game_id, edition_id, kind, asset_url, source_provider, source_asset_id, source_page_url, rights_status, license_name, license_url, attribution, width, height, is_primary, created_at, updated_at";
const PUBLISHABLE_RIGHTS = ["reusable", "licensed"] as const;
const MAX_COVER_TARGETS = 100;

/** Reads a Game's publishable primary front cover, or `null` when it has none. */
export async function getPrimaryGameCover(
  client: GeekSupabaseClient,
  gameId: string,
): Promise<ReadResult<CatalogMedia | null>> {
  const { data, error } = await primaryCoverQuery(client).eq("game_id", gameId).maybeSingle();

  if (error !== null) {
    return databaseFailure(error);
  }

  return mapRows(() => (data === null ? null : toCatalogMedia(data)));
}

/** Reads an Edition's publishable primary front cover, or `null` when absent. */
export async function getPrimaryEditionCover(
  client: GeekSupabaseClient,
  editionId: string,
): Promise<ReadResult<CatalogMedia | null>> {
  const { data, error } = await primaryCoverQuery(client).eq("edition_id", editionId).maybeSingle();

  if (error !== null) {
    return databaseFailure(error);
  }

  return mapRows(() => (data === null ? null : toCatalogMedia(data)));
}

/**
 * Reads primary Game covers for at most 100 targets in one database request.
 * Missing targets are omitted; each returned model carries its `gameId` key.
 */
export async function getPrimaryGameCovers(
  client: GeekSupabaseClient,
  gameIds: readonly string[],
): Promise<ReadResult<readonly CatalogMedia[]>> {
  const ids = boundedDistinctIds(gameIds);

  if (ids.length === 0) {
    return { outcome: "ok", data: [] };
  }

  const { data, error } = await primaryCoverQuery(client)
    .in("game_id", ids)
    .order("game_id", { ascending: true });

  if (error !== null) {
    return databaseFailure(error);
  }

  return mapRows(() => data.map(toCatalogMedia));
}

/**
 * Reads primary Edition covers for at most 100 targets in one database request.
 * Missing targets are omitted; each returned model carries its `editionId` key.
 */
export async function getPrimaryEditionCovers(
  client: GeekSupabaseClient,
  editionIds: readonly string[],
): Promise<ReadResult<readonly CatalogMedia[]>> {
  const ids = boundedDistinctIds(editionIds);

  if (ids.length === 0) {
    return { outcome: "ok", data: [] };
  }

  const { data, error } = await primaryCoverQuery(client)
    .in("edition_id", ids)
    .order("edition_id", { ascending: true });

  if (error !== null) {
    return databaseFailure(error);
  }

  return mapRows(() => data.map(toCatalogMedia));
}

function primaryCoverQuery(client: GeekSupabaseClient) {
  return client
    .from("catalog_media")
    .select(PRIMARY_COVER_COLUMNS)
    .eq("kind", "cover_front")
    .eq("is_primary", true)
    .in("rights_status", PUBLISHABLE_RIGHTS);
}

function boundedDistinctIds(ids: readonly string[]): string[] {
  if (ids.length > MAX_COVER_TARGETS) {
    throw new RangeError(`cover target batch cannot exceed ${MAX_COVER_TARGETS} ids`);
  }

  return [...new Set(ids)];
}
