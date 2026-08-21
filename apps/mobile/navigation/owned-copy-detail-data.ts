import {
  getMyCopyDetail,
  getPrimaryEditionCover,
  getPrimaryGameCover,
  type MyCopyDetail,
} from "@geek/data";
import type { ImageSourcePropType } from "react-native";

import { supabase } from "../lib/supabase";

export type CanonicalCopyDetail = {
  readonly detail: MyCopyDetail;
  /** Catalog artwork only. This is never represented as a photo of the owned Copy. */
  readonly catalogArtwork: ImageSourcePropType | null;
};

export type CanonicalCopyDetailResult =
  | { readonly outcome: "ok"; readonly data: CanonicalCopyDetail }
  | { readonly outcome: "not_found" }
  | { readonly outcome: "error" };

export async function loadCanonicalCopyDetail(copyId: string): Promise<CanonicalCopyDetailResult> {
  const result = await getMyCopyDetail(supabase, copyId);

  if (result.outcome === "not_found") return result;
  if (result.outcome !== "ok") return { outcome: "error" };

  let coverResult = result.data.edition
    ? await getPrimaryEditionCover(supabase, result.data.edition.id)
    : await getPrimaryGameCover(supabase, result.data.game.id);

  if (result.data.edition && coverResult.outcome === "ok" && coverResult.data === null) {
    coverResult = await getPrimaryGameCover(supabase, result.data.game.id);
  }

  return {
    outcome: "ok",
    data: {
      detail: result.data,
      catalogArtwork:
        coverResult.outcome === "ok" && coverResult.data
          ? { uri: coverResult.data.assetUrl }
          : null,
    },
  };
}
