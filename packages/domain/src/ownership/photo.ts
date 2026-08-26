export const COPY_PHOTO_ROLES = ["cartridge", "box", "manual"] as const;

export type CopyPhotoRole = (typeof COPY_PHOTO_ROLES)[number];

export function parseCopyPhotoRole(value: string): CopyPhotoRole | null {
  return COPY_PHOTO_ROLES.find((role) => role === value) ?? null;
}

/** Owner-private media depicting one canonical physical Copy. */
export type CopyPhoto = {
  readonly id: string;
  readonly copyId: string;
  /** Canonical physical component depicted by this photo, or null for a general Copy photo. */
  readonly editionComponentId: string | null;
  /** Universal owned-Copy presentation role, independent from Edition completeness truth. */
  readonly photoRole: CopyPhotoRole | null;
  readonly storagePath: string;
  readonly sortOrder: number;
  readonly mimeType: "image/jpeg";
  readonly width: number;
  readonly height: number;
  readonly byteSize: number;
  readonly createdAt: string;
};
