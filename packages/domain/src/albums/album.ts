export type AlbumTargetKind = "game" | "edition";

/** A finite, trusted editorial collection target. */
export type Album = {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly description: string | null;
  readonly targetKind: AlbumTargetKind;
};

/** Current collector progress, derived from Copy ownership rather than stored. */
export type AlbumProgress = {
  readonly totalSlots: number;
  readonly ownedSlots: number;
  readonly missingSlots: number;
  readonly wantedSlots: number;
  readonly completionRatio: number;
};

export type AlbumSummary = Album & {
  readonly progress: AlbumProgress;
};

export type AlbumNetworkSignal = {
  readonly collectorCount: number;
  readonly tradeCollectorCount: number;
  readonly activeListingCount: number;
};

export type AlbumGameTarget = {
  readonly kind: "game";
  readonly gameId: string;
  readonly gameTitle: string;
  readonly editionId: null;
};

export type AlbumEditionTarget = {
  readonly kind: "edition";
  readonly gameId: string;
  readonly gameTitle: string;
  readonly editionId: string;
  readonly editionName: string | null;
  readonly regionCode: string | null;
  readonly platformId: string;
  readonly platformName: string;
};

export type AlbumEntryTarget = AlbumGameTarget | AlbumEditionTarget;

/** Owned and wanted are independent; missing is always the inverse of owned. */
export type AlbumEntryState = {
  readonly owned: boolean;
  readonly missing: boolean;
  readonly wanted: boolean;
};

export type AlbumEntry = {
  readonly id: string;
  readonly position: number;
  readonly target: AlbumEntryTarget;
  readonly state: AlbumEntryState;
  readonly network: AlbumNetworkSignal;
};

export type AlbumDetail = AlbumSummary & {
  readonly entries: readonly AlbumEntry[];
};

const ALBUM_TARGET_KINDS: readonly string[] = ["game", "edition"];

export function parseAlbumTargetKind(value: string): AlbumTargetKind | null {
  return ALBUM_TARGET_KINDS.includes(value) ? (value as AlbumTargetKind) : null;
}
