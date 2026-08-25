import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import process from "node:process";

import { createClient } from "@supabase/supabase-js";

import { deriveMobyGamesImportPlan } from "../packages/catalog-import/src/mobygames.ts";
import { writeMobyGamesImportPlan } from "../packages/catalog-import/src/mobygames-database.ts";

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

const platform = await service
  .from("platforms")
  .insert({ slug: "nintendo-64", name: "Nintendo 64", manufacturer: "Nintendo" })
  .select("id")
  .single();
assert.equal(platform.error, null);

const plan = deriveMobyGamesImportPlan({
  game: {
    game_id: 3550,
    title: "The Legend of Zelda: Majora's Mask",
    description: "<p>Catalog description.</p>",
  },
  gamePlatform: {
    game_id: 3550,
    platform_id: 9,
    platform_name: "Nintendo 64",
    releases: [
      {
        countries: ["Europe"],
        description: null,
        release_date: "2000-11-17",
        companies: [{ company_name: "Nintendo", role: "Published by" }],
        product_codes: [{ product_code_type: "Nintendo Media PN", product_code: "NUS-NZSP-EUR" }],
      },
      {
        countries: [],
        description: "Unresolved packaging",
        release_date: "2000",
        companies: [],
      },
    ],
  },
  covers: {
    cover_groups: [
      {
        countries: ["Germany", "United Kingdom"],
        comments: null,
        covers: [
          {
            scan_of: "Front Cover",
            image: "https://cdn.example/majora-front.jpg",
            width: 800,
            height: 600,
          },
          {
            scan_of: "Back Cover",
            image: "https://cdn.example/majora-back.jpg",
            width: 800,
            height: 600,
          },
          { scan_of: "Manual", image: "https://cdn.example/majora-manual.jpg" },
        ],
      },
    ],
  },
  fetchedAt: "2026-08-24T12:00:00.000Z",
});

const first = await writeMobyGamesImportPlan(service, plan);
assert.equal(first.editionsCreated, 1);
assert.equal(first.ambiguousCandidatesSkipped, 1);
assert.equal(first.identifiersCreated, 1);
assert.equal(first.evidenceLinksCreated, 2);
assert.equal(first.mediaCreated, 2);
assert.deepEqual(first.candidateReconciliations.map(({ status }) => status).sort(), [
  "NEW",
  "SOURCE_AMBIGUOUS",
]);
const editionsAfterFirst = await service
  .from("editions")
  .select("id, game_id, platform_id, region_code")
  .eq("game_id", first.gameId);
assert.equal(editionsAfterFirst.error, null);
assert.equal(editionsAfterFirst.data.length, 1);
assert.equal(editionsAfterFirst.data[0].region_code, "EU");
const editionId = editionsAfterFirst.data[0].id;

const user = await service.auth.admin.createUser({
  email: `mobygames-smoke-${Date.now()}@example.com`,
  password: "Local-smoke-password-123!",
  email_confirm: true,
});
assert.equal(user.error, null);
const copies = await service
  .from("copies")
  .insert([
    { owner_id: user.data.user.id, game_id: first.gameId, edition_id: editionId },
    { owner_id: user.data.user.id, game_id: first.gameId, edition_id: editionId },
  ])
  .select("id")
  .order("id");
assert.equal(copies.error, null);
assert.equal(copies.data.length, 2);
const copyIds = copies.data.map(({ id }) => id);

