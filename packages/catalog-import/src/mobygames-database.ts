import type { GeekSupabaseClient, Json } from "@geek/supabase";

import type {
  MobyGamesEditionCandidate,
  MobyGamesImportPlan,
  MobyGamesSourceRecord,
} from "./mobygames.ts";
import { classifyMobyGamesIdentifierScheme } from "./mobygames.ts";

const PROVIDER = "mobygames";

export const MOBYGAMES_PLATFORM_BOOTSTRAP: Readonly<Record<string, string>> = {
  "9": "nintendo-64",
};

export type MobyGamesImportResult = {
  readonly gameId: string;
  readonly platformId: string;
  readonly sourceRecords: number;
  readonly sourceRevisions: Readonly<Record<string, number>>;
  readonly editionsCreated: number;
  readonly editionsReused: number;
  readonly ambiguousCandidatesSkipped: number;
  readonly identifiersCreated: number;
  readonly mediaCreated: number;
  readonly evidenceLinksCreated: number;
  readonly candidateReconciliations: readonly MobyGamesCandidateReconciliation[];
};

export type MobyGamesCandidateReconciliation = {
  readonly candidateKey: string;
  readonly status:
    | "NEW"
    | "MATCHED_BY_SOURCE_EVIDENCE"
    | "MATCHED_BY_STRONG_IDENTIFIER"
    | "RECONCILIATION_AMBIGUOUS"
    | "SOURCE_AMBIGUOUS";
  readonly editionId: string | null;
};

export type ExistingEditionForMobyGamesReconciliation = {
  readonly id: string;
  readonly regionCode: string | null;
  readonly editionName: string | null;
  readonly identifiers: readonly { readonly scheme: string; readonly value: string }[];
};

type PersistedSourceRecord = {
  readonly id: string;
  readonly record_type: string;
  readonly revision: number;
};

type ExistingEvidence = {
  readonly editionId: string;
  readonly fingerprint: string;
};

/** Persists one reviewed MobyGames plan through trusted service-role access. */
export async function writeMobyGamesImportPlan(
  client: GeekSupabaseClient,
  plan: MobyGamesImportPlan,
): Promise<MobyGamesImportResult> {
  const expectedSlug = MOBYGAMES_PLATFORM_BOOTSTRAP[plan.platformExternalId];
  if (expectedSlug === undefined) {
    throw new RangeError(
      `MobyGames Platform ${plan.platformExternalId} has no reviewed Geek mapping`,
    );
  }

  const sourceRecords = await persistSourceRecords(client, plan.sourceRecords);
  const platformId = await resolvePlatform(
    client,
    plan.platformExternalId,
    plan.platformName,
    expectedSlug,
  );
  const gameId = await resolveGame(client, plan);
  const existingEvidence = await loadExistingEvidence(client, sourceRecords);
  const existingEditions = await loadExistingEditions(client, gameId, platformId);
  let editionsCreated = 0;
  let editionsReused = 0;
  let ambiguousCandidatesSkipped = 0;
  let identifiersCreated = 0;
  let mediaCreated = 0;
  let evidenceLinksCreated = 0;
  const candidateReconciliations: MobyGamesCandidateReconciliation[] = [];

  for (const candidate of plan.editions) {
    if (!candidate.canonicalizable) {
      ambiguousCandidatesSkipped += 1;
      candidateReconciliations.push({
        candidateKey: candidate.key,
        status: "SOURCE_AMBIGUOUS",
        editionId: null,
      });
      continue;
    }

    const resolved = await resolveEdition(
      client,
      gameId,
      platformId,
      candidate,
      existingEvidence,
      existingEditions,
    );
    candidateReconciliations.push({
      candidateKey: candidate.key,
      status: resolved.status,
      editionId: resolved.editionId,
    });
    if (resolved.editionId === null) {
      ambiguousCandidatesSkipped += 1;
      continue;
    }
    if (resolved.created) editionsCreated += 1;
    else editionsReused += 1;
    identifiersCreated += await persistIdentifiers(client, resolved.editionId, candidate);
    await pruneStaleEvidence(client, resolved.editionId, candidate, sourceRecords);
    evidenceLinksCreated += await persistEvidence(
      client,
      resolved.editionId,
      candidate,
      sourceRecords,
    );
    mediaCreated += await persistMedia(client, resolved.editionId, candidate);
  }

  const sourceRevisions = Object.fromEntries(
    sourceRecords.map((record) => [record.record_type, record.revision]),
  );

  await insertImportRun(client, {
    providerRevision: plan.sourceRecords.map(({ checksum }) => checksum).join(":"),
    platformId,
    summary: {
      gameExternalId: plan.gameExternalId,
      platformExternalId: plan.platformExternalId,
      sourceRecords: sourceRecords.length,
      sourceRevisions,
      editionsCreated,
      editionsReused,
      ambiguousCandidatesSkipped,
      identifiersCreated,
      mediaCreated,
      evidenceLinksCreated,
      candidateReconciliations,
      unresolvedEvidence: [...plan.unresolvedEvidence],
    },
  });

  return {
    gameId,
    platformId,
    sourceRecords: sourceRecords.length,
    sourceRevisions,
    editionsCreated,
    editionsReused,
    ambiguousCandidatesSkipped,
    identifiersCreated,
    mediaCreated,
    evidenceLinksCreated,
    candidateReconciliations,
  };
}

