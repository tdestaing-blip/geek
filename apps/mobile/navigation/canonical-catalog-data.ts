import {
  getEdition,
  getEditionsForGame,
  getEditionsForPlatform,
  getGamePresentationCover,
  getGamePresentationCovers,
  getGame,
  getPlatform,
  getPlatforms,
  getPrimaryEditionCover,
  getPrimaryEditionCovers,
  getPrimaryGameArtwork,
  searchCatalog,
  type GamePresentationMedia,
} from "@geek/data";
import type { CatalogMedia, Edition, Game, Platform } from "@geek/domain";

import { supabase } from "../lib/supabase";
import { catalogMediaReadOptions } from "../lib/catalog-media-policy";
import {
  buildGamePlatformResults,
  buildGameRegionVariants,
  resolveCanonicalMarket,
  type CanonicalMarketCatalog,
  type GamePlatformSearchResult,
  type GameRegionVariant,
} from "./canonical-catalog";

export type CatalogLoadResult<T> =
  | { readonly outcome: "ok"; readonly data: T }
  | { readonly outcome: "not_found" }
  | { readonly outcome: "error" };

export type CanonicalPlatformCatalog = {
  readonly platform: Platform;
  readonly results: readonly GamePlatformSearchResult[];
};

export type CanonicalGameRegions = {
  readonly game: Game;
  readonly platform: Platform;
  readonly variants: readonly GameRegionVariant[];
};

export async function loadCanonicalPlatforms(): Promise<CatalogLoadResult<readonly Platform[]>> {
  const result = await getPlatforms(supabase, { limit: 100 });
  return result.outcome === "ok"
    ? { outcome: "ok", data: result.data.items }
    : { outcome: "error" };
}

export async function searchCanonicalGamePlatforms(
  query: string,
): Promise<CatalogLoadResult<readonly GamePlatformSearchResult[]>> {
  const search = await searchCatalog(supabase, query, { limit: 50 });
  if (search.outcome !== "ok") return { outcome: "error" };

  const gameIds = [...new Set(search.data.items.map((result) => result.gameId))];
  const gamesResult = await Promise.all(gameIds.map((gameId) => getGame(supabase, gameId)));
  if (gamesResult.some((result) => result.outcome !== "ok")) return { outcome: "error" };
  const games = gamesResult.flatMap((result) => (result.outcome === "ok" ? [result.data] : []));

  const editionsResult = await Promise.all(gameIds.map(loadAllEditionsForGame));
  if (editionsResult.some((result) => result.outcome !== "ok")) return { outcome: "error" };
  const editions = editionsResult.flatMap((result) => (result.outcome === "ok" ? result.data : []));
  return buildCatalogProjection(games, editions);
}

export async function loadCanonicalPlatformCatalog(
  platformId: string,
): Promise<CatalogLoadResult<CanonicalPlatformCatalog>> {
  const platformResult = await getPlatform(supabase, platformId);
  if (platformResult.outcome === "not_found") return { outcome: "not_found" };
  if (platformResult.outcome !== "ok") return { outcome: "error" };

  const editionsResult = await loadAllEditionsForPlatform(platformId);
  if (editionsResult.outcome !== "ok") return { outcome: "error" };
  const gameIds = [...new Set(editionsResult.data.map((edition) => edition.gameId))];
  const gamesResult = await Promise.all(gameIds.map((gameId) => getGame(supabase, gameId)));
  if (gamesResult.some((result) => result.outcome !== "ok")) return { outcome: "error" };
  const games = gamesResult.flatMap((result) => (result.outcome === "ok" ? [result.data] : []));
  const projection = await buildCatalogProjection(games, editionsResult.data);
  if (projection.outcome !== "ok") return projection;
  return { outcome: "ok", data: { platform: platformResult.data, results: projection.data } };
}

export async function loadCanonicalGameRegions(
  gameId: string,
  platformId: string,
): Promise<CatalogLoadResult<CanonicalGameRegions>> {
  const [gameResult, platformResult, editionsResult] = await Promise.all([
    getGame(supabase, gameId),
    getPlatform(supabase, platformId),
    loadAllEditionsForGame(gameId),
  ]);
  if (gameResult.outcome === "not_found" || platformResult.outcome === "not_found") {
    return { outcome: "not_found" };
  }
  if (
    gameResult.outcome !== "ok" ||
    platformResult.outcome !== "ok" ||
    editionsResult.outcome !== "ok"
  )
    return { outcome: "error" };
  const editions = editionsResult.data.filter((edition) => edition.platformId === platformId);
  const [editionCovers, gameCover] = await Promise.all([
    loadPrimaryEditionCovers(editions.map((edition) => edition.id)),
    getGamePresentationCover(supabase, gameId, catalogMediaReadOptions),
  ]);
  if (editionCovers.outcome !== "ok" || gameCover.outcome !== "ok") return { outcome: "error" };
  return {
    outcome: "ok",
    data: {
      game: gameResult.data,
      platform: platformResult.data,
      variants: buildGameRegionVariants(
        gameResult.data,
        platformResult.data,
        editions,
        editionCovers.data,
        gameCover.data?.media ?? null,
      ),
    },
  };
}