const second = await writeMobyGamesImportPlan(service, plan);
assert.equal(second.gameId, first.gameId);
assert.equal(second.platformId, first.platformId);
assert.equal(second.editionsCreated, 0);
assert.equal(second.editionsReused, 1);
assert.equal(second.ambiguousCandidatesSkipped, 1);
assert.equal(second.identifiersCreated, 0);
assert.equal(second.evidenceLinksCreated, 0);
assert.equal(second.mediaCreated, 0);
assert.deepEqual(second.candidateReconciliations.map(({ status }) => status).sort(), [
  "MATCHED_BY_SOURCE_EVIDENCE",
  "SOURCE_AMBIGUOUS",
]);
const editionsAfterSecond = await service.from("editions").select("id").eq("game_id", first.gameId);
assert.equal(editionsAfterSecond.error, null);
assert.deepEqual(
  editionsAfterSecond.data.map(({ id }) => id),
  [editionId],
);
const copiesAfterSecond = await service.from("copies").select("id").in("id", copyIds).order("id");
assert.equal(copiesAfterSecond.error, null);
assert.deepEqual(
  copiesAfterSecond.data.map(({ id }) => id),
  copyIds,
);

const mappings = await service
  .from("platform_provider_mappings")
  .select("platform_id")
  .eq("provider", "mobygames")
  .eq("external_id", "9");
assert.equal(mappings.error, null);
assert.deepEqual(mappings.data, [{ platform_id: platform.data.id }]);

const sourceRows = await service
  .from("catalog_source_records")
  .select("id, record_type, source_key, provider_external_id, checksum, revision")
  .eq("provider", "mobygames")
  .order("record_type");
assert.equal(sourceRows.error, null);
assert.equal(sourceRows.data.length, 4);
assert.equal(
  sourceRows.data.find(({ record_type }) => record_type === "game_platform").provider_external_id,
  null,
);
assert.ok(sourceRows.data.every(({ revision }) => revision === 1));

const enrichedPlan = deriveMobyGamesImportPlan({
  game: {
    game_id: 3550,
    title: "The Legend of Zelda: Majora's Mask",
    description: "<p>Catalog description.</p>",
  },
  gamePlatform: {
    game_id: 3550,
    platform_id: 9,
    platform_name: "Nintendo 64",
    releases: [
      {
        countries: ["Europe"],
        description: null,
        release_date: "2000-11-17",
        companies: [{ company_name: "Nintendo", role: "Published by" }],
        product_codes: [
          { product_code_type: "Nintendo Media PN", product_code: "NUS-NZSP-EUR" },
          { product_code_type: "EAN-13", product_code: "0045496870775" },
        ],
      },
      {
        countries: [],
        description: "Unresolved packaging",
        release_date: "2000",
        companies: [],
      },
    ],
  },
  covers: plan.sourceRecords.find(({ recordType }) => recordType === "covers").payload,
  fetchedAt: "2026-08-24T12:30:00.000Z",
});
const enriched = await writeMobyGamesImportPlan(service, enrichedPlan);
assert.equal(enriched.editionsCreated, 0);
assert.equal(enriched.editionsReused, 1);
assert.equal(enriched.identifiersCreated, 1);
assert.equal(enriched.evidenceLinksCreated, 1);
assert.equal(
  enriched.candidateReconciliations.filter(({ status }) => status === "MATCHED_BY_SOURCE_EVIDENCE")
    .length,
  1,
);
const editionsAfterEnrichment = await service
  .from("editions")
  .select("id")
  .eq("game_id", first.gameId);
assert.equal(editionsAfterEnrichment.error, null);
assert.deepEqual(editionsAfterEnrichment.data, [{ id: editionId }]);
const copiesAfterEnrichment = await service
  .from("copies")
  .select("id")
  .in("id", copyIds)
  .order("id");
assert.equal(copiesAfterEnrichment.error, null);
assert.deepEqual(
  copiesAfterEnrichment.data.map(({ id }) => id),
  copyIds,
);

const gameSource = sourceRows.data.find(({ record_type }) => record_type === "game");
const unchanged = await service.rpc("upsert_mobygames_catalog_source_record", {
  record_type_name: "game",
  source_key_value: "3550",
  provider_external_id_value: "3550",
  payload_value: { game_id: 3550 },
  checksum_value: gameSource.checksum,
  fetched_at_value: "2026-08-24T13:00:00.000Z",
  evidence_children_value: [],
});
assert.equal(unchanged.error, null);
assert.equal(unchanged.data.revision, 1);
const changed = await service.rpc("upsert_mobygames_catalog_source_record", {
  record_type_name: "game",
  source_key_value: "3550",
  provider_external_id_value: "3550",
  payload_value: { game_id: 3550, title: "Changed" },
  checksum_value: "a".repeat(64),
  fetched_at_value: "2026-08-24T14:00:00.000Z",
  evidence_children_value: [],
});
assert.equal(changed.error, null);
assert.equal(changed.data.revision, 2);

