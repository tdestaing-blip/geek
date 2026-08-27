import type { CatalogMedia } from "@geek/domain";
import {
  getGamePresentationCovers,
  getMyCollection,
  getMyPrimaryCopyPhotos,
  getPrimaryEditionCovers,
  type CollectionEntry,
  type GamePresentationMedia,
} from "@geek/data";
import type { ImageSourcePropType } from "react-native";

import { supabase } from "../lib/supabase";
import { catalogMediaReadOptions } from "../lib/catalog-media-policy";
import type { GridItem } from "../ui/game-grid-item";
import { loadOptionalCopyTilePresentations } from "./copy-tile-data";
import type { CopyTilePresentation } from "./copy-tile-presentation";
import { resolveOwnedCopyMedia } from "./presentation-media";

const COLLECTION_PAGE_SIZE = 100;

export type CanonicalCollectionItem = Omit<GridItem, "copyId" | "editionId" | "image"> & {
  readonly copyId: string;
  readonly editionId?: string;
  readonly image?: ImageSourcePropType;
  readonly mediaAttribution?: string;
};

export type CanonicalCollection = {
  readonly entries: readonly CollectionEntry[];
  readonly items: readonly CanonicalCollectionItem[];
};

export type CanonicalCollectionLoadResult =
  | { readonly outcome: "ok"; readonly data: CanonicalCollection }
  | { readonly outcome: "unauthenticated" }
  | { readonly outcome: "error" };

/** Loads the complete current Collection and adapts it for the existing two-column grid. */
export async function loadCanonicalCollection(): Promise<CanonicalCollectionLoadResult> {
  const entries: CollectionEntry[] = [];

  for (let offset = 0; ; offset += COLLECTION_PAGE_SIZE) {
    const result = await getMyCollection(supabase, { limit: COLLECTION_PAGE_SIZE, offset });

    if (result.outcome === "unauthenticated") return result;
    if (result.outcome !== "ok") return { outcome: "error" };

    entries.push(...result.data.items);
    if (result.data.items.length < COLLECTION_PAGE_SIZE) break;
  }

  const [covers, photos, tilePresentations] = await Promise.all([
    loadPrimaryCovers(entries),
    loadPrimaryPhotos(entries.map(({ copy }) => copy.id)),
    loadOptionalCopyTilePresentations(entries.map(({ copy }) => copy.id)),
  ]);
  return {
    outcome: "ok",
    data: {
      entries,
      items: toCollectionItems(entries, covers, photos, tilePresentations),
    },
  };
}

function toCollectionItems(
  entries: readonly CollectionEntry[],
  covers: ReadonlyMap<string, CatalogMedia>,
  photos: ReadonlyMap<string, string>,
  tilePresentations: ReadonlyMap<string, CopyTilePresentation>,
): readonly CanonicalCollectionItem[] {
  return entries.map(({ copy, edition, game, platform }) => {
    const copyPhotoUrl = photos.get(copy.id);
    const editionMedia = covers.get(edition?.id ?? "");
    const gameMedia = covers.get(game.id);
    const catalogMedia = editionMedia ?? gameMedia;
    const tilePresentation = tilePresentations.get(copy.id);
    return {
      copyId: copy.id,
      editionId: copy.editionId ?? undefined,
      gameId: copy.gameId,
      image: resolveOwnedCopyMedia({
        copyPhotoUrl,
        editionCatalogUrl: editionMedia?.assetUrl,
        gameCatalogUrl: gameMedia?.assetUrl,
      }),
      ...(copyPhotoUrl || !catalogMedia?.attribution
        ? {}
        : { mediaAttribution: catalogMedia.attribution }),
      platform: platform?.name ?? "Édition à préciser",
      regionCode: edition?.regionCode ?? null,
      title: game.canonicalTitle,
      ...(tilePresentation?.salePrice
        ? { overlay: "sale" as const, salePrice: tilePresentation.salePrice }
        : {}),
      photoRoles: tilePresentation?.photoRoles ?? [],
    };
  });
}

async function loadPrimaryPhotos(copyIds: readonly string[]): Promise<ReadonlyMap<string, string>> {
  const photos = new Map<string, string>();
  for (let offset = 0; offset < copyIds.length; offset += COLLECTION_PAGE_SIZE) {
    const result = await getMyPrimaryCopyPhotos(
      supabase,
      copyIds.slice(offset, offset + COLLECTION_PAGE_SIZE),
    );
    if (result.outcome !== "ok") continue;
    for (const { photo, signedUrl } of result.data) photos.set(photo.copyId, signedUrl);
  }
  return photos;
}

async function loadPrimaryCovers(
  entries: readonly CollectionEntry[],
): Promise<ReadonlyMap<string, CatalogMedia>> {
  const editionIds = distinct(entries.flatMap(({ edition }) => (edition ? [edition.id] : [])));
  const gameIds = distinct(entries.map(({ game }) => game.id));
  const [editionMedia, gameMedia] = await Promise.all([
    loadCoverBatches(editionIds, (client, ids) =>
      getPrimaryEditionCovers(client, ids, catalogMediaReadOptions),
    ),
    loadGamePresentationCoverBatches(gameIds),
  ]);

  const covers = new Map<string, CatalogMedia>();
  for (const { gameId, media } of gameMedia) covers.set(gameId, media);
  for (const media of editionMedia) {
    const targetId = media.editionId ?? media.gameId;
    if (targetId) covers.set(targetId, media);
  }
  return covers;
}

async function loadGamePresentationCoverBatches(
  ids: readonly string[],
): Promise<readonly GamePresentationMedia[]> {
  const media: GamePresentationMedia[] = [];
  for (let offset = 0; offset < ids.length; offset += COLLECTION_PAGE_SIZE) {
    const result = await getGamePresentationCovers(
      supabase,
      ids.slice(offset, offset + COLLECTION_PAGE_SIZE),
      catalogMediaReadOptions,
    );
    if (result.outcome === "ok") media.push(...result.data);
  }
  return media;
}

async function loadCoverBatches(
  ids: readonly string[],
  load: (
    client: typeof supabase,
    targetIds: readonly string[],
  ) => ReturnType<typeof getPrimaryEditionCovers>,
): Promise<readonly CatalogMedia[]> {
  const media: CatalogMedia[] = [];
  for (let offset = 0; offset < ids.length; offset += COLLECTION_PAGE_SIZE) {
    const result = await load(supabase, ids.slice(offset, offset + COLLECTION_PAGE_SIZE));
    if (result.outcome === "ok") media.push(...result.data);
  }
  return media;
}

function distinct(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}
