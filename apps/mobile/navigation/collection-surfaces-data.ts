import {
  addWishlistIntent,
  getAlbumDetail,
  getAlbums,
  getEditionsByIds,
  getGamePresentationCovers,
  getGamesByIds,
  getMyCollection,
  getMyPrimaryCopyPhotos,
  getMyWishlistIntents,
  getPlatformsByIds,
  getPrimaryEditionCovers,
  removeWishlistIntent,
  type CollectionEntry,
  type GamePresentationMedia,
  type MyWishlistIntent,
} from "@geek/data";
import type {
  AlbumDetail,
  AlbumSummary,
  CatalogMedia,
  Edition,
  Game,
  Platform,
} from "@geek/domain";
import type { ImageSourcePropType } from "react-native";

import { supabase } from "../lib/supabase";
import { catalogMediaReadOptions } from "../lib/catalog-media-policy";
import type { GridItem } from "../ui/game-grid-item";
import {
  resolveAlbumMedia,
  resolveWishlistMedia,
  type PresentationMedia,
} from "./presentation-media";
import { isWishlistTargetOwned, selectUnambiguousCopyId } from "./collection-surface-rules";
import { loadOptionalCopyTilePresentations } from "./copy-tile-data";
import { selectAlbumCopyTilePresentation } from "./copy-tile-presentation";

const PAGE_SIZE = 100;

export type CanonicalWishlistItem = Omit<GridItem, "image"> & {
  readonly intentId: string;
  readonly exactEdition: boolean;
  readonly image?: ImageSourcePropType;
  readonly owned: boolean;
  readonly mediaAttribution?: string;
};

export type CanonicalAlbumEntryItem = Omit<GridItem, "copyId" | "image"> & {
  readonly entryId: string;
  readonly image?: ImageSourcePropType;
  readonly owned: boolean;
  readonly wanted: boolean;
  readonly position: number;
  readonly opportunities: number;
  readonly mediaAttribution?: string;
};

export type CanonicalAlbumDetail = {
  readonly album: AlbumDetail;
  readonly items: readonly CanonicalAlbumEntryItem[];
};

export type SurfaceLoadResult<T> =
  | { readonly outcome: "ok"; readonly data: T }
  | { readonly outcome: "unauthenticated" | "error" | "not_found" };

export async function loadCanonicalWishlist(): Promise<
  SurfaceLoadResult<readonly CanonicalWishlistItem[]>
> {
  const [intentsResult, collectionResult] = await Promise.all([
    getMyWishlistIntents(supabase),
    loadCompleteCollection(),
  ]);
  if (intentsResult.outcome === "unauthenticated") return intentsResult;
  if (intentsResult.outcome !== "ok" || collectionResult.outcome !== "ok") {
    return { outcome: "error" };
  }

  const active = intentsResult.data.filter(({ intent }) => intent.status === "active");
  const gameIds = distinct(active.map(({ intent }) => intent.gameId));
  const editionIds = distinct(
    active.flatMap(({ intent }) => (intent.editionId ? [intent.editionId] : [])),
  );
  const [gamesResult, editionsResult, editionMedia, gameMedia] = await Promise.all([
    loadBatches(gameIds, (ids) => getGamesByIds(supabase, ids)),
    loadBatches(editionIds, (ids) => getEditionsByIds(supabase, ids)),
    loadMediaBatches(editionIds, (ids) =>
      getPrimaryEditionCovers(supabase, ids, catalogMediaReadOptions),
    ),
    loadGamePresentationMediaBatches(gameIds),
  ]);
  if (!gamesResult || !editionsResult || !editionMedia || !gameMedia) {
    return { outcome: "error" };
  }
  const platformIds = distinct(editionsResult.map((edition) => edition.platformId));
  const platformsResult = await loadBatches(platformIds, (ids) => getPlatformsByIds(supabase, ids));
  if (!platformsResult) return { outcome: "error" };

  const games = byId(gamesResult);
  const editions = byId(editionsResult);
  const platforms = byId(platformsResult);
  const editionArtwork = mediaByTarget(editionMedia, "edition");
  const gameArtwork = gamePresentationMediaByTarget(gameMedia);

  const items: CanonicalWishlistItem[] = [];
  for (const record of active) {
    const item = toWishlistItem(
      record,
      games,
      editions,
      platforms,
      collectionResult.data,
      editionArtwork,
      gameArtwork,
    );
    if (item) items.push(item);
  }
  return { outcome: "ok", data: items };
}

