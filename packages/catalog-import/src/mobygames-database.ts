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

type PersistedCandidate = {
  readonly editionId: string;
  readonly created: boolean;
  readonly identifiersCreated: number;
  readonly evidenceLinksCreated: number;
  readonly mediaCreated: number;
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

  const sourceRecords = await persistSourceRecords(client, plan);
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

    const resolution = resolveEdition(candidate, existingEvidence, existingEditions);
    if (resolution.status === "RECONCILIATION_AMBIGUOUS") {
      candidateReconciliations.push({
        candidateKey: candidate.key,
        status: resolution.status,
        editionId: null,
      });
      ambiguousCandidatesSkipped += 1;
      continue;
    }

    const persisted = await persistCandidate(
      client,
      gameId,
      platformId,
      resolution.editionId,
      candidate,
      sourceRecords,
    );
    candidateReconciliations.push({
      candidateKey: candidate.key,
      status: resolution.status,
      editionId: persisted.editionId,
    });
    if (persisted.created) editionsCreated += 1;
    else editionsReused += 1;
    identifiersCreated += persisted.identifiersCreated;
    evidenceLinksCreated += persisted.evidenceLinksCreated;
    mediaCreated += persisted.mediaCreated;
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
  plan: MobyGamesImportPlan,
): Promise<readonly PersistedSourceRecord[]> {
  const persisted: PersistedSourceRecord[] = [];
  for (const record of plan.sourceRecords) {
    const { data, error } = await client.rpc("upsert_mobygames_catalog_source_record", {
      record_type_name: record.recordType,
      source_key_value: record.sourceKey,
      provider_external_id_value: record.providerExternalId ?? "",
      payload_value: record.payload as Json,
      checksum_value: record.checksum,
      fetched_at_value: record.fetchedAt,
      evidence_children_value: sourceEvidenceChildren(plan, record) as Json,
    });
    if (error !== null) throw databaseError("persist source record", error);
    if (
      !isRecord(data) ||
      typeof data.id !== "string" ||
      typeof data.record_type !== "string" ||
      !Number.isInteger(data.revision)
    ) {
      throw new TypeError("upsert_mobygames_catalog_source_record returned an invalid row");
    }
    persisted.push({
      id: data.id,
      record_type: data.record_type,
      revision: data.revision as number,
    });
  }
  return persisted;
}

function sourceEvidenceChildren(
  plan: MobyGamesImportPlan,
  record: MobyGamesSourceRecord,
): { readonly kind: "release" | "cover_group"; readonly fingerprint: string }[] {
  const evidence = plan.editions
    .flatMap(({ evidence: candidateEvidence }) => candidateEvidence)
    .filter(({ sourceRecordType }) => sourceRecordType === record.recordType)
    .map(({ kind, fingerprint }) => ({ kind, fingerprint }));
  if (record.recordType === "covers") {
    for (const unresolved of plan.unresolvedEvidence) {
      const fingerprint = unresolved.startsWith("cover_group:")
        ? unresolved.slice("cover_group:".length)
        : null;
      if (fingerprint !== null) evidence.push({ kind: "cover_group", fingerprint });
    }
  }
  return [
    ...new Map(evidence.map((item) => [`${item.kind}\u0000${item.fingerprint}`, item])).values(),
  ];
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

function resolveEdition(
  candidate: MobyGamesEditionCandidate,
  existingEvidence: readonly ExistingEvidence[],
  existingEditions: readonly ExistingEditionForMobyGamesReconciliation[],
): {
  readonly editionId: string | null;
  readonly status: MobyGamesCandidateReconciliation["status"];
} {
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
  return decision;
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

async function persistCandidate(
  client: GeekSupabaseClient,
  gameId: string,
  platformId: string,
  existingEditionId: string | null,
  candidate: MobyGamesEditionCandidate,
  sourceRecords: readonly PersistedSourceRecord[],
): Promise<PersistedCandidate> {
  const evidence = candidate.evidence.map((item) => {
    const source = sourceRecords.find(({ record_type }) => record_type === item.sourceRecordType);
    if (source === undefined) throw new Error(`Missing ${item.sourceRecordType} source record`);
    return {
      sourceRecordId: source.id,
      kind: item.kind,
      fingerprint: item.fingerprint,
    };
  });
  const result = await client.rpc("persist_mobygames_edition_candidate", {
    game_id_value: gameId,
    platform_id_value: platformId,
    ...(existingEditionId === null ? {} : { existing_edition_id_value: existingEditionId }),
    candidate_value: {
      editionName: candidate.editionName,
      regionCode: candidate.regionCode,
      releaseDate: candidate.releaseDate,
      publisherName: candidate.publisherName,
      identifiers: candidate.identifiers.map(({ scheme, value, authority }) => ({
        scheme,
        value,
        authority,
      })),
      evidence,
      media: candidate.media.map((media) => ({
        kind: media.kind,
        assetUrl: media.assetUrl,
        sourceAssetId: media.sourceAssetId,
        sourcePageUrl: media.sourcePageUrl,
        width: media.width,
        height: media.height,
        attribution: media.attribution,
      })),
    },
    source_records_value: sourceRecords
      .filter(({ record_type }) => record_type === "game_platform" || record_type === "covers")
      .map(({ id, record_type }) => ({ id, recordType: record_type })),
  });
  if (result.error !== null)
    throw databaseError("persist MobyGames Edition candidate", result.error);
  if (
    !isRecord(result.data) ||
    typeof result.data.editionId !== "string" ||
    typeof result.data.created !== "boolean" ||
    !Number.isInteger(result.data.identifiersCreated) ||
    !Number.isInteger(result.data.evidenceLinksCreated) ||
    !Number.isInteger(result.data.mediaCreated)
  ) {
    throw new TypeError("persist_mobygames_edition_candidate returned an invalid result");
  }
  return {
    editionId: result.data.editionId,
    created: result.data.created,
    identifiersCreated: result.data.identifiersCreated as number,
    evidenceLinksCreated: result.data.evidenceLinksCreated as number,
    mediaCreated: result.data.mediaCreated as number,
  };
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
