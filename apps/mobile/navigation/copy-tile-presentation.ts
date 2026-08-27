import { COPY_PHOTO_ROLES, type CopyPhotoRole, type Listing } from "@geek/domain";

import { formatMoney } from "../ui/format-money";
import { selectUnambiguousCopyId } from "./collection-surface-rules";

export type CopyTilePresentation = {
  readonly salePrice?: string;
  readonly photoRoles: readonly CopyPhotoRole[];
};

export type CopyTilePresentationResult =
  | { readonly outcome: "ok"; readonly data: ReadonlyMap<string, CopyTilePresentation> }
  | { readonly outcome: "unauthenticated" | "error" };

export function createCopyTilePresentation(
  activeListing: Listing | undefined,
  photoRoles: readonly (CopyPhotoRole | null)[],
): CopyTilePresentation {
  const orderedRoles = COPY_PHOTO_ROLES.filter((role) => photoRoles.includes(role));
  return {
    ...(activeListing ? { salePrice: formatMoney(activeListing.askingPrice) } : {}),
    photoRoles: orderedRoles,
  };
}

/** Optional tile metadata never replaces the canonical owned-Copy truth. */
export function copyTilePresentationsOrEmpty(
  result: CopyTilePresentationResult,
): ReadonlyMap<string, CopyTilePresentation> {
  return result.outcome === "ok" ? result.data : new Map();
}

/** Album tiles only inherit Copy-specific signals when one physical Copy is unambiguous. */
export function selectAlbumCopyTilePresentation(
  copyIds: readonly string[],
  presentations: ReadonlyMap<string, CopyTilePresentation>,
): CopyTilePresentation | undefined {
  const copyId = selectUnambiguousCopyId(copyIds);
  return copyId ? presentations.get(copyId) : undefined;
}
