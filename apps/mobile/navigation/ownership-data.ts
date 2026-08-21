import type { CatalogMedia } from "@geek/domain";
import {
  getMyCollection,
  getPrimaryEditionCovers,
  getPrimaryGameCovers,
  type CollectionEntry,
} from "@geek/data";
import type { ImageSourcePropType } from "react-native";

import { supabase } from "../lib/supabase";
import type { GridItem } from "../ui/game-grid-item";

const COLLECTION_PAGE_SIZE = 100;

export type CanonicalCollectionItem = Omit<GridItem, "copyId" | "editionId" | "image"> & {
  readonly copyId: string;
  readonly editionId?: string;
  readonly image?: ImageSourcePropType;
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

  const covers = await loadPrimaryCovers(entries);
  return { outcome: "ok", data: { entries, items: toCollectionItems(entries, covers) } };
}

function toCollectionItems(
  entries: readonly CollectionEntry[],
  covers: ReadonlyMap<string, ImageSourcePropType>,
): readonly CanonicalCollectionItem[] {
  return entries.map(({ copy, edition, game, platform }) => ({
    copyId: copy.id,
    editionId: copy.editionId ?? undefined,
    gameId: copy.gameId,
    image: covers.get(edition?.id ?? "") ?? covers.get(game.id),
    platform: platform?.name ?? "Édition à préciser",
    regionCode: edition?.regionCode ?? null,
    title: game.canonicalTitle,
  }));
}

async function loadPrimaryCovers(
  entries: readonly CollectionEntry[],
): Promise<ReadonlyMap<string, ImageSourcePropType>> {
  const editionIds = distinct(entries.flatMap(({ edition }) => (edition ? [edition.id] : [])));
  const gameIds = distinct(entries.map(({ game }) => game.id));
  const [editionMedia, gameMedia] = await Promise.all([
    loadCoverBatches(editionIds, getPrimaryEditionCovers),
    loadCoverBatches(gameIds, getPrimaryGameCovers),
  ]);

  const covers = new Map<string, ImageSourcePropType>();
  for (const media of [...gameMedia, ...editionMedia]) {
    const targetId = media.editionId ?? media.gameId;
    if (targetId) covers.set(targetId, { uri: media.assetUrl });
  }
  return covers;
}

async function loadCoverBatches(
  ids: readonly string[],
  load: (
    client: typeof supabase,
    targetIds: readonly string[],
  ) => ReturnType<typeof getPrimaryGameCovers>,
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
