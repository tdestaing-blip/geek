import {
  getGamePresentationCover,
  getMyCopyDetail,
  getCopyPhotoGallery,
  getPrimaryEditionCover,
  getPrimaryGameArtwork,
  type CopyPhotoRead,
  type MyCopyDetail,
} from "@geek/data";
import type { ImageSourcePropType } from "react-native";

import { supabase } from "../lib/supabase";
import { catalogMediaReadOptions } from "../lib/catalog-media-policy";
import { resolveCatalogMedia } from "./presentation-media";

export type CanonicalCopyDetail = {
  readonly detail: MyCopyDetail;
  /** Catalog artwork only. This is never represented as a photo of the owned Copy. */
  readonly catalogArtwork: ImageSourcePropType | null;
  /** Rights-safe editorial artwork for AboutGameCard, falling back to the catalog cover. */
  readonly aboutArtwork: ImageSourcePropType | null;
  readonly mediaAttributions: readonly string[];
  readonly photos: readonly CopyPhotoRead[];
};

export type CanonicalCopyDetailResult =
  | { readonly outcome: "ok"; readonly data: CanonicalCopyDetail }
  | { readonly outcome: "not_found" }
  | { readonly outcome: "error" };

export async function loadCanonicalCopyDetail(copyId: string): Promise<CanonicalCopyDetailResult> {
  const [result, photoResult] = await Promise.all([
    getMyCopyDetail(supabase, copyId),
    getCopyPhotoGallery(supabase, copyId),
  ]);

  if (result.outcome === "not_found") return result;
  if (result.outcome !== "ok") return { outcome: "error" };
  if (photoResult.outcome !== "ok") return { outcome: "error" };

  const [editionCover, gameCover, gameArtwork] = await Promise.all([
    result.data.edition
      ? getPrimaryEditionCover(supabase, result.data.edition.id, catalogMediaReadOptions)
      : Promise.resolve({ outcome: "ok" as const, data: null }),
    getGamePresentationCover(supabase, result.data.game.id, catalogMediaReadOptions),
    getPrimaryGameArtwork(supabase, result.data.game.id, catalogMediaReadOptions),
  ]);

  const editionMedia = editionCover.outcome === "ok" ? editionCover.data : null;
  const gameMedia = gameCover.outcome === "ok" ? gameCover.data?.media : null;
  const artworkMedia = gameArtwork.outcome === "ok" ? gameArtwork.data : null;
  const selectedCatalogMedia = editionMedia ?? gameMedia;
  const catalogArtwork =
    resolveCatalogMedia({
      editionCatalogUrl: editionMedia?.assetUrl,
      gameCatalogUrl: gameMedia?.assetUrl,
    }) ?? null;

  return {
    outcome: "ok",
    data: {
      detail: result.data,
      catalogArtwork,
      aboutArtwork: (artworkMedia ? { uri: artworkMedia.assetUrl } : catalogArtwork) ?? null,
      mediaAttributions: [selectedCatalogMedia?.attribution, artworkMedia?.attribution].filter(
        (value): value is string => Boolean(value),
      ),
      photos: photoResult.data,
    },
  };
}
