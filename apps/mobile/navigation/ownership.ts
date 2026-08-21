import type { CollectionEntry } from "@geek/data";

/** Returns every physical Copy of an Edition without selecting or deduplicating one. */
export function getOwnedCopiesForEdition(
  collectionEntries: readonly CollectionEntry[],
  editionId: string,
): readonly CollectionEntry[] {
  return collectionEntries.filter(({ copy }) => copy.editionId === editionId);
}
