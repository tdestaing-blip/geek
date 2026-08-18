import type { GeekSupabaseClient, Json } from "@geek/supabase";

import type {
  CatalogImportDatabaseResult,
  NormalizedCatalogBatch,
  NormalizedEditionRecord,
  NormalizedGameRecord,
} from "./types.ts";

/** Writes one normalized platform batch through the atomic trusted RPC. */
export async function writeCatalogBatch(
  client: GeekSupabaseClient,
  batch: NormalizedCatalogBatch,
): Promise<CatalogImportDatabaseResult> {
  if (batch.media.length > 0) {
    throw new RangeError("catalog media writes require an explicitly licensed import workflow");
  }

  const { data, error } = await client.rpc("import_catalog_batch", {
    provider_name: batch.provider,
    provider_revision: batch.providerRevision,
    platform_slug: batch.platform.slug,
    platform_name: batch.platform.name,
    platform_manufacturer: batch.platform.manufacturer,
    normalized_games: batch.games.map(toGameJson),
    import_summary: toStatisticsJson(batch),
  });

  if (error !== null) {
    throw new Error(`${error.code}: ${error.message}`, { cause: error });
  }

  return parseDatabaseResult(data);
}

function toGameJson(game: NormalizedGameRecord): Json {
  return {
    externalId: game.externalId,
    canonicalTitle: game.canonicalTitle,
    sourceTitle: game.sourceTitle,
    editions: game.editions.map(toEditionJson),
  };
}

function toEditionJson(edition: NormalizedEditionRecord): Json {
  return {
    externalId: edition.externalId,
    sourceTitle: edition.sourceTitle,
    editionName: edition.editionName,
    regionCode: edition.regionCode,
    identifiers: edition.identifiers.map((identifier) => ({
      scheme: identifier.scheme,
      value: identifier.value,
      authority: identifier.authority,
    })),
  };
}

function toStatisticsJson(batch: NormalizedCatalogBatch): Json {
  const statistics = batch.statistics;

  return {
    provider: batch.provider,
    providerRevision: batch.providerRevision,
    platform: batch.platform.slug,
    sourceEntriesScanned: statistics.sourceEntriesScanned,
    acceptedEntries: statistics.acceptedEntries,
    excludedEntries: statistics.excludedEntries,
    uniqueNormalizedGames: statistics.uniqueNormalizedGames,
    editionsGenerated: statistics.editionsGenerated,
    identifiersGenerated: statistics.identifiersGenerated,
    exclusions: { ...statistics.exclusions },
    regionDistribution: { ...statistics.regionDistribution },
    duplicateNormalizationCases: statistics.duplicateNormalizationCases,
    conflicts: statistics.conflicts,
    errors: statistics.errors,
    mediaGenerated: batch.media.length,
  };
}

function parseDatabaseResult(value: unknown): CatalogImportDatabaseResult {
  if (!isRecord(value) || !isRecord(value.database) || !isRecord(value.summary)) {
    throw new TypeError("import_catalog_batch returned an invalid result");
  }

  return {
    runId: requireString(value, "runId"),
    database: {
      gamesCreated: requireNumber(value.database, "gamesCreated"),
      gamesUnchanged: requireNumber(value.database, "gamesUnchanged"),
      editionsCreated: requireNumber(value.database, "editionsCreated"),
      editionsUnchanged: requireNumber(value.database, "editionsUnchanged"),
      identifiersCreated: requireNumber(value.database, "identifiersCreated"),
      mappingsUpdated: requireNumber(value.database, "mappingsUpdated"),
    },
    summary: value.summary,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: Record<string, unknown>, field: string): string {
  const fieldValue = value[field];

  if (typeof fieldValue !== "string" || fieldValue === "") {
    throw new TypeError(`import_catalog_batch.${field} must be a nonblank string`);
  }

  return fieldValue;
}

function requireNumber(value: Record<string, unknown>, field: string): number {
  const fieldValue = value[field];

  if (typeof fieldValue !== "number" || !Number.isInteger(fieldValue) || fieldValue < 0) {
    throw new TypeError(`import_catalog_batch.${field} must be a nonnegative integer`);
  }

  return fieldValue;
}