const identifiers = await service
  .from("edition_identifiers")
  .select("scheme, value")
  .eq("edition_id", editionId)
  .order("scheme");
assert.equal(identifiers.error, null);
assert.deepEqual(identifiers.data, [
  { scheme: "ean_13", value: "0045496870775" },
  { scheme: "nintendo_media_pn", value: "NUS-NZSP-EUR" },
]);
const evidence = await service
  .from("edition_source_evidence")
  .select("evidence_kind")
  .eq("edition_id", editionId);
assert.equal(evidence.error, null);
assert.equal(evidence.data.length, 2);
const media = await service
  .from("catalog_media")
  .select("kind, rights_status")
  .eq("edition_id", editionId)
  .order("kind");
assert.equal(media.error, null);
assert.deepEqual(media.data, [
  { kind: "cover_back", rights_status: "restricted" },
  { kind: "cover_front", rights_status: "restricted" },
]);

const collisionGame = await service
  .from("games")
  .insert({ canonical_title: "MobyGames reconciliation collision" })
  .select("id")
  .single();
assert.equal(collisionGame.error, null);
const collisionEdition = await service
  .from("editions")
  .insert({
    game_id: collisionGame.data.id,
    platform_id: first.platformId,
    region_code: "US",
    edition_name: null,
  })
  .select("id")
  .single();
assert.equal(collisionEdition.error, null);
const collisionPlan = deriveMobyGamesImportPlan({
  game: { game_id: 9001, title: "MobyGames reconciliation collision" },
  gamePlatform: {
    game_id: 9001,
    platform_id: 9,
    platform_name: "Nintendo 64",
    releases: [
      {
        countries: ["United States"],
        description: null,
        release_date: "2001-01-01",
        companies: [],
        product_codes: [
          { product_code_type: "Nintendo Media PN", product_code: "COLLISION-CODE-USA" },
        ],
      },
    ],
  },
  covers: {
    cover_groups: [
      {
        countries: ["United States"],
        comments: null,
        covers: [
          {
            scan_of: "Front Cover",
            image: "https://cdn.example/collision-front.jpg",
          },
        ],
      },
    ],
  },
  fetchedAt: "2026-08-24T15:00:00.000Z",
});
const collision = await writeMobyGamesImportPlan(service, collisionPlan);
assert.equal(collision.editionsCreated, 0);
assert.equal(collision.editionsReused, 0);
assert.equal(collision.ambiguousCandidatesSkipped, 1);
assert.equal(collision.candidateReconciliations[0]?.status, "RECONCILIATION_AMBIGUOUS");
const collisionIdentifiers = await service
  .from("edition_identifiers")
  .select("id")
  .eq("edition_id", collisionEdition.data.id);
assert.equal(collisionIdentifiers.error, null);
assert.equal(collisionIdentifiers.data.length, 0);
const collisionEvidence = await service
  .from("edition_source_evidence")
  .select("edition_id")
  .eq("edition_id", collisionEdition.data.id);
assert.equal(collisionEvidence.error, null);
assert.equal(collisionEvidence.data.length, 0);
const collisionMedia = await service
  .from("catalog_media")
  .select("id")
  .eq("edition_id", collisionEdition.data.id);
assert.equal(collisionMedia.error, null);
assert.equal(collisionMedia.data.length, 0);

const rawRead = await anonymous.from("catalog_source_records").select("id");
assert.notEqual(rawRead.error, null);

await service.auth.admin.deleteUser(user.data.user.id);
process.stdout.write("MobyGames catalog source/import smoke: PASS\n");
