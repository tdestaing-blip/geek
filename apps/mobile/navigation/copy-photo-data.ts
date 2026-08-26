import { addCopyPhoto, deleteCopyPhoto, type CopyPhotoRead } from "@geek/data";
import type { CopyPhotoRole } from "@geek/domain";

import { pendingCopyPhotoBytes, type PendingCopyPhoto } from "../lib/copy-photo-media";
import { supabase } from "../lib/supabase";

export async function persistPendingCopyPhotos(
  copyId: string,
  photos: readonly PendingCopyPhoto[],
  photoRole?: CopyPhotoRole,
): Promise<boolean> {
  let allSucceeded = true;
  for (const photo of photos) {
    try {
      const result = await addCopyPhoto(supabase, {
        copyId,
        photoId: photo.id,
        ...(photoRole ? { photoRole } : {}),
        bytes: pendingCopyPhotoBytes(photo),
        width: photo.width,
        height: photo.height,
      });
      if (result.outcome !== "ok") allSucceeded = false;
    } catch {
      allSucceeded = false;
    }
  }
  return allSucceeded;
}

export async function removePersistedCopyPhoto(photoId: string): Promise<boolean> {
  try {
    const result = await deleteCopyPhoto(supabase, photoId);
    return result.outcome === "ok";
  } catch {
    return false;
  }
}

export function toGalleryItems(photos: readonly CopyPhotoRead[]) {
  return photos.map((photo) => ({ id: photo.photo.id, uri: photo.signedUrl }));
}