async function persistSourceRecords(
  client: GeekSupabaseClient,
  records: readonly MobyGamesSourceRecord[],
): Promise<readonly PersistedSourceRecord[]> {
  const persisted: PersistedSourceRecord[] = [];
  for (const record of records) {
    const { data, error } = await client.rpc("upsert_catalog_source_record", {
      provider_name: record.provider,
      record_type_name: record.recordType,
      source_key_value: record.sourceKey,
      provider_external_id_value: record.providerExternalId ?? "",
      payload_value: record.payload as Json,
      checksum_value: record.checksum,
      fetched_at_value: record.fetchedAt,
    });
    if (error !== null) throw databaseError("persist source record", error);
    if (
      !isRecord(data) ||
      typeof data.id !== "string" ||
      typeof data.record_type !== "string" ||
      !Number.isInteger(data.revision)
    ) {
      throw new TypeError("upsert_catalog_source_record returned an invalid row");
    }
    persisted.push({
      id: data.id,
      record_type: data.record_type,
      revision: data.revision as number,
    });
  }
  return persisted;
}

async function resolvePlatform(
  client: GeekSupabaseClient,
  externalId: string,
  sourceName: string,
  slug: string,
): Promise<string> {
  const existing = await client
    .from("platform_provider_mappings")
    .select("platform_id")
    .eq("provider", PROVIDER)
    .eq("external_id", externalId)
    .maybeSingle();
  if (existing.error !== null) throw databaseError("resolve Platform mapping", existing.error);
  if (existing.data !== null) return existing.data.platform_id;

  const platform = await client.from("platforms").select("id, name").eq("slug", slug).maybeSingle();
  if (platform.error !== null) throw databaseError("resolve canonical Platform", platform.error);
  if (platform.data === null)
    throw new Error(`Canonical Platform ${slug} must exist before MobyGames import`);

  const inserted = await client.from("platform_provider_mappings").insert({
    platform_id: platform.data.id,
    provider: PROVIDER,
    external_id: externalId,
    source_name: sourceName,
  });
  if (inserted.error !== null) throw databaseError("create Platform mapping", inserted.error);
  return platform.data.id;
}

