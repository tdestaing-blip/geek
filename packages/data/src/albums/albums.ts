import type {
  AlbumDetail,
  AlbumEntry,
  AlbumProgress,
  AlbumSummary,
  AlbumTargetKind,
} from "@geek/domain";
import { parseAlbumTargetKind } from "@geek/domain";
import type { GeekSupabaseClient } from "@geek/supabase";

import { resolveCaller } from "../caller";
import type { Page, PageRequest } from "../pagination";
import { resolvePage } from "../pagination";
import type { OwnedEntityResult, OwnedResult } from "../result";
import { databaseFailure, InvalidRowError, mapRows } from "../result";

const ALBUM_LIST_PAGE = { defaultLimit: 20, maxLimit: 50 } as const;
const ALBUM_DETAIL_PAGE = { defaultLimit: 50, maxLimit: 100 } as const;

export async function getAlbums(
  client: GeekSupabaseClient,
  request?: PageRequest,
): Promise<OwnedResult<Page<AlbumSummary>>> {
  const caller = await resolveCaller(client);
  if (caller.outcome !== "ok") return caller;

  const { limit, offset } = resolvePage(request, ALBUM_LIST_PAGE);
  const { data, error } = await client.rpc("get_albums", {
    result_limit: limit,
    result_offset: offset,
  });
  if (error !== null) return databaseFailure(error);

  const rows: readonly unknown[] = data;
  return mapRows(() => ({ items: rows.map(toAlbumSummary), limit, offset }));
}

export async function getAlbumDetail(
  client: GeekSupabaseClient,
  albumIdOrSlug: string,
  request?: PageRequest,
): Promise<OwnedEntityResult<AlbumDetail & { readonly limit: number; readonly offset: number }>> {
  const caller = await resolveCaller(client);
  if (caller.outcome !== "ok") return caller;

  const { limit, offset } = resolvePage(request, ALBUM_DETAIL_PAGE);
  const { data, error } = await client.rpc("get_album_detail", {
    album_id_or_slug: albumIdOrSlug,
    result_limit: limit,
    result_offset: offset,
  });
  if (error !== null) return databaseFailure(error);

  const rows: readonly unknown[] = data;
  if (rows.length === 0) {
    const fallback = await client.rpc("get_album_detail", {
      album_id_or_slug: albumIdOrSlug,
      result_limit: 1,
      result_offset: 0,
    });
    if (fallback.error !== null) return databaseFailure(fallback.error);
    const fallbackRows: readonly unknown[] = fallback.data;
    if (fallbackRows.length === 0) return { outcome: "not_found" };
    return mapRows(() => toAlbumDetail(fallbackRows, limit, offset, false));
  }

  return mapRows(() => toAlbumDetail(rows, limit, offset, true));
}

function toAlbumDetail(
  rows: readonly unknown[],
  limit: number,
  offset: number,
  includeEntries: boolean,
) {
  const first = toRecord(rows[0], "album_detail");
  const album = toAlbum(first, "album_");
  const progress = toProgress(first);
  const entries = includeEntries ? rows.map((row) => toAlbumEntry(row, album.targetKind)) : [];

  for (const row of rows.slice(1)) {
    const record = toRecord(row, "album_detail");
    if (
      requiredString(record, "album_id") !== album.id ||
      requiredString(record, "album_target_kind") !== album.targetKind ||
      nonnegativeInteger(record, "total_slots") !== progress.totalSlots ||
      nonnegativeInteger(record, "owned_slots") !== progress.ownedSlots ||
      nonnegativeInteger(record, "wanted_slots") !== progress.wantedSlots
    ) {
      throw new InvalidRowError("album_detail", "inconsistent Album metadata or progress");
    }
  }

  return { ...album, progress, entries, limit, offset };
}

function toAlbumSummary(value: unknown): AlbumSummary {
  const row = toRecord(value, "albums");
  return { ...toAlbum(row, ""), progress: toProgress(row) };
}

