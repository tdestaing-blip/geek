import type { CopyPhoto } from "@geek/domain";
import type { GeekSupabaseClient } from "@geek/supabase";

import { resolveCaller } from "../caller";
import type { OwnedEntityResult } from "../result";
import { databaseFailure, InvalidRowError, mapRows, storageFailure } from "../result";

export const COPY_PHOTO_LIMIT = 6;
const COPY_PHOTO_BUCKET = "copy-photos";
const SIGNED_URL_LIFETIME_SECONDS = 300;
const PHOTO_COLUMNS =
  "id, copy_id, storage_path, sort_order, mime_type, width, height, byte_size, created_at";

export type CopyPhotoRead = {
  readonly photo: CopyPhoto;
  /** Short-lived authenticated URL. Never persisted as Copy-photo metadata. */
  readonly signedUrl: string;
};

export type AddCopyPhotoInput = {
  readonly photoId: string;
  readonly copyId: string;
  readonly bytes: ArrayBuffer;
  readonly width: number;
  readonly height: number;
};

export type AddCopyPhotoResult =
  OwnedEntityResult<CopyPhoto> | { readonly outcome: "limit_reached" };

export type DeleteCopyPhotoResult = OwnedEntityResult<{
  readonly photo: CopyPhoto;
  /** Metadata is already gone when this is true; the object is cleanup debt. */
  readonly storageCleanupWarning: boolean;
}>;

/** Reads owner-private canonical metadata in deterministic display order. */
export async function getCopyPhotos(
  client: GeekSupabaseClient,
  copyId: string,
): Promise<OwnedEntityResult<readonly CopyPhoto[]>> {
  const ownership = await requireOwnedCopy(client, copyId);
  if (ownership.outcome !== "ok") return ownership;

  const { data, error } = await client
    .from("copy_photos")
    .select(PHOTO_COLUMNS)
    .eq("copy_id", copyId)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });
  if (error !== null) return databaseFailure(error);
  return mapRows(() => data.map(toCopyPhoto));
}

/** Reads owner-private metadata and signs it only for the current display session. */
export async function getCopyPhotoGallery(
  client: GeekSupabaseClient,
  copyId: string,
): Promise<OwnedEntityResult<readonly CopyPhotoRead[]>> {
  const photos = await getCopyPhotos(client, copyId);
  if (photos.outcome !== "ok") return photos;
  if (photos.data.length === 0) return { outcome: "ok", data: [] };

  const { data, error } = await client.storage.from(COPY_PHOTO_BUCKET).createSignedUrls(
    photos.data.map((photo) => photo.storagePath),
    SIGNED_URL_LIFETIME_SECONDS,
  );
  if (error !== null) return storageFailure(error);

  const signedByPath = new Map(
    data.flatMap((item) => (item.signedUrl ? [[item.path, item.signedUrl] as const] : [])),
  );
  return mapRows(() =>
    photos.data.map((photo) => {
      const signedUrl = signedByPath.get(photo.storagePath);
      if (!signedUrl) {
        throw new InvalidRowError("copy_photos.storage_path", "could not create a signed URL");
      }
      return { photo, signedUrl };
    }),
  );
}

/** Uploads one normalized JPEG, then persists its canonical private metadata. */
export async function addCopyPhoto(
  client: GeekSupabaseClient,
  input: AddCopyPhotoInput,
): Promise<AddCopyPhotoResult> {
  const ownership = await requireOwnedCopy(client, input.copyId);
  if (ownership.outcome !== "ok") return ownership;
  if (!isPositiveInteger(input.width) || !isPositiveInteger(input.height)) {
    throw new RangeError("Copy photo dimensions must be positive integers");
  }
  if (input.bytes.byteLength < 1 || input.bytes.byteLength > 8_388_608) {
    throw new RangeError("Copy photo bytes must be between 1 and 8 MiB");
  }

  const count = await client
    .from("copy_photos")
    .select("id", { count: "exact", head: true })
    .eq("copy_id", input.copyId);
  if (count.error !== null) return databaseFailure(count.error);
  if ((count.count ?? 0) >= COPY_PHOTO_LIMIT) return { outcome: "limit_reached" };

  const photoId = input.photoId;
  if (!isUuid(photoId)) throw new TypeError("Copy photo id must be a UUID");
  const storagePath = `${input.copyId}/${photoId}.jpg`;
  const bucket = client.storage.from(COPY_PHOTO_BUCKET);
  const uploaded = await bucket.upload(storagePath, input.bytes, {
    contentType: "image/jpeg",
    upsert: false,
  });
  if (uploaded.error !== null) return storageFailure(uploaded.error);

  const inserted = await client
    .from("copy_photos")
    .insert({
      id: photoId,
      copy_id: input.copyId,
      storage_path: storagePath,
      mime_type: "image/jpeg",
      width: input.width,
      height: input.height,
      byte_size: input.bytes.byteLength,
    })
    .select(PHOTO_COLUMNS)
    .single();

  if (inserted.error !== null) {
    const cleanup = await bucket.remove([storagePath]);
    const failure = databaseFailure(inserted.error);
    return cleanup.error === null
      ? failure
      : {
          ...failure,
          failure: {
            ...failure.failure,
            hint: "The uploaded object also requires private Storage cleanup.",
          },
        };
  }

  return mapRows(() => toCopyPhoto(inserted.data));
}