export async function toggleWishlistIntent(input: {
  readonly gameId: string;
  readonly editionId?: string;
  readonly intentId?: string;
}): Promise<boolean> {
  const result = input.intentId
    ? await removeWishlistIntent(supabase, input.intentId)
    : await addWishlistIntent(supabase, {
        gameId: input.gameId,
        ...(input.editionId ? { editionId: input.editionId } : {}),
      });
  return result.outcome === "ok";
}

export async function findActiveWishlistIntent(
  gameId: string,
  editionId?: string,
): Promise<string | null | undefined> {
  const result = await getMyWishlistIntents(supabase);
  if (result.outcome !== "ok") return undefined;
  const found = result.data.find(
    ({ intent }) =>
      intent.status === "active" &&
      intent.gameId === gameId &&
      intent.editionId === (editionId ?? null),
  );
  return found?.intent.id ?? null;
}

export async function loadCanonicalAlbums(): Promise<SurfaceLoadResult<readonly AlbumSummary[]>> {
  const albums: AlbumSummary[] = [];
  for (let offset = 0; ; offset += 50) {
    const page = await getAlbums(supabase, { limit: 50, offset });
    if (page.outcome === "unauthenticated") return page;
    if (page.outcome !== "ok") return { outcome: "error" };
    albums.push(...page.data.items);
    if (page.data.items.length < 50) break;
  }
  return { outcome: "ok", data: albums };
}