function toAlbum(row: Record<string, unknown>, prefix: "" | "album_") {
  const targetKind = targetKindValue(row, `${prefix}target_kind`);
  return {
    id: requiredString(row, "album_id"),
    slug: requiredString(row, `${prefix}slug`),
    title: requiredString(row, `${prefix}title`),
    description: nullableString(row, `${prefix}description`),
    targetKind,
  };
}

function toProgress(row: Record<string, unknown>): AlbumProgress {
  const totalSlots = nonnegativeInteger(row, "total_slots");
  const ownedSlots = nonnegativeInteger(row, "owned_slots");
  const missingSlots = nonnegativeInteger(row, "missing_slots");
  const wantedSlots = nonnegativeInteger(row, "wanted_slots");
  if (totalSlots === 0 || ownedSlots + missingSlots !== totalSlots || wantedSlots > totalSlots) {
    throw new InvalidRowError("album.progress", "invalid calculated slot counts");
  }
  return {
    totalSlots,
    ownedSlots,
    missingSlots,
    wantedSlots,
    completionRatio: ownedSlots / totalSlots,
  };
}

function toAlbumEntry(value: unknown, targetKind: AlbumTargetKind): AlbumEntry {
  const row = toRecord(value, "album_entry");
  const owned = requiredBoolean(row, "owned");
  const missing = requiredBoolean(row, "missing");
  if (missing === owned) {
    throw new InvalidRowError("album_entry.missing", "must be the inverse of owned");
  }

  const gameId = requiredString(row, "game_id");
  const gameTitle = requiredString(row, "game_title");
  const editionId = nullableString(row, "edition_id");
  const target =
    targetKind === "game"
      ? (() => {
          if (editionId !== null) {
            throw new InvalidRowError("album_entry.edition_id", "Game target carried an Edition");
          }
          return { kind: "game" as const, gameId, gameTitle, editionId: null };
        })()
      : (() => {
          if (editionId === null) {
            throw new InvalidRowError("album_entry.edition_id", "Edition target had no Edition");
          }
          return {
            kind: "edition" as const,
            gameId,
            gameTitle,
            editionId,
            editionName: nullableString(row, "edition_name"),
            regionCode: nullableString(row, "edition_region_code"),
            platformId: requiredString(row, "edition_platform_id"),
            platformName: requiredString(row, "edition_platform_name"),
          };
        })();

  return {
    id: requiredString(row, "entry_id"),
    position: positiveInteger(row, "entry_position"),
    target,
    state: { owned, missing, wanted: requiredBoolean(row, "wanted") },
    network: {
      collectorCount: nonnegativeInteger(row, "collector_count"),
      tradeCollectorCount: nonnegativeInteger(row, "trade_collector_count"),
      activeListingCount: nonnegativeInteger(row, "active_listing_count"),
    },
  };
}

function toRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new InvalidRowError(field, "expected an object row");
  }
  return value as Record<string, unknown>;
}

function requiredString(row: Record<string, unknown>, field: string): string {
  const value = row[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new InvalidRowError(field, "expected a non-empty string");
  }
  return value;
}

function nullableString(row: Record<string, unknown>, field: string): string | null {
  const value = row[field];
  if (value === null) return null;
  if (typeof value !== "string") throw new InvalidRowError(field, "expected string or null");
  return value;
}

function requiredBoolean(row: Record<string, unknown>, field: string): boolean {
  const value = row[field];
  if (typeof value !== "boolean") throw new InvalidRowError(field, "expected boolean");
  return value;
}

function nonnegativeInteger(row: Record<string, unknown>, field: string): number {
  const value = row[field];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new InvalidRowError(field, "expected a non-negative safe integer");
  }
  return value;
}

function positiveInteger(row: Record<string, unknown>, field: string): number {
  const value = nonnegativeInteger(row, field);
  if (value === 0) throw new InvalidRowError(field, "expected a positive integer");
  return value;
}

function targetKindValue(row: Record<string, unknown>, field: string): AlbumTargetKind {
  const value = requiredString(row, field);
  const targetKind = parseAlbumTargetKind(value);
  if (targetKind === null) throw new InvalidRowError(field, `unknown target kind ${value}`);
  return targetKind;
}