export async function loadCanonicalMarket(
  gameId: string,
  editionId: string,
): Promise<CatalogLoadResult<CanonicalMarketCatalog>> {
  const [gameResult, editionResult] = await Promise.all([
    getGame(supabase, gameId),
    getEdition(supabase, editionId),
  ]);
  if (gameResult.outcome === "not_found" || editionResult.outcome === "not_found") {
    return { outcome: "not_found" };
  }
  if (gameResult.outcome !== "ok" || editionResult.outcome !== "ok") return { outcome: "error" };
  const [platformResult, editionCover, gameCover, gameArtwork] = await Promise.all([
    getPlatform(supabase, editionResult.data.platformId),
    getPrimaryEditionCover(supabase, editionId, catalogMediaReadOptions),
    getGamePresentationCover(supabase, gameId, catalogMediaReadOptions),
    getPrimaryGameArtwork(supabase, gameId, catalogMediaReadOptions),
  ]);
  if (platformResult.outcome === "not_found") return { outcome: "not_found" };
  if (
    platformResult.outcome !== "ok" ||
    editionCover.outcome !== "ok" ||
    gameCover.outcome !== "ok" ||
    gameArtwork.outcome !== "ok"
  )
    return { outcome: "error" };
  const data = resolveCanonicalMarket(
    gameResult.data,
    editionResult.data,
    platformResult.data,
    editionCover.data,
    gameCover.data?.media ?? null,
    gameArtwork.data,
  );
  return data ? { outcome: "ok", data } : { outcome: "not_found" };
}

async function buildCatalogProjection(
  games: readonly Game[],
  editions: readonly Edition[],
): Promise<CatalogLoadResult<readonly GamePlatformSearchResult[]>> {
  const platformIds = [...new Set(editions.map((edition) => edition.platformId))];
  const [platformResults, covers] = await Promise.all([
    Promise.all(platformIds.map((platformId) => getPlatform(supabase, platformId))),
    loadPrimaryGameCovers(games.map((game) => game.id)),
  ]);
  if (platformResults.some((result) => result.outcome !== "ok") || covers.outcome !== "ok") {
    return { outcome: "error" };
  }
  const platforms = platformResults.flatMap((result) =>
    result.outcome === "ok" ? [result.data] : [],
  );
  return { outcome: "ok", data: buildGamePlatformResults(games, editions, platforms, covers.data) };
}

async function loadPrimaryGameCovers(
  gameIds: readonly string[],
): Promise<CatalogLoadResult<readonly GamePresentationMedia[]>> {
  return loadPresentationCoverBatches(gameIds);
}

async function loadPrimaryEditionCovers(
  editionIds: readonly string[],
): Promise<CatalogLoadResult<readonly CatalogMedia[]>> {
  return loadCoverBatches(editionIds, (ids) =>
    getPrimaryEditionCovers(supabase, ids, catalogMediaReadOptions),
  );
}

async function loadPresentationCoverBatches(
  ids: readonly string[],
): Promise<CatalogLoadResult<readonly GamePresentationMedia[]>> {
  const covers: GamePresentationMedia[] = [];
  for (let index = 0; index < ids.length; index += 100) {
    const batch = await getGamePresentationCovers(
      supabase,
      ids.slice(index, index + 100),
      catalogMediaReadOptions,
    );
    if (batch.outcome !== "ok") return { outcome: "error" };
    covers.push(...batch.data);
  }
  return { outcome: "ok", data: covers };
}

async function loadCoverBatches(
  ids: readonly string[],
  getBatch: (
    ids: readonly string[],
  ) => Promise<
    | { readonly outcome: "ok"; readonly data: readonly CatalogMedia[] }
    | { readonly outcome: "invalid_data" | "failed" }
  >,
): Promise<CatalogLoadResult<readonly CatalogMedia[]>> {
  const covers: CatalogMedia[] = [];
  for (let index = 0; index < ids.length; index += 100) {
    const batch = await getBatch(ids.slice(index, index + 100));
    if (batch.outcome !== "ok") return { outcome: "error" };
    covers.push(...batch.data);
  }
  return { outcome: "ok", data: covers };
}

async function loadAllEditionsForGame(
  gameId: string,
): Promise<CatalogLoadResult<readonly Edition[]>> {
  return loadAllEditions((offset) => getEditionsForGame(supabase, gameId, { limit: 100, offset }));
}

async function loadAllEditionsForPlatform(
  platformId: string,
): Promise<CatalogLoadResult<readonly Edition[]>> {
  return loadAllEditions((offset) =>
    getEditionsForPlatform(supabase, platformId, { limit: 100, offset }),
  );
}

async function loadAllEditions(
  getPage: (
    offset: number,
  ) => Promise<
    | { readonly outcome: "ok"; readonly data: { readonly items: readonly Edition[] } }
    | { readonly outcome: "invalid_data" | "failed" }
  >,
): Promise<CatalogLoadResult<readonly Edition[]>> {
  const editions: Edition[] = [];
  for (let offset = 0; ; offset += 100) {
    const page = await getPage(offset);
    if (page.outcome !== "ok") return { outcome: "error" };
    editions.push(...page.data.items);
    if (page.data.items.length < 100) return { outcome: "ok", data: editions };
  }
}