export async function loadCanonicalAlbumDetail(
  albumId: string,
): Promise<SurfaceLoadResult<CanonicalAlbumDetail>> {
  const [albumResult, collectionResult] = await Promise.all([
    loadCompleteAlbum(albumId),
    loadCompleteCollection(),
  ]);
  if (albumResult.outcome !== "ok" || collectionResult.outcome !== "ok") {
    return albumResult.outcome === "not_found" ? albumResult : { outcome: "error" };
  }
  const album = albumResult.data;
  const editionIds = distinct(
    album.entries.flatMap(({ target }) => (target.editionId ? [target.editionId] : [])),
  );
  const gameIds = distinct(album.entries.map(({ target }) => target.gameId));
  const matchesByEntry = new Map(
    album.entries.map((entry) => [
      entry.id,
      collectionResult.data.filter(({ copy }) =>
        entry.target.editionId
          ? copy.editionId === entry.target.editionId
          : copy.gameId === entry.target.gameId,
      ),
    ]),
  );
  const unambiguousCopyIds = distinct(
    [...matchesByEntry.values()].flatMap((matches) => {
      const copyId = selectUnambiguousCopyId(matches.map(({ copy }) => copy.id));
      return copyId ? [copyId] : [];
    }),
  );
  const [editionMedia, gameMedia, photos, tilePresentations] = await Promise.all([
    loadMediaBatches(editionIds, (ids) =>
      getPrimaryEditionCovers(supabase, ids, catalogMediaReadOptions),
    ),
    loadGamePresentationMediaBatches(gameIds),
    loadPrimaryPhotoBatches(unambiguousCopyIds),
    loadOptionalCopyTilePresentations(unambiguousCopyIds),
  ]);
  if (!editionMedia || !gameMedia || !photos) {
    return { outcome: "error" };
  }

  const editionArtwork = mediaByTarget(editionMedia, "edition");
  const gameArtwork = gamePresentationMediaByTarget(gameMedia);
  const items = album.entries
    .slice()
    .sort((left, right) => left.position - right.position || left.id.localeCompare(right.id))
    .map((entry): CanonicalAlbumEntryItem => {
      const matches = matchesByEntry.get(entry.id) ?? [];
      const copyId = selectUnambiguousCopyId(matches.map(({ copy }) => copy.id));
      const tilePresentation = selectAlbumCopyTilePresentation(
        matches.map(({ copy }) => copy.id),
        tilePresentations,
      );
      const copyPhotoUrl = copyId ? photos.get(copyId) : undefined;
      const catalogMedia =
        (entry.target.editionId ? editionArtwork.get(entry.target.editionId) : undefined) ??
        gameArtwork.get(entry.target.gameId);
      const media: PresentationMedia = {
        copyPhotoUrl,
        editionCatalogUrl: entry.target.editionId
          ? editionArtwork.get(entry.target.editionId)?.assetUrl
          : undefined,
        gameCatalogUrl: gameArtwork.get(entry.target.gameId)?.assetUrl,
      };
      return {
        entryId: entry.id,
        gameId: entry.target.gameId,
        ...(entry.target.editionId ? { editionId: entry.target.editionId } : {}),
        title: entry.target.gameTitle,
        platform: entry.target.kind === "edition" ? entry.target.platformName : "Toutes éditions",
        regionCode: entry.target.kind === "edition" ? entry.target.regionCode : null,
        image: resolveAlbumMedia(media, matches.length),
        owned: entry.state.owned,
        wanted: entry.state.wanted,
        position: entry.position,
        opportunities: entry.network.activeListingCount,
        ...(tilePresentation?.salePrice
          ? { overlay: "sale" as const, salePrice: tilePresentation.salePrice }
          : {}),
        photoRoles: tilePresentation?.photoRoles ?? [],
        ...(matches.length === 1 && copyPhotoUrl
          ? {}
          : catalogMedia?.attribution
            ? { mediaAttribution: catalogMedia.attribution }
            : {}),
      };
    });
  return { outcome: "ok", data: { album, items } };
}

async function loadCompleteCollection(): Promise<SurfaceLoadResult<readonly CollectionEntry[]>> {
  const entries: CollectionEntry[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await getMyCollection(supabase, { limit: PAGE_SIZE, offset });
    if (page.outcome === "unauthenticated") return page;
    if (page.outcome !== "ok") return { outcome: "error" };
    entries.push(...page.data.items);
    if (page.data.items.length < PAGE_SIZE) break;
  }
  return { outcome: "ok", data: entries };
}

async function loadCompleteAlbum(albumId: string): Promise<SurfaceLoadResult<AlbumDetail>> {
  let combined: AlbumDetail | null = null;
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await getAlbumDetail(supabase, albumId, { limit: PAGE_SIZE, offset });
    if (page.outcome === "not_found") return page;
    if (page.outcome === "unauthenticated") return page;
    if (page.outcome !== "ok") return { outcome: "error" };
    const detail: AlbumDetail = {
      id: page.data.id,
      slug: page.data.slug,
      title: page.data.title,
      description: page.data.description,
      targetKind: page.data.targetKind,
      progress: page.data.progress,
      entries: page.data.entries,
    };
    combined = combined ? { ...detail, entries: [...combined.entries, ...detail.entries] } : detail;
    if (detail.entries.length < PAGE_SIZE) break;
  }
  return combined ? { outcome: "ok", data: combined } : { outcome: "not_found" };
}

