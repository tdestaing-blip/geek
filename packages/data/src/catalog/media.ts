import type { CatalogMedia } from "@geek/domain";
import type { GeekSupabaseClient } from "@geek/supabase";

import type { ReadResult } from "../result";
import { databaseFailure, mapRows } from "../result";
import { toCatalogMedia } from "./mapping";
import { catalogMediaRightsForUsageMode, type CatalogMediaUsageMode } from "./media-policy";

const PRIMARY_MEDIA_COLUMNS =
  "id, game_id, edition_id, kind, asset_url, source_provider, source_asset_id, source_page_url, rights_status, license_name, license_url, attribution, width, height, is_primary, created_at, updated_at";
const MAX_COVER_TARGETS = 100;

export type CatalogMediaReadOptions = {
  readonly usageMode?: CatalogMediaUsageMode;
};

/** A deterministic Game presentation choice that retains the selected row's real target. */
export type GamePresentationMedia = {
  readonly gameId: string;
  readonly media: CatalogMedia;
};

/** Reads a Game's stored primary front cover, or `null` when it has none. */
export async function getPrimaryGameCover(
  client: GeekSupabaseClient,
  gameId: string,
  options: CatalogMediaReadOptions = {},
): Promise<ReadResult<CatalogMedia | null>> {
  const { data, error } = await primaryCoverQuery(client, options)
    .eq("game_id", gameId)
    .maybeSingle();

  if (error !== null) return databaseFailure(error);
  return mapRows(() => (data === null ? null : toCatalogMedia(data)));
}

/** Reads an Edition's displayable primary front cover, or `null` when absent. */
export async function getPrimaryEditionCover(
  client: GeekSupabaseClient,
  editionId: string,
  options: CatalogMediaReadOptions = {},
): Promise<ReadResult<CatalogMedia | null>> {
  const { data, error } = await primaryCoverQuery(client, options)
    .eq("edition_id", editionId)
    .maybeSingle();

  if (error !== null) return databaseFailure(error);
  return mapRows(() => (data === null ? null : toCatalogMedia(data)));
}

/** Reads stored primary Game covers for at most 100 targets in one request. */
export async function getPrimaryGameCovers(
  client: GeekSupabaseClient,
  gameIds: readonly string[],
  options: CatalogMediaReadOptions = {},
): Promise<ReadResult<readonly CatalogMedia[]>> {
  const ids = boundedDistinctIds(gameIds);
  if (ids.length === 0) return { outcome: "ok", data: [] };

  const { data, error } = await primaryCoverQuery(client, options)
    .in("game_id", ids)
    .order("game_id", { ascending: true });

  if (error !== null) return databaseFailure(error);
  return mapRows(() => data.map(toCatalogMedia));
}

/** Reads primary Edition covers for at most 100 targets in one request. */
export async function getPrimaryEditionCovers(
  client: GeekSupabaseClient,
  editionIds: readonly string[],
  options: CatalogMediaReadOptions = {},
): Promise<ReadResult<readonly CatalogMedia[]>> {
  const ids = boundedDistinctIds(editionIds);
  if (ids.length === 0) return { outcome: "ok", data: [] };

  const { data, error } = await primaryCoverQuery(client, options)
    .in("edition_id", ids)
    .order("edition_id", { ascending: true });

  if (error !== null) return databaseFailure(error);
  return mapRows(() => data.map(toCatalogMedia));
}

/** Reads a Game's displayable primary editorial artwork, or `null` when absent. */
export async function getPrimaryGameArtwork(
  client: GeekSupabaseClient,
  gameId: string,
  options: CatalogMediaReadOptions = {},
): Promise<ReadResult<CatalogMedia | null>> {
  const { data, error } = await primaryMediaQuery(client, "artwork", options)
    .eq("game_id", gameId)
    .maybeSingle();

  if (error !== null) return databaseFailure(error);
  return mapRows(() => (data === null ? null : toCatalogMedia(data)));
}

/**
 * Resolves one canonical Game presentation cover without changing CatalogMedia identity.
 * A real Game-targeted cover wins. Otherwise Geek deterministically selects a primary
 * Edition front cover: standard release, known earliest release date, region, then ID.
 */
export async function getGamePresentationCover(
  client: GeekSupabaseClient,
  gameId: string,
  options: CatalogMediaReadOptions = {},
): Promise<ReadResult<GamePresentationMedia | null>> {
  const result = await getGamePresentationCovers(client, [gameId], options);
  if (result.outcome !== "ok") return result;
  return { outcome: "ok", data: result.data[0] ?? null };
}

