import {
  getAlbumDetail,
  getAlbums,
  getGamePresentationCovers,
  getEditionComponents,
  getEditionIdentifiers,
  getCopyPhotoGallery,
  getMyCopiesForEdition,
  getPrimaryEditionCovers,
  updateCopyComponentStates,
  updateCopyPrivateDetails,
  type CopyComponentStateInput,
  type CopyPrivateDetailsInput,
  type GamePresentationMedia,
} from "@geek/data";
import type {
  AlbumDetail,
  CatalogMedia,
  Copy,
  EditionComponent,
  EditionIdentifier,
} from "@geek/domain";

import { supabase } from "../lib/supabase";
import { catalogMediaReadOptions } from "../lib/catalog-media-policy";
import { selectAlbumRevealTarget, type AlbumRevealSelection } from "./add-copy-flow";
import { loadCanonicalMarket } from "./canonical-catalog-data";
import type { CanonicalMarketCatalog } from "./canonical-catalog";
import { resolveRevealMediaUrl } from "./presentation-media";

const ALBUM_PAGE_SIZE = 50;
const ALBUM_ENTRY_PAGE_SIZE = 100;

export type AddCopyContext = {
  readonly catalog: CanonicalMarketCatalog;
  readonly components: readonly EditionComponent[];
  readonly identifiers: readonly EditionIdentifier[];
};

export async function loadAddCopyContext(
  gameId: string,
  editionId: string,
): Promise<
  { readonly outcome: "ok"; readonly data: AddCopyContext } | { readonly outcome: "error" }
> {
  const [catalog, components, identifiers] = await Promise.all([
    loadCanonicalMarket(gameId, editionId),
    getEditionComponents(supabase, editionId),
    getEditionIdentifiers(supabase, editionId),
  ]);
  if (catalog.outcome !== "ok" || components.outcome !== "ok" || identifiers.outcome !== "ok") {
    return { outcome: "error" };
  }
  return {
    outcome: "ok",
    data: { catalog: catalog.data, components: components.data, identifiers: identifiers.data },
  };
}

export async function persistCopyEnrichment(
  copyId: string,
  editionId: string,
  privateDetails: CopyPrivateDetailsInput,
  componentStates: readonly CopyComponentStateInput[],
): Promise<boolean> {
  const [details, components] = await Promise.all([
    updateCopyPrivateDetails(supabase, copyId, privateDetails),
    updateCopyComponentStates(supabase, copyId, editionId, componentStates),
  ]);
  return details.outcome === "ok" && components.outcome === "ok";
}

export async function resolveAlbumReveal(
  gameId: string,
  editionId: string,
): Promise<AlbumRevealSelection> {
  const albums = await loadPublishedAlbumDetails();
  return selectAlbumRevealTarget(albums, gameId, editionId);
}

export type RevealAlbumData = {
  readonly album: AlbumDetail;
  readonly artworkByEntryId: Readonly<Record<string, string>>;
};

export async function loadRevealAlbum(albumId: string): Promise<RevealAlbumData | null> {
  const album = await loadCompleteAlbumDetail(albumId);
  if (!album) return null;
  const editionIds = album.entries.flatMap((entry) =>
    entry.target.editionId ? [entry.target.editionId] : [],
  );
  const gameIds = album.entries.map((entry) => entry.target.gameId);
  const [editionMedia, gameMedia] = await Promise.all([
    loadMediaBatches(editionIds, (ids) =>
      getPrimaryEditionCovers(supabase, ids, catalogMediaReadOptions),
    ),
    loadGamePresentationMediaBatches(gameIds),
  ]);
  const editionArtwork = new Map(
    editionMedia.flatMap((media) =>
      media.editionId ? [[media.editionId, media.assetUrl] as const] : [],
    ),
  );
  const gameArtwork = new Map(
    gameMedia.map(({ gameId, media }) => [gameId, media.assetUrl] as const),
  );
  return {
    album,
    artworkByEntryId: Object.fromEntries(
      album.entries.flatMap((entry) => {
        const artwork =
          (entry.target.editionId ? editionArtwork.get(entry.target.editionId) : null) ??
          gameArtwork.get(entry.target.gameId);
        return artwork ? [[entry.id, artwork]] : [];
      }),
    ),
  };
}