async function resolveGame(client: GeekSupabaseClient, plan: MobyGamesImportPlan): Promise<string> {
  const existing = await client
    .from("game_provider_mappings")
    .select("game_id")
    .eq("provider", PROVIDER)
    .eq("external_id", plan.gameExternalId)
    .maybeSingle();
  if (existing.error !== null) throw databaseError("resolve Game mapping", existing.error);

  if (existing.data !== null) {
    if (plan.description !== null) {
      const update = await client
        .from("games")
        .update({ description: plan.description })
        .eq("id", existing.data.game_id)
        .is("description", null);
      if (update.error !== null) throw databaseError("update imported Game", update.error);
    }
    return existing.data.game_id;
  }

  const candidates = await client
    .from("games")
    .select("id")
    .eq("canonical_title", plan.canonicalTitle)
    .limit(2);
  if (candidates.error !== null) throw databaseError("match canonical Game", candidates.error);
  if (candidates.data.length > 1)
    throw new Error(`Multiple canonical Games match ${plan.canonicalTitle}`);

  let gameId = candidates.data[0]?.id;
  if (gameId === undefined) {
    const created = await client
      .from("games")
      .insert({ canonical_title: plan.canonicalTitle, description: plan.description })
      .select("id")
      .single();
    if (created.error !== null) throw databaseError("create Game", created.error);
    gameId = created.data.id;
  }

  const mapping = await client.from("game_provider_mappings").insert({
    game_id: gameId,
    provider: PROVIDER,
    external_id: plan.gameExternalId,
    source_title: plan.canonicalTitle,
  });
  if (mapping.error !== null) throw databaseError("create Game mapping", mapping.error);
  return gameId;
}

async function resolveEdition(
  client: GeekSupabaseClient,
  gameId: string,
  platformId: string,
  candidate: MobyGamesEditionCandidate,
  existingEvidence: readonly ExistingEvidence[],
  existingEditions: readonly ExistingEditionForMobyGamesReconciliation[],
): Promise<{
  readonly editionId: string | null;
  readonly created: boolean;
  readonly status: MobyGamesCandidateReconciliation["status"];
}> {
  const fingerprints = new Set(candidate.evidence.map(({ fingerprint }) => fingerprint));
  const sourceEditionIds = [
    ...new Set(
      existingEvidence
        .filter(({ fingerprint }) => fingerprints.has(fingerprint))
        .map(({ editionId }) => editionId),
    ),
  ];
  const decision = decideMobyGamesEditionReconciliation(
    candidate,
    existingEditions,
    sourceEditionIds,
  );
  if (decision.status !== "NEW") {
    return { ...decision, created: false };
  }

  const created = await client
    .from("editions")
    .insert({
      game_id: gameId,
      platform_id: platformId,
      edition_name: candidate.editionName,
      region_code: candidate.regionCode,
      release_date: candidate.releaseDate,
      publisher_name: candidate.publisherName,
    })
    .select("id")
    .single();
  if (created.error !== null) throw databaseError("create Edition", created.error);
  return { editionId: created.data.id, created: true, status: "NEW" };
}

export function decideMobyGamesEditionReconciliation(
  candidate: MobyGamesEditionCandidate,
  existingEditions: readonly ExistingEditionForMobyGamesReconciliation[],
  sourceEditionIds: readonly string[],
): {
  readonly editionId: string | null;
  readonly status: MobyGamesCandidateReconciliation["status"];
} {
  const uniqueSourceIds = [...new Set(sourceEditionIds)];
  if (uniqueSourceIds.length > 1) {
    return { editionId: null, status: "RECONCILIATION_AMBIGUOUS" };
  }
  if (uniqueSourceIds[0] !== undefined) {
    return existingEditions.some(({ id }) => id === uniqueSourceIds[0])
      ? { editionId: uniqueSourceIds[0], status: "MATCHED_BY_SOURCE_EVIDENCE" }
      : { editionId: null, status: "RECONCILIATION_AMBIGUOUS" };
  }

  const coarseCollisions = existingEditions.filter(
    (edition) =>
      edition.regionCode === candidate.regionCode && edition.editionName === candidate.editionName,
  );
  const candidateStrong = new Set(
    candidate.identifiers
      .filter(({ identityRole }) => identityRole === "strong_physical")
      .map(identifierKey),
  );
  const coarseIdentity = coarseCollisions.map((edition) => ({
    edition,
    strong: new Set(
      edition.identifiers
        .filter(({ scheme }) => classifyMobyGamesIdentifierScheme(scheme) === "strong_physical")
        .map(identifierKey),
    ),
  }));
  const compatibleStrongMatches = coarseIdentity.filter(({ strong }) => {
    return (
      candidateStrong.size > 0 &&
      strong.size > 0 &&
      setsIntersect(candidateStrong, strong) &&
      [...strong].every((identifier) => candidateStrong.has(identifier))
    );
  });

  const selected = compatibleStrongMatches[0];
  const unsafeCoarseCollision = coarseIdentity.some(
    ({ edition, strong }) =>
      edition.id !== selected?.edition.id &&
      (strong.size === 0 || setsIntersect(candidateStrong, strong)),
  );
  if (compatibleStrongMatches.length === 1 && !unsafeCoarseCollision) {
    return {
      editionId: selected!.edition.id,
      status: "MATCHED_BY_STRONG_IDENTIFIER",
    };
  }
  if (coarseCollisions.length > 0) {
    return { editionId: null, status: "RECONCILIATION_AMBIGUOUS" };
  }
  return { editionId: null, status: "NEW" };
}