/** Resolves deterministic presentation covers for at most 100 Games. */
export async function getGamePresentationCovers(
  client: GeekSupabaseClient,
  gameIds: readonly string[],
  options: CatalogMediaReadOptions = {},
): Promise<ReadResult<readonly GamePresentationMedia[]>> {
  const ids = boundedDistinctIds(gameIds);
  if (ids.length === 0) return { outcome: "ok", data: [] };

  const explicitResult = await getPrimaryGameCovers(client, ids, options);
  if (explicitResult.outcome !== "ok") return explicitResult;
  const explicitByGame = new Map(
    explicitResult.data.flatMap((media) =>
      media.gameId === null ? [] : [[media.gameId, media] as const],
    ),
  );
  const missingIds = ids.filter((id) => !explicitByGame.has(id));
  if (missingIds.length === 0) return gamePresentationResults(ids, explicitByGame);

  const editionsResult = await client
    .from("editions")
    .select("id, game_id, edition_name, region_code, release_date")
    .in("game_id", missingIds);
  if (editionsResult.error !== null) return databaseFailure(editionsResult.error);

  const editionMedia: CatalogMedia[] = [];
  const editionIds = editionsResult.data.map(({ id }) => id);
  for (let offset = 0; offset < editionIds.length; offset += MAX_COVER_TARGETS) {
    const batch = await getPrimaryEditionCovers(
      client,
      editionIds.slice(offset, offset + MAX_COVER_TARGETS),
      options,
    );
    if (batch.outcome !== "ok") return batch;
    editionMedia.push(...batch.data);
  }
  const mediaByEdition = new Map(
    editionMedia.flatMap((media) =>
      media.editionId === null ? [] : [[media.editionId, media] as const],
    ),
  );
  const fallbackByGame = new Map<string, CatalogMedia>();
  for (const gameId of missingIds) {
    const edition = editionsResult.data
      .filter((candidate) => candidate.game_id === gameId && mediaByEdition.has(candidate.id))
      .sort(comparePresentationEditions)[0];
    const media = edition ? mediaByEdition.get(edition.id) : undefined;
    if (media) fallbackByGame.set(gameId, media);
  }

  return gamePresentationResults(ids, new Map([...explicitByGame, ...fallbackByGame]));
}

function gamePresentationResults(
  gameIds: readonly string[],
  mediaByGame: ReadonlyMap<string, CatalogMedia>,
): ReadResult<readonly GamePresentationMedia[]> {
  return {
    outcome: "ok",
    data: gameIds.flatMap((gameId) => {
      const media = mediaByGame.get(gameId);
      return media ? [{ gameId, media }] : [];
    }),
  };
}

function primaryCoverQuery(client: GeekSupabaseClient, options: CatalogMediaReadOptions) {
  return primaryMediaQuery(client, "cover_front", options);
}

function primaryMediaQuery(
  client: GeekSupabaseClient,
  kind: "artwork" | "cover_front",
  options: CatalogMediaReadOptions,
) {
  return client
    .from("catalog_media")
    .select(PRIMARY_MEDIA_COLUMNS)
    .eq("kind", kind)
    .eq("is_primary", true)
    .in("rights_status", catalogMediaRightsForUsageMode(options.usageMode ?? "commercial"));
}

function comparePresentationEditions(
  left: {
    readonly id: string;
    readonly edition_name: string | null;
    readonly region_code: string | null;
    readonly release_date: string | null;
  },
  right: {
    readonly id: string;
    readonly edition_name: string | null;
    readonly region_code: string | null;
    readonly release_date: string | null;
  },
): number {
  return (
    Number(Boolean(left.edition_name?.trim())) - Number(Boolean(right.edition_name?.trim())) ||
    Number(left.release_date === null) - Number(right.release_date === null) ||
    (left.release_date ?? "").localeCompare(right.release_date ?? "", "en") ||
    (left.region_code ?? "").localeCompare(right.region_code ?? "", "en") ||
    left.id.localeCompare(right.id, "en")
  );
}

function boundedDistinctIds(ids: readonly string[]): string[] {
  if (ids.length > MAX_COVER_TARGETS) {
    throw new RangeError(`cover target batch cannot exceed ${MAX_COVER_TARGETS} ids`);
  }
  return [...new Set(ids)];
}
