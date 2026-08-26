import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { randomUUID } from "expo-crypto";
import { ActionSheetIOS, Alert, Platform } from "react-native";

export const COPY_PHOTO_MAX_COUNT = 6;
const COPY_PHOTO_LONG_EDGE = 2_000;
const COPY_PHOTO_QUALITY = 0.85;
const COPY_PHOTO_MAX_BYTES = 8_388_608;

export type PendingCopyPhoto = {
  readonly id: string;
  readonly uri: string;
  readonly width: number;
  readonly height: number;
  readonly base64: string;
  readonly byteSize: number;
};

export type CopyPhotoSource = "camera" | "library";

export async function chooseCopyPhotoSource(): Promise<CopyPhotoSource | null> {
  if (Platform.OS === "ios") {
    return await new Promise((resolve) => {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          cancelButtonIndex: 2,
          options: ["Prendre une photo", "Choisir dans la photothèque", "Annuler"],
        },
        (index) => resolve(index === 0 ? "camera" : index === 1 ? "library" : null),
      );
    });
  }

  return await new Promise((resolve) => {
    Alert.alert("Ajouter une photo", undefined, [
      { text: "Prendre une photo", onPress: () => resolve("camera") },
      { text: "Choisir dans la photothèque", onPress: () => resolve("library") },
      { text: "Annuler", style: "cancel", onPress: () => resolve(null) },
    ]);
  });
}

/** Acquires local media only. No Storage or Copy mutation happens here. */
export async function acquireCopyPhotos(
  source: CopyPhotoSource,
  remaining: number,
): Promise<readonly PendingCopyPhoto[]> {
  if (remaining <= 0) return [];

  const permission =
    source === "camera"
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error(
      source === "camera"
        ? "L’accès à l’appareil photo est nécessaire."
        : "L’accès à la photothèque est nécessaire.",
    );
  }

  const result =
    source === "camera"
      ? await ImagePicker.launchCameraAsync({
          allowsEditing: false,
          mediaTypes: ["images"],
          quality: 1,
        })
      : await ImagePicker.launchImageLibraryAsync({
          allowsEditing: false,
          allowsMultipleSelection: true,
          mediaTypes: ["images"],
          orderedSelection: true,
          quality: 1,
          selectionLimit: remaining,
        });

  if (result.canceled) return [];
  const selected = result.assets.slice(0, remaining);
  return await Promise.all(selected.map(normalizeCopyPhoto));
}

export function pendingCopyPhotoBytes(photo: PendingCopyPhoto): ArrayBuffer {
  const decoded = globalThis.atob(photo.base64);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }
  return bytes.buffer;
}

async function normalizeCopyPhoto(asset: ImagePicker.ImagePickerAsset): Promise<PendingCopyPhoto> {
  const resize = longEdgeResize(asset.width, asset.height);
  const normalized = await manipulateAsync(asset.uri, resize ? [{ resize }] : [], {
    base64: true,
    compress: COPY_PHOTO_QUALITY,
    format: SaveFormat.JPEG,
  });
  if (!normalized.base64) throw new Error("La photo n’a pas pu être préparée.");
  const byteSize = base64ByteSize(normalized.base64);
  if (byteSize > COPY_PHOTO_MAX_BYTES) {
    throw new Error("Cette photo reste trop volumineuse après préparation.");
  }

  return {
    id: randomUUID(),
    uri: normalized.uri,
    width: normalized.width,
    height: normalized.height,
    base64: normalized.base64,
    byteSize,
  };
}

export function longEdgeResize(
  width: number,
  height: number,
): { readonly width: number } | { readonly height: number } | null {
  if (Math.max(width, height) <= COPY_PHOTO_LONG_EDGE) return null;
  return width >= height ? { width: COPY_PHOTO_LONG_EDGE } : { height: COPY_PHOTO_LONG_EDGE };
}

function base64ByteSize(value: string): number {
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return Math.floor((value.length * 3) / 4) - padding;
}