function toWishlistItem(
  record: MyWishlistIntent,
  games: ReadonlyMap<string, Game>,
  editions: ReadonlyMap<string, Edition>,
  platforms: ReadonlyMap<string, Platform>,
  collection: readonly CollectionEntry[],
  editionArtwork: ReadonlyMap<string, CatalogMedia>,
  gameArtwork: ReadonlyMap<string, CatalogMedia>,
): CanonicalWishlistItem | null {
  const { intent } = record;
  const game = games.get(intent.gameId);
  if (!game) return null;
  const edition = intent.editionId ? editions.get(intent.editionId) : undefined;
  if (intent.editionId && !edition) return null;
  const platform = edition ? platforms.get(edition.platformId) : undefined;
  const exactEdition = Boolean(edition);
  const catalogMedia =
    (edition ? editionArtwork.get(edition.id) : undefined) ?? gameArtwork.get(game.id);
  return {
    intentId: intent.id,
    gameId: game.id,
    ...(edition ? { editionId: edition.id } : {}),
    title: game.canonicalTitle,
    platform: platform?.name ?? "Toutes les éditions",
    regionCode: edition?.regionCode ?? null,
    exactEdition,
    owned: isWishlistTargetOwned(
      { gameId: game.id, editionId: edition?.id ?? null },
      collection.map(({ copy }) => copy),
    ),
    image: resolveWishlistMedia(
      {
        editionCatalogUrl: edition ? editionArtwork.get(edition.id)?.assetUrl : undefined,
        gameCatalogUrl: gameArtwork.get(game.id)?.assetUrl,
      },
      exactEdition,
    ),
    ...(catalogMedia?.attribution ? { mediaAttribution: catalogMedia.attribution } : {}),
  };
}

async function loadBatches<T>(
  ids: readonly string[],
  load: (
    ids: readonly string[],
  ) => Promise<{ readonly outcome: string; readonly data?: readonly T[] }>,
): Promise<readonly T[] | null> {
  const values: T[] = [];
  for (let offset = 0; offset < ids.length; offset += PAGE_SIZE) {
    const result = await load(ids.slice(offset, offset + PAGE_SIZE));
    if (result.outcome !== "ok" || !result.data) return null;
    values.push(...result.data);
  }
  return values;
}

async function loadMediaBatches(
  ids: readonly string[],
  load: (
    ids: readonly string[],
  ) => Promise<{ readonly outcome: string; readonly data?: readonly CatalogMedia[] }>,
): Promise<readonly CatalogMedia[] | null> {
  return loadBatches(ids, load);
}

async function loadGamePresentationMediaBatches(
  ids: readonly string[],
): Promise<readonly GamePresentationMedia[] | null> {
  const values: GamePresentationMedia[] = [];
  for (let offset = 0; offset < ids.length; offset += PAGE_SIZE) {
    const result = await getGamePresentationCovers(
      supabase,
      ids.slice(offset, offset + PAGE_SIZE),
      catalogMediaReadOptions,
    );
    if (result.outcome !== "ok") return null;
    values.push(...result.data);
  }
  return values;
}

async function loadPrimaryPhotoBatches(
  copyIds: readonly string[],
): Promise<ReadonlyMap<string, string> | null> {
  const result = new Map<string, string>();
  for (let offset = 0; offset < copyIds.length; offset += PAGE_SIZE) {
    const page = await getMyPrimaryCopyPhotos(supabase, copyIds.slice(offset, offset + PAGE_SIZE));
    if (page.outcome !== "ok") return null;
    for (const { photo, signedUrl } of page.data) result.set(photo.copyId, signedUrl);
  }
  return result;
}

function mediaByTarget(
  media: readonly CatalogMedia[],
  target: "edition" | "game",
): ReadonlyMap<string, CatalogMedia> {
  return new Map(
    media.flatMap((item) => {
      const id = target === "edition" ? item.editionId : item.gameId;
      return id ? [[id, item] as const] : [];
    }),
  );
}

function gamePresentationMediaByTarget(
  media: readonly GamePresentationMedia[],
): ReadonlyMap<string, CatalogMedia> {
  return new Map(media.map(({ gameId, media: item }) => [gameId, item]));
}

function byId<T extends { readonly id: string }>(values: readonly T[]): ReadonlyMap<string, T> {
  return new Map(values.map((value) => [value.id, value]));
}

function distinct(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}
