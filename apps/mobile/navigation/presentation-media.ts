import type { CopyPhotoRole } from "@geek/domain";
import type { ImageSourcePropType } from "react-native";

export type PresentationMedia = {
  readonly copyPhotoUrl?: string;
  readonly editionCatalogUrl?: string;
  readonly gameCatalogUrl?: string;
};

export const OWNED_COPY_PHOTO_ROLES: readonly CopyPhotoRole[] = ["cartridge", "box", "manual"];

/** A fresh or invalid Owned Copy selection deterministically resolves to Cartouche. */
export function resolveOwnedCopyPhotoRole(selectedRole: CopyPhotoRole | null): CopyPhotoRole {
  return selectedRole && OWNED_COPY_PHOTO_ROLES.includes(selectedRole) ? selectedRole : "cartridge";
}

/** Exact owner-only Copy contexts may lead with that Copy's private primary photo. */
export function resolveOwnedCopyMedia(media: PresentationMedia): ImageSourcePropType | undefined {
  return toImageSource(media.copyPhotoUrl ?? media.editionCatalogUrl ?? media.gameCatalogUrl);
}

/** One URL is selected after persistence and then carried through every reveal phase. */
export function resolveRevealMediaUrl(media: PresentationMedia): string | undefined {
  return media.copyPhotoUrl ?? media.editionCatalogUrl ?? media.gameCatalogUrl;
}

/** Selected role galleries never borrow generic or another role's private photos. */
export function selectCopyPhotosForRole<
  T extends { readonly photo: { readonly photoRole: CopyPhotoRole | null } },
>(photos: readonly T[], photoRole: CopyPhotoRole): readonly T[] {
  return photos.filter(({ photo }) => photo.photoRole === photoRole);
}

export function getCopyPhotoRoleLabel(photoRole: CopyPhotoRole): string {
  if (photoRole === "manual") return "Notice";
  if (photoRole === "box") return "Boîte";
  return "Cartouche";
}

export function getCopyPhotoRolePrompt(photoRole: CopyPhotoRole): string {
  if (photoRole === "manual") return "Add a photo of your Notice";
  if (photoRole === "box") return "Add a photo of your box";
  return "Add a photo of your copy";
}

/** Catalog contexts never accept a private Copy photo. */
export function resolveCatalogMedia(
  media: Omit<PresentationMedia, "copyPhotoUrl">,
): ImageSourcePropType | undefined {
  return toImageSource(media.editionCatalogUrl ?? media.gameCatalogUrl);
}

/** Broad Game intents cannot borrow an arbitrary Edition cover. */
export function resolveWishlistMedia(
  media: Omit<PresentationMedia, "copyPhotoUrl">,
  exactEdition: boolean,
): ImageSourcePropType | undefined {
  return resolveCatalogMedia({
    editionCatalogUrl: exactEdition ? media.editionCatalogUrl : undefined,
    gameCatalogUrl: media.gameCatalogUrl,
  });
}

/**
 * Album slots use a private photo only when exactly one owner-visible Copy
 * satisfies the slot. Multiple Copies deliberately fall back to catalog media.
 */
export function resolveAlbumMedia(
  media: PresentationMedia,
  satisfyingCopyCount: number,
): ImageSourcePropType | undefined {
  return resolveOwnedCopyMedia({
    ...media,
    copyPhotoUrl: satisfyingCopyCount === 1 ? media.copyPhotoUrl : undefined,
  });
}

function toImageSource(url: string | undefined): ImageSourcePropType | undefined {
  return url ? { uri: url } : undefined;
}