export async function loadExactEditionOwnership(
  editionId: string,
): Promise<readonly Copy[] | null> {
  const result = await getMyCopiesForEdition(supabase, editionId);
  return result.outcome === "ok" ? result.data : null;
}

/** Resolves one stable, owner-private reveal image after Copy-photo persistence has finished. */
export type RevealMedia = {
  readonly url: string | null;
  readonly attribution: string | null;
};

export async function loadRevealMedia(
  copyId: string,
  gameId: string,
  editionId: string,
): Promise<RevealMedia> {
  const [photos, editionCover, gameCover] = await Promise.all([
    getCopyPhotoGallery(supabase, copyId),
    getPrimaryEditionCovers(supabase, [editionId], catalogMediaReadOptions),
    getGamePresentationCovers(supabase, [gameId], catalogMediaReadOptions),
  ]);
  if (photos.outcome !== "ok" || editionCover.outcome !== "ok" || gameCover.outcome !== "ok") {
    return { url: null, attribution: null };
  }
  const copyPhotoUrl = photos.data[0]?.signedUrl;
  const catalogMedia = editionCover.data[0] ?? gameCover.data[0]?.media;
  return {
    url:
      resolveRevealMediaUrl({
        copyPhotoUrl,
        editionCatalogUrl: editionCover.data[0]?.assetUrl,
        gameCatalogUrl: gameCover.data[0]?.media.assetUrl,
      }) ?? null,
    attribution: copyPhotoUrl ? null : (catalogMedia?.attribution ?? null),
  };
}

async function loadPublishedAlbumDetails(): Promise<readonly AlbumDetail[]> {
  const albumIds: string[] = [];
  for (let offset = 0; ; offset += ALBUM_PAGE_SIZE) {
    const page = await getAlbums(supabase, { limit: ALBUM_PAGE_SIZE, offset });
    if (page.outcome !== "ok") throw new Error("Published Albums could not be loaded");
    albumIds.push(...page.data.items.map((album) => album.id));
    if (page.data.items.length < ALBUM_PAGE_SIZE) break;
  }

  const details = await Promise.all(albumIds.map(loadCompleteAlbumDetail));
  return details.filter((album): album is AlbumDetail => album !== null);
}

async function loadCompleteAlbumDetail(albumId: string): Promise<AlbumDetail | null> {
  let combined: AlbumDetail | null = null;
  for (let offset = 0; ; offset += ALBUM_ENTRY_PAGE_SIZE) {
    const page = await getAlbumDetail(supabase, albumId, {
      limit: ALBUM_ENTRY_PAGE_SIZE,
      offset,
    });
    if (page.outcome === "not_found") return null;
    if (page.outcome !== "ok") throw new Error("Album detail could not be loaded");
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
    if (detail.entries.length < ALBUM_ENTRY_PAGE_SIZE) break;
  }
  return combined;
}

async function loadMediaBatches(
  ids: readonly string[],
  load: (
    ids: readonly string[],
  ) => Promise<
    | { readonly outcome: "ok"; readonly data: readonly CatalogMedia[] }
    | { readonly outcome: "invalid_data" | "failed" }
  >,
): Promise<readonly CatalogMedia[]> {
  const media: CatalogMedia[] = [];
  const uniqueIds = [...new Set(ids)];
  for (let offset = 0; offset < uniqueIds.length; offset += 100) {
    const result = await load(uniqueIds.slice(offset, offset + 100));
    if (result.outcome !== "ok") throw new Error("Album artwork could not be loaded");
    media.push(...result.data);
  }
  return media;
}

async function loadGamePresentationMediaBatches(
  ids: readonly string[],
): Promise<readonly GamePresentationMedia[]> {
  const media: GamePresentationMedia[] = [];
  const uniqueIds = [...new Set(ids)];
  for (let offset = 0; offset < uniqueIds.length; offset += 100) {
    const result = await getGamePresentationCovers(
      supabase,
      uniqueIds.slice(offset, offset + 100),
      catalogMediaReadOptions,
    );
    if (result.outcome !== "ok") throw new Error("Album artwork could not be loaded");
    media.push(...result.data);
  }
  return media;
}
