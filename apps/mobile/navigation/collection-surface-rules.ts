export type CopyIdentity = {
  readonly id: string;
  readonly gameId: string;
  readonly editionId: string | null;
};

/** Broad Game and exact Edition ownership remain intentionally distinct. */
export function isWishlistTargetOwned(
  target: { readonly gameId: string; readonly editionId: string | null },
  copies: readonly CopyIdentity[],
): boolean {
  return copies.some((copy) =>
    target.editionId ? copy.editionId === target.editionId : copy.gameId === target.gameId,
  );
}

/** No arbitrary primary Copy is selected when several Copies satisfy one Album slot. */
export function selectUnambiguousCopyId(copyIds: readonly string[]): string | undefined {
  return copyIds.length === 1 ? copyIds[0] : undefined;
}