async function pruneStaleEvidence(
  client: GeekSupabaseClient,
  editionId: string,
  candidate: MobyGamesEditionCandidate,
  sourceRecords: readonly PersistedSourceRecord[],
): Promise<void> {
  for (const source of sourceRecords) {
    if (source.record_type !== "game_platform" && source.record_type !== "covers") continue;
    const kind = source.record_type === "game_platform" ? "release" : "cover_group";
    const currentFingerprints = new Set(
      candidate.evidence
        .filter(
          (evidence) => evidence.sourceRecordType === source.record_type && evidence.kind === kind,
        )
        .map(({ fingerprint }) => fingerprint),
    );
    const existing = await client
      .from("edition_source_evidence")
      .select("evidence_fingerprint")
      .eq("edition_id", editionId)
      .eq("source_record_id", source.id)
      .eq("evidence_kind", kind);
    if (existing.error !== null)
      throw databaseError("resolve stale Edition evidence", existing.error);
    for (const evidence of existing.data) {
      if (currentFingerprints.has(evidence.evidence_fingerprint)) continue;
      const removed = await client
        .from("edition_source_evidence")
        .delete()
        .eq("edition_id", editionId)
        .eq("source_record_id", source.id)
        .eq("evidence_kind", kind)
        .eq("evidence_fingerprint", evidence.evidence_fingerprint);
      if (removed.error !== null)
        throw databaseError("remove stale Edition evidence", removed.error);
    }
  }
}

async function persistEvidence(
  client: GeekSupabaseClient,
  editionId: string,
  candidate: MobyGamesEditionCandidate,
  sourceRecords: readonly PersistedSourceRecord[],
): Promise<number> {
  let created = 0;
  for (const evidence of candidate.evidence) {
    const source = sourceRecords.find(
      ({ record_type }) => record_type === evidence.sourceRecordType,
    );
    if (source === undefined) throw new Error(`Missing ${evidence.sourceRecordType} source record`);
    const result = await client
      .from("edition_source_evidence")
      .upsert(
        {
          edition_id: editionId,
          source_record_id: source.id,
          evidence_kind: evidence.kind,
          evidence_fingerprint: evidence.fingerprint,
        },
        {
          onConflict: "edition_id,source_record_id,evidence_kind,evidence_fingerprint",
          ignoreDuplicates: true,
        },
      )
      .select("edition_id");
    if (result.error !== null) throw databaseError("persist Edition evidence", result.error);
    created += result.data.length;
  }
  return created;
}