/** Deletes metadata transactionally, compacts ordering, then removes the private object. */
export async function deleteCopyPhoto(
  client: GeekSupabaseClient,
  photoId: string,
): Promise<DeleteCopyPhotoResult> {
  const caller = await resolveCaller(client);
  if (caller.outcome !== "ok") return caller;

  const selected = await client
    .from("copy_photos")
    .select(PHOTO_COLUMNS)
    .eq("id", photoId)
    .maybeSingle();
  if (selected.error !== null) return databaseFailure(selected.error);
  if (selected.data === null) return { outcome: "not_found" };
  const selectedRow = selected.data;
  const mapped = mapRows(() => toCopyPhoto(selectedRow));
  if (mapped.outcome !== "ok") return mapped;

  const deleted = await client.rpc("delete_copy_photo", { p_photo_id: photoId });
  if (deleted.error !== null) return databaseFailure(deleted.error);
  if (deleted.data === null) return { outcome: "not_found" };

  const storageRemoval = await client.storage.from(COPY_PHOTO_BUCKET).remove([deleted.data]);
  return {
    outcome: "ok",
    data: {
      photo: mapped.data,
      storageCleanupWarning: storageRemoval.error !== null,
    },
  };
}

async function requireOwnedCopy(
  client: GeekSupabaseClient,
  copyId: string,
): Promise<
  { readonly outcome: "ok" } | Exclude<OwnedEntityResult<never>, { readonly outcome: "ok" }>
> {
  const caller = await resolveCaller(client);
  if (caller.outcome !== "ok") return caller;
  const copy = await client
    .from("copies")
    .select("id")
    .eq("id", copyId)
    .eq("owner_id", caller.userId)
    .maybeSingle();
  if (copy.error !== null) return databaseFailure(copy.error);
  return copy.data === null ? { outcome: "not_found" } : { outcome: "ok" };
}

function toCopyPhoto(row: {
  readonly id: string;
  readonly copy_id: string;
  readonly storage_path: string;
  readonly sort_order: number;
  readonly mime_type: string;
  readonly width: number;
  readonly height: number;
  readonly byte_size: number;
  readonly created_at: string;
}): CopyPhoto {
  if (row.mime_type !== "image/jpeg") {
    throw new InvalidRowError("copy_photos.mime_type", `unsupported ${row.mime_type}`);
  }
  if (
    !Number.isInteger(row.sort_order) ||
    row.sort_order < 0 ||
    row.sort_order >= COPY_PHOTO_LIMIT
  ) {
    throw new InvalidRowError("copy_photos.sort_order", `invalid ${row.sort_order}`);
  }
  if (!isPositiveInteger(row.width) || !isPositiveInteger(row.height)) {
    throw new InvalidRowError("copy_photos.dimensions", "dimensions must be positive integers");
  }
  if (!isPositiveInteger(row.byte_size) || row.byte_size > 8_388_608) {
    throw new InvalidRowError("copy_photos.byte_size", `invalid ${row.byte_size}`);
  }
  if (row.storage_path !== `${row.copy_id}/${row.id}.jpg`) {
    throw new InvalidRowError("copy_photos.storage_path", "path is not canonical");
  }
  return {
    id: row.id,
    copyId: row.copy_id,
    storagePath: row.storage_path,
    sortOrder: row.sort_order,
    mimeType: row.mime_type,
    width: row.width,
    height: row.height,
    byteSize: row.byte_size,
    createdAt: row.created_at,
  };
}

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
