import type { AlbumDetail, AlbumEntry } from "@geek/domain";

export type EuroInputResult =
  { readonly valid: true; readonly amountMinor: number | null } | { readonly valid: false };

/** Parses user-entered euros into integer cents without floating-point money. */
export function parseEuroInput(value: string): EuroInputResult {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return { valid: true, amountMinor: null };
  const match = /^(\d+)(?:\.(\d{0,2}))?$/.exec(normalized);
  if (!match) return { valid: false };
  const euros = Number(match[1]);
  if (!Number.isSafeInteger(euros)) return { valid: false };
  const cents = (match[2] ?? "").padEnd(2, "0");
  const amountMinor = euros * 100 + Number(cents || "0");
  return Number.isSafeInteger(amountMinor) ? { valid: true, amountMinor } : { valid: false };
}

export function findMatchingAlbumEntry(
  album: AlbumDetail,
  gameId: string,
  editionId: string,
): AlbumEntry | null {
  return (
    album.entries.find((entry) =>
      entry.target.kind === "game"
        ? entry.target.gameId === gameId
        : entry.target.gameId === gameId && entry.target.editionId === editionId,
    ) ?? null
  );
}

export type AlbumRevealTarget = {
  readonly album: AlbumDetail;
  readonly entry: AlbumEntry;
};

export type AlbumRevealSelection =
  | { readonly kind: "none" }
  | { readonly kind: "one"; readonly target: AlbumRevealTarget }
  | { readonly kind: "multiple"; readonly count: number };

export function selectAlbumRevealTarget(
  albums: readonly AlbumDetail[],
  gameId: string,
  editionId: string,
): AlbumRevealSelection {
  const matches = albums.flatMap((album) => {
    const entry = findMatchingAlbumEntry(album, gameId, editionId);
    return entry ? [{ album, entry }] : [];
  });
  if (matches.length === 0) return { kind: "none" };
  if (matches.length === 1) return { kind: "one", target: matches[0]! };
  return { kind: "multiple", count: matches.length };
}

export function resolveAlbumRevealEntryIndex(
  album: AlbumDetail,
  entryId: string,
  gameId: string,
  editionId: string,
): number | null {
  const index = album.entries.findIndex((entry) => entry.id === entryId);
  if (index < 0) return null;
  const entry = album.entries[index];
  if (!entry || entry.target.gameId !== gameId) return null;
  if (entry.target.kind === "edition" && entry.target.editionId !== editionId) return null;
  return index;
}

export type AlbumRevealRow = {
  readonly id: string;
  readonly entries: readonly AlbumEntry[];
};

export function groupAlbumRevealEntriesIntoRows(
  entries: readonly AlbumEntry[],
  columnCount: number,
): readonly AlbumRevealRow[] {
  if (!Number.isInteger(columnCount) || columnCount < 1) {
    throw new Error("Album reveal column count must be a positive integer");
  }
  const rows: AlbumRevealRow[] = [];
  for (let index = 0; index < entries.length; index += columnCount) {
    const rowEntries = entries.slice(index, index + columnCount);
    rows.push({
      id: `album-row:${rowEntries.map((entry) => entry.id).join(":")}`,
      entries: rowEntries,
    });
  }
  return rows;
}

export function findAlbumRevealRowIndex(
  rows: readonly AlbumRevealRow[],
  targetEntryId: string,
): number | null {
  const index = rows.findIndex((row) => row.entries.some((entry) => entry.id === targetEntryId));
  return index < 0 ? null : index;
}

export type AlbumRevealRenderPhase = "album_staged" | "album_revealing" | "album_revealed";

/** The staged missing tile is visual choreography; canonical ownership stays untouched. */
export function shouldStageAlbumRevealEntry(
  entry: AlbumEntry,
  targetEntryId: string,
  phase: AlbumRevealRenderPhase,
): boolean {
  return entry.id === targetEntryId && entry.state.owned && phase !== "album_revealed";
}

export type CopyCreationOutcome =
  { readonly outcome: "ok"; readonly copyId: string } | { readonly outcome: "failed" };

export type AddCopySubmissionResult =
  | { readonly outcome: "ignored" }
  | { readonly outcome: "creation_failed" }
  | {
      readonly outcome: "committed";
      readonly copyId: string;
      readonly enrichmentWarning: boolean;
      readonly albumSelection: AlbumRevealSelection;
    };

export function createAddCopySubmissionCoordinator(dependencies: {
  readonly createCopy: () => Promise<CopyCreationOutcome>;
  readonly enrichCopy: (copyId: string) => Promise<boolean>;
  readonly resolveAlbums: () => Promise<AlbumRevealSelection>;
}) {
  let status: "idle" | "pending" | "committed" = "idle";
  return {
    getStatus: () => status,
    async submit(): Promise<AddCopySubmissionResult> {
      if (status !== "idle") return { outcome: "ignored" };
      status = "pending";
      try {
        const creation = await dependencies.createCopy();
        if (creation.outcome !== "ok") {
          status = "idle";
          return { outcome: "creation_failed" };
        }

        status = "committed";
        let enrichmentWarning = false;
        try {
          enrichmentWarning = !(await dependencies.enrichCopy(creation.copyId));
        } catch {
          enrichmentWarning = true;
        }

        let albumSelection: AlbumRevealSelection = { kind: "none" };
        try {
          albumSelection = await dependencies.resolveAlbums();
        } catch {
          // Ownership is committed; unavailable celebration metadata safely skips reveal.
        }

        return {
          outcome: "committed",
          copyId: creation.copyId,
          enrichmentWarning,
          albumSelection,
        };
      } catch {
        status = "idle";
        return { outcome: "creation_failed" };
      }
    },
  };
}