async function persistIdentifiers(
  client: GeekSupabaseClient,
  editionId: string,
  candidate: MobyGamesEditionCandidate,
): Promise<number> {
  let created = 0;
  for (const identifier of candidate.identifiers) {
    const result = await client
      .from("edition_identifiers")
      .upsert(
        {
          edition_id: editionId,
          scheme: identifier.scheme,
          value: identifier.value,
          authority: identifier.authority,
        },
        { onConflict: "edition_id,scheme,value", ignoreDuplicates: true },
      )
      .select("id");
    if (result.error !== null) throw databaseError("persist Edition identifier", result.error);
    created += result.data.length;
  }
  return created;
}

async function persistMedia(
  client: GeekSupabaseClient,
  editionId: string,
  candidate: MobyGamesEditionCandidate,
): Promise<number> {
  let created = 0;
  for (const media of candidate.media) {
    const existing = await client
      .from("catalog_media")
      .select("id")
      .eq("edition_id", editionId)
      .eq("source_provider", PROVIDER)
      .eq("source_asset_id", media.sourceAssetId)
      .maybeSingle();
    if (existing.error !== null) throw databaseError("resolve CatalogMedia", existing.error);
    if (existing.data !== null) continue;
    const result = await client.from("catalog_media").insert({
      edition_id: editionId,
      game_id: null,
      kind: media.kind,
      asset_url: media.assetUrl,
      source_provider: PROVIDER,
      source_asset_id: media.sourceAssetId,
      source_page_url: media.sourcePageUrl,
      rights_status: "restricted",
      attribution: media.attribution,
      width: media.width,
      height: media.height,
      is_primary: false,
    });
    if (result.error !== null) throw databaseError("persist CatalogMedia", result.error);
    created += 1;
  }
  return created;
}

async function insertImportRun(
  client: GeekSupabaseClient,
  input: { readonly providerRevision: string; readonly platformId: string; readonly summary: Json },
): Promise<void> {
  const timestamp = new Date().toISOString();
  const result = await client.from("catalog_import_runs").insert({
    provider: PROVIDER,
    provider_revision: input.providerRevision,
    platform_id: input.platformId,
    started_at: timestamp,
    completed_at: timestamp,
    status: "succeeded",
    dry_run: false,
    summary: input.summary,
  });
  if (result.error !== null) throw databaseError("record catalog import", result.error);
}

async function loadExistingEvidence(
  client: GeekSupabaseClient,
  sourceRecords: readonly PersistedSourceRecord[],
): Promise<readonly ExistingEvidence[]> {
  const sourceIds = sourceRecords
    .filter(({ record_type }) => record_type === "game_platform" || record_type === "covers")
    .map(({ id }) => id);
  const result = await client
    .from("edition_source_evidence")
    .select("edition_id, evidence_fingerprint")
    .in("source_record_id", sourceIds);
  if (result.error !== null) throw databaseError("load existing Edition evidence", result.error);
  return result.data.map(({ edition_id, evidence_fingerprint }) => ({
    editionId: edition_id,
    fingerprint: evidence_fingerprint,
  }));
}

async function loadExistingEditions(
  client: GeekSupabaseClient,
  gameId: string,
  platformId: string,
): Promise<readonly ExistingEditionForMobyGamesReconciliation[]> {
  const result = await client
    .from("editions")
    .select("id, region_code, edition_name, edition_identifiers(scheme, value)")
    .eq("game_id", gameId)
    .eq("platform_id", platformId);
  if (result.error !== null) throw databaseError("load canonical Edition identities", result.error);
  return result.data.map(({ id, region_code, edition_name, edition_identifiers }) => ({
    id,
    regionCode: region_code,
    editionName: edition_name,
    identifiers: edition_identifiers,
  }));
}

function identifierKey(identifier: { readonly scheme: string; readonly value: string }): string {
  return `${identifier.scheme}\u0000${identifier.value}`;
}

function setsIntersect(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return [...left].some((value) => right.has(value));
}

function databaseError(
  action: string,
  error: { readonly code?: string; readonly message: string },
): Error {
  return new Error(`${action} failed (${error.code ?? "unknown"}): ${error.message}`, {
    cause: error,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
