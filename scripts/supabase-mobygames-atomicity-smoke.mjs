import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import process from "node:process";

import { createClient } from "@supabase/supabase-js";

const status = JSON.parse(
  execFileSync("pnpm", ["exec", "supabase", "status", "-o", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }),
);
const service = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const anonymous = createClient(status.API_URL, status.ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const runKey = `atomicity-${Date.now()}`;
const fixtureGameIds = [];
const fixturePlatformIds = [];
const fixtureSourceIds = [];
let platformExternalId;
let createdPlatformMapping = false;

const copiesBefore = await exactCount("copies");

try {
  const platform = await service.from("platforms").select("id").eq("slug", "nintendo-64").single();
  assert.equal(platform.error, null);
  const existingPlatformMapping = await service
    .from("platform_provider_mappings")
    .select("external_id")
    .eq("platform_id", platform.data.id)
    .eq("provider", "mobygames")
    .maybeSingle();
  assert.equal(existingPlatformMapping.error, null);
  platformExternalId = existingPlatformMapping.data?.external_id ?? "9";
  if (existingPlatformMapping.data === null) {
    const mapping = await service.from("platform_provider_mappings").insert({
      platform_id: platform.data.id,
      provider: "mobygames",
      external_id: platformExternalId,
      source_name: "Nintendo 64",
    });
    assert.equal(mapping.error, null);
    createdPlatformMapping = true;
  }

  const legacyMobyGamesWrite = await service.rpc("upsert_catalog_source_record", {
    provider_name: "mobygames",
    record_type_name: "game_platform",
    source_key_value: `${runKey}:legacy-write`,
    provider_external_id_value: "",
    payload_value: { fixture: "legacy-write" },
    checksum_value: "a".repeat(64),
    fetched_at_value: "2026-08-25T00:00:00.000Z",
  });
  assert.notEqual(
    legacyMobyGamesWrite.error,
    null,
    "generic source writes must not bypass MobyGames evidence metadata",
  );

  const anonymousMobyGamesWrite = await anonymous.rpc("upsert_mobygames_catalog_source_record", {
    record_type_name: "game_platform",
    source_key_value: `${runKey}:anonymous-write`,
    provider_external_id_value: "",
    payload_value: { fixture: "anonymous-write" },
    checksum_value: "a".repeat(64),
    fetched_at_value: "2026-08-25T00:00:00.000Z",
    evidence_children_value: [],
  });
  assert.notEqual(
    anonymousMobyGamesWrite.error,
    null,
    "anonymous callers must not upsert trusted MobyGames sources",
  );

  for (const stage of [
    "after_edition",
    "after_identifiers",
    "after_evidence",
    "after_components",
  ]) {
    const fixture = await createFixture(platform.data.id, stage);
    if (stage === "after_edition") {
      const denied = await anonymous.rpc("persist_mobygames_edition_candidate", {
        game_id_value: fixture.gameId,
        platform_id_value: fixture.platformId,
        candidate_value: fixture.candidate,
        source_records_value: fixture.sourceRecords,
      });
      assert.notEqual(denied.error, null, "anonymous callers must not execute the trusted RPC");
    }
    const failed = await persistCandidate(fixture, null, stage);
    assert.notEqual(failed.error, null, `${stage} must abort the candidate transaction`);
    await assertNewCandidateRolledBack(fixture);

    const retry = await persistCandidate(fixture, null, null);
    assert.equal(retry.error, null);
    assert.equal(retry.data.created, true);
    await assertCompleteCandidate(fixture, retry.data.editionId);

    const repeated = await persistCandidate(fixture, retry.data.editionId, null);
    assert.equal(repeated.error, null);
    assert.equal(repeated.data.editionId, retry.data.editionId);
    assert.equal(repeated.data.created, false);
    assert.equal(repeated.data.identifiersCreated, 0);
    assert.equal(repeated.data.componentsCreated, 0);
    assert.equal(repeated.data.evidenceLinksCreated, 0);
    assert.equal(repeated.data.mediaCreated, 0);
  }

  const existing = await createFixture(platform.data.id, "existing");
  const edition = await service
    .from("editions")
    .insert({
      game_id: existing.gameId,
      platform_id: platform.data.id,
      edition_name: existing.candidate.editionName,
      region_code: existing.candidate.regionCode,
    })
    .select("id")
    .single();
  assert.equal(edition.error, null);
  const existingEditionId = edition.data.id;

  const oldIdentifier = await service.from("edition_identifiers").insert({
    edition_id: existingEditionId,
    scheme: "publisher_product_code",
    value: `${runKey}-old-code`,
    authority: "Existing fixture",
  });
  assert.equal(oldIdentifier.error, null);
  const oldEvidence = await service.from("edition_source_evidence").insert({
    edition_id: existingEditionId,
    source_record_id: existing.releaseSourceId,
    evidence_kind: "release",
    evidence_fingerprint: "0".repeat(64),
  });
  assert.equal(oldEvidence.error, null);
  const oldMedia = await service.from("catalog_media").insert({
    game_id: null,
    edition_id: existingEditionId,
    kind: "cover_front",
    asset_url: "https://example.com/existing-cover.jpg",
    source_provider: "fixture",
    source_asset_id: `${runKey}-existing-media`,
    rights_status: "restricted",
    is_primary: false,
  });
  assert.equal(oldMedia.error, null);

  const failedEnrichment = await persistCandidate(existing, existingEditionId, "after_components");
  assert.notEqual(failedEnrichment.error, null);
  await assertExistingCandidateRolledBack(existing, existingEditionId);

  const enrichmentRetry = await persistCandidate(existing, existingEditionId, null);
  assert.equal(enrichmentRetry.error, null);
  assert.equal(enrichmentRetry.data.editionId, existingEditionId);
  assert.equal(enrichmentRetry.data.created, false);
  await assertCompleteCandidate(existing, existingEditionId, {
    retainedIdentifier: `${runKey}-old-code`,
    retainedMedia: `${runKey}-existing-media`,
  });

  const repeatedEnrichment = await persistCandidate(existing, existingEditionId, null);
  assert.equal(repeatedEnrichment.error, null);
  assert.equal(repeatedEnrichment.data.editionId, existingEditionId);
  assert.equal(repeatedEnrichment.data.identifiersCreated, 0);
  assert.equal(repeatedEnrichment.data.componentsCreated, 0);
  assert.equal(repeatedEnrichment.data.evidenceLinksCreated, 0);
  assert.equal(repeatedEnrichment.data.mediaCreated, 0);

  await verifyProvenanceScope(platform.data.id);

  assert.equal(await exactCount("copies"), copiesBefore);
  process.stdout.write("MobyGames candidate atomicity/provenance smoke: PASS\n");
} finally {
  for (const gameId of fixtureGameIds) {
    const editions = await service.from("editions").delete().eq("game_id", gameId);
    assert.equal(editions.error, null);
  }
  if (fixtureSourceIds.length > 0) {
    const sources = await service
      .from("catalog_source_records")
      .delete()
      .in("id", fixtureSourceIds);
    assert.equal(sources.error, null);
  }
  for (const gameId of fixtureGameIds) {
    const game = await service.from("games").delete().eq("id", gameId);
    assert.equal(game.error, null);
  }
  for (const platformId of fixturePlatformIds) {
    const platform = await service.from("platforms").delete().eq("id", platformId);
    assert.equal(platform.error, null);
  }
  if (createdPlatformMapping) {
    const mapping = await service
      .from("platform_provider_mappings")
      .delete()
      .eq("provider", "mobygames")
      .eq("external_id", platformExternalId);
    assert.equal(mapping.error, null);
  }
}

async function createFixture(platformId, label) {
  const game = await service
    .from("games")
    .insert({ canonical_title: `MobyGames atomicity ${runKey} ${label}` })
    .select("id")
    .single();
  assert.equal(game.error, null);
  fixtureGameIds.push(game.data.id);

  const gameExternalId = `${runKey}-${label}`;
  const gameMapping = await service.from("game_provider_mappings").insert({
    game_id: game.data.id,
    provider: "mobygames",
    external_id: gameExternalId,
    source_title: `MobyGames atomicity ${runKey} ${label}`,
  });
  assert.equal(gameMapping.error, null);

  const sourceRows = await service
    .from("catalog_source_records")
    .insert([
      {
        provider: "mobygames",
        record_type: "game_platform",
        source_key: `${gameExternalId}:${platformExternalId}`,
        provider_external_id: null,
        payload: { fixture: label, type: "game_platform" },
        checksum: "a".repeat(64),
        fetched_at: "2026-08-25T00:00:00.000Z",
        evidence_children: [{ kind: "release", fingerprint: "c".repeat(64) }],
      },
      {
        provider: "mobygames",
        record_type: "covers",
        source_key: `${gameExternalId}:${platformExternalId}`,
        provider_external_id: null,
        payload: { fixture: label, type: "covers" },
        checksum: "b".repeat(64),
        fetched_at: "2026-08-25T00:00:00.000Z",
        evidence_children: [{ kind: "cover_group", fingerprint: "d".repeat(64) }],
      },
    ])
    .select("id, record_type");
  assert.equal(sourceRows.error, null);
  assert.equal(sourceRows.data.length, 2);
  fixtureSourceIds.push(...sourceRows.data.map(({ id }) => id));
  const releaseSourceId = sourceRows.data.find(
    ({ record_type }) => record_type === "game_platform",
  ).id;
  const coversSourceId = sourceRows.data.find(({ record_type }) => record_type === "covers").id;

  return {
    gameId: game.data.id,
    platformId,
    releaseSourceId,
    coversSourceId,
    sourceRecords: [
      { id: releaseSourceId, recordType: "game_platform" },
      { id: coversSourceId, recordType: "covers" },
    ],
    candidate: {
      editionName: "Atomicity fixture",
      regionCode: "US",
      releaseDate: "2000-01-01",
      publisherName: "Fixture publisher",
      identifiers: [
        {
          scheme: "nintendo_media_pn",
          value: `${runKey}-${label}-media-code`,
          authority: "MobyGames",
        },
      ],
      evidence: [
        { sourceRecordId: releaseSourceId, kind: "release", fingerprint: "c".repeat(64) },
        { sourceRecordId: coversSourceId, kind: "cover_group", fingerprint: "d".repeat(64) },
      ],
      components: [
        {
          componentKey: "cartridge",
          name: "Cartridge",
          kind: "cartridge",
          requiredForComplete: true,
          sortOrder: 0,
        },
      ],
      media: [
        {
          kind: "cover_front",
          assetUrl: `https://example.com/${runKey}-${label}.jpg`,
          sourceAssetId: `${runKey}-${label}-media`,
          sourcePageUrl: null,
          rightsStatus: "noncommercial",
          width: 800,
          height: 600,
          isPrimary: true,
          attribution: "Data by MobyGames.com",
        },
      ],
    },
  };
}

async function verifyProvenanceScope(targetPlatformId) {
  const target = await createFixture(targetPlatformId, "provenance-target");
  const foreignGame = await createFixture(targetPlatformId, "provenance-foreign-game");

  const crossGame = withEvidenceAndSources(target, foreignGame);
  const crossGameResult = await persistCandidate(crossGame, null, null);
  assert.notEqual(crossGameResult.error, null, "cross-Game source records must be rejected");
  await assertNewCandidateRolledBack(target);

  const targetPersisted = await persistCandidate(target, null, null);
  assert.equal(targetPersisted.error, null);
  const staleEvidence = await service.from("edition_source_evidence").insert({
    edition_id: targetPersisted.data.editionId,
    source_record_id: target.releaseSourceId,
    evidence_kind: "release",
    evidence_fingerprint: "0".repeat(64),
  });
  assert.equal(staleEvidence.error, null);
  const stalePruneAttempt = await persistCandidate(crossGame, targetPersisted.data.editionId, null);
  assert.notEqual(stalePruneAttempt.error, null);
  const retainedStaleEvidence = await service
    .from("edition_source_evidence")
    .select("evidence_fingerprint")
    .eq("edition_id", targetPersisted.data.editionId)
    .eq("source_record_id", target.releaseSourceId)
    .eq("evidence_fingerprint", "0".repeat(64));
  assert.equal(retainedStaleEvidence.error, null);
  assert.equal(
    retainedStaleEvidence.data.length,
    1,
    "invalid provenance must not prune existing evidence",
  );

  const alternatePlatform = await service
    .from("platforms")
    .insert({ name: `Atomic platform ${runKey}`, slug: `${runKey}-platform` })
    .select("id")
    .single();
  assert.equal(alternatePlatform.error, null);
  fixturePlatformIds.push(alternatePlatform.data.id);
  const alternatePlatformExternalId = `${runKey}-platform-external`;
  const alternatePlatformMapping = await service.from("platform_provider_mappings").insert({
    platform_id: alternatePlatform.data.id,
    provider: "mobygames",
    external_id: alternatePlatformExternalId,
    source_name: `Atomic platform ${runKey}`,
  });
  assert.equal(alternatePlatformMapping.error, null);
  const targetGameExternalId = await gameExternalId(target.gameId);
  const crossPlatformSources = await createSourceRows(
    targetGameExternalId,
    alternatePlatformExternalId,
    "provenance-cross-platform",
  );
  const crossPlatform = withSourceRows(target, crossPlatformSources);
  const crossPlatformResult = await persistCandidate(crossPlatform, null, null);
  assert.notEqual(
    crossPlatformResult.error,
    null,
    "cross-Platform source records must be rejected",
  );

  const crossProviderRows = await createSourceRows(
    targetGameExternalId,
    platformExternalId,
    "provenance-cross-provider",
    "igdb",
  );
  const crossProvider = withSourceRows(target, crossProviderRows);
  const crossProviderResult = await persistCandidate(crossProvider, null, null);
  assert.notEqual(
    crossProviderResult.error,
    null,
    "cross-provider source records must be rejected",
  );

  const wrongTypeSource = await service
    .from("catalog_source_records")
    .insert({
      provider: "mobygames",
      record_type: "game",
      source_key: `${targetGameExternalId}:${platformExternalId}`,
      payload: { fixture: "wrong-type" },
      checksum: "e".repeat(64),
      fetched_at: "2026-08-25T00:00:00.000Z",
      evidence_children: [],
    })
    .select("id")
    .single();
  assert.equal(wrongTypeSource.error, null);
  fixtureSourceIds.push(wrongTypeSource.data.id);
  const wrongType = {
    ...target,
    sourceRecords: [{ id: wrongTypeSource.data.id, recordType: "game" }],
  };
  const wrongTypeResult = await persistCandidate(wrongType, null, null);
  assert.notEqual(wrongTypeResult.error, null, "wrong source record types must be rejected");

  const mismatchedFingerprint = {
    ...target,
    candidate: {
      ...target.candidate,
      evidence: target.candidate.evidence.map((evidence) =>
        evidence.kind === "release" ? { ...evidence, fingerprint: "f".repeat(64) } : evidence,
      ),
    },
  };
  const evidenceBeforeFingerprintFailure = await service
    .from("edition_source_evidence")
    .select("source_record_id, evidence_kind, evidence_fingerprint")
    .eq("edition_id", targetPersisted.data.editionId)
    .order("source_record_id")
    .order("evidence_fingerprint");
  assert.equal(evidenceBeforeFingerprintFailure.error, null);
  const fingerprintResult = await persistCandidate(
    mismatchedFingerprint,
    targetPersisted.data.editionId,
    null,
  );
  assert.notEqual(
    fingerprintResult.error,
    null,
    "fingerprints absent from trusted source metadata must be rejected",
  );
  const evidenceAfterFingerprintFailure = await service
    .from("edition_source_evidence")
    .select("source_record_id, evidence_kind, evidence_fingerprint")
    .eq("edition_id", targetPersisted.data.editionId)
    .order("source_record_id")
    .order("evidence_fingerprint");
  assert.equal(evidenceAfterFingerprintFailure.error, null);
  assert.deepEqual(
    evidenceAfterFingerprintFailure.data,
    evidenceBeforeFingerprintFailure.data,
    "invalid fingerprints must not prune existing evidence",
  );
}

async function createSourceRows(
  gameExternalId,
  scopedPlatformExternalId,
  label,
  provider = "mobygames",
) {
  const rows = await service
    .from("catalog_source_records")
    .insert([
      {
        provider,
        record_type: "game_platform",
        source_key: `${gameExternalId}:${scopedPlatformExternalId}`,
        payload: { fixture: label },
        checksum: "a".repeat(64),
        fetched_at: "2026-08-25T00:00:00.000Z",
        evidence_children: [{ kind: "release", fingerprint: "c".repeat(64) }],
      },
      {
        provider,
        record_type: "covers",
        source_key: `${gameExternalId}:${scopedPlatformExternalId}`,
        payload: { fixture: label },
        checksum: "b".repeat(64),
        fetched_at: "2026-08-25T00:00:00.000Z",
        evidence_children: [{ kind: "cover_group", fingerprint: "d".repeat(64) }],
      },
    ])
    .select("id, record_type");
  assert.equal(rows.error, null);
  fixtureSourceIds.push(...rows.data.map(({ id }) => id));
  return rows.data;
}

async function gameExternalId(gameId) {
  const mapping = await service
    .from("game_provider_mappings")
    .select("external_id")
    .eq("game_id", gameId)
    .eq("provider", "mobygames")
    .single();
  assert.equal(mapping.error, null);
  return mapping.data.external_id;
}

function withEvidenceAndSources(target, sourceFixture) {
  return {
    ...target,
    sourceRecords: sourceFixture.sourceRecords,
    candidate: { ...target.candidate, evidence: sourceFixture.candidate.evidence },
  };
}

function withSourceRows(target, rows) {
  const releaseSourceId = rows.find(({ record_type }) => record_type === "game_platform").id;
  const coversSourceId = rows.find(({ record_type }) => record_type === "covers").id;
  return {
    ...target,
    releaseSourceId,
    coversSourceId,
    sourceRecords: [
      { id: releaseSourceId, recordType: "game_platform" },
      { id: coversSourceId, recordType: "covers" },
    ],
    candidate: {
      ...target.candidate,
      evidence: [
        { sourceRecordId: releaseSourceId, kind: "release", fingerprint: "c".repeat(64) },
        { sourceRecordId: coversSourceId, kind: "cover_group", fingerprint: "d".repeat(64) },
      ],
    },
  };
}

async function persistCandidate(fixture, existingEditionId, failureStage) {
  return service.rpc("persist_mobygames_edition_candidate", {
    game_id_value: fixture.gameId,
    platform_id_value: fixture.platformId,
    candidate_value: fixture.candidate,
    source_records_value: fixture.sourceRecords,
    ...(existingEditionId === null ? {} : { existing_edition_id_value: existingEditionId }),
    ...(failureStage === null ? {} : { failure_stage_value: failureStage }),
  });
}

async function assertNewCandidateRolledBack(fixture) {
  const editions = await service.from("editions").select("id").eq("game_id", fixture.gameId);
  assert.equal(editions.error, null);
  assert.equal(editions.data.length, 0);

  const identifiers = await service
    .from("edition_identifiers")
    .select("id")
    .eq("value", fixture.candidate.identifiers[0].value);
  assert.equal(identifiers.error, null);
  assert.equal(identifiers.data.length, 0);

  const evidence = await service
    .from("edition_source_evidence")
    .select("edition_id")
    .in("source_record_id", [fixture.releaseSourceId, fixture.coversSourceId]);
  assert.equal(evidence.error, null);
  assert.equal(evidence.data.length, 0);

  const media = await service
    .from("catalog_media")
    .select("id")
    .eq("source_provider", "mobygames")
    .eq("source_asset_id", fixture.candidate.media[0].sourceAssetId);
  assert.equal(media.error, null);
  assert.equal(media.data.length, 0);

  const sources = await service
    .from("catalog_source_records")
    .select("id")
    .in("id", [fixture.releaseSourceId, fixture.coversSourceId]);
  assert.equal(sources.error, null);
  assert.equal(sources.data.length, 2, "trusted source records must survive canonical rollback");
}

async function assertExistingCandidateRolledBack(fixture, editionId) {
  const identifiers = await service
    .from("edition_identifiers")
    .select("scheme, value")
    .eq("edition_id", editionId);
  assert.equal(identifiers.error, null);
  assert.deepEqual(identifiers.data, [
    { scheme: "publisher_product_code", value: `${runKey}-old-code` },
  ]);

  const evidence = await service
    .from("edition_source_evidence")
    .select("source_record_id, evidence_fingerprint")
    .eq("edition_id", editionId);
  assert.equal(evidence.error, null);
  assert.deepEqual(evidence.data, [
    {
      source_record_id: fixture.releaseSourceId,
      evidence_fingerprint: "0".repeat(64),
    },
  ]);

  const media = await service
    .from("catalog_media")
    .select("source_asset_id")
    .eq("edition_id", editionId);
  assert.equal(media.error, null);
  assert.deepEqual(media.data, [{ source_asset_id: `${runKey}-existing-media` }]);

  const components = await service
    .from("edition_components")
    .select("id")
    .eq("edition_id", editionId);
  assert.equal(components.error, null);
  assert.equal(components.data.length, 0);
}

async function assertCompleteCandidate(fixture, editionId, retained = {}) {
  const editions = await service.from("editions").select("id").eq("game_id", fixture.gameId);
  assert.equal(editions.error, null);
  assert.deepEqual(editions.data, [{ id: editionId }]);

  const identifiers = await service
    .from("edition_identifiers")
    .select("value")
    .eq("edition_id", editionId)
    .order("value");
  assert.equal(identifiers.error, null);
  const expectedIdentifiers = [fixture.candidate.identifiers[0].value];
  if (retained.retainedIdentifier !== undefined)
    expectedIdentifiers.push(retained.retainedIdentifier);
  assert.deepEqual(
    identifiers.data.map(({ value }) => value),
    expectedIdentifiers.sort(),
  );

  const components = await service
    .from("edition_components")
    .select("component_key, kind, required_for_complete, sort_order")
    .eq("edition_id", editionId)
    .order("sort_order");
  assert.equal(components.error, null);
  assert.deepEqual(components.data, [
    {
      component_key: "cartridge",
      kind: "cartridge",
      required_for_complete: true,
      sort_order: 0,
    },
  ]);

  const evidence = await service
    .from("edition_source_evidence")
    .select("evidence_fingerprint")
    .eq("edition_id", editionId)
    .order("evidence_fingerprint");
  assert.equal(evidence.error, null);
  assert.deepEqual(
    evidence.data.map(({ evidence_fingerprint }) => evidence_fingerprint),
    ["c".repeat(64), "d".repeat(64)],
  );

  const media = await service
    .from("catalog_media")
    .select("source_provider, source_asset_id, rights_status, is_primary, attribution")
    .eq("edition_id", editionId)
    .order("source_asset_id");
  assert.equal(media.error, null);
  const inserted = media.data.find(
    ({ source_provider, source_asset_id }) =>
      source_provider === "mobygames" &&
      source_asset_id === fixture.candidate.media[0].sourceAssetId,
  );
  assert.deepEqual(inserted, {
    source_provider: "mobygames",
    source_asset_id: fixture.candidate.media[0].sourceAssetId,
    rights_status: "noncommercial",
    is_primary: true,
    attribution: "Data by MobyGames.com",
  });
  if (retained.retainedMedia !== undefined) {
    assert.ok(media.data.some(({ source_asset_id }) => source_asset_id === retained.retainedMedia));
  }
}

async function exactCount(table) {
  const result = await service.from(table).select("id", { count: "exact", head: true });
  assert.equal(result.error, null);
  return result.count;
}
