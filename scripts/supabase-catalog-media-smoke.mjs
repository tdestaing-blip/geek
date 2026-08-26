/** Focused executable validation for CatalogMedia schema, access, and data APIs. */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { register } from "node:module";
import process from "node:process";

import { createClient } from "@supabase/supabase-js";

register("./typescript-resolver.mjs", import.meta.url);

const {
  getGamePresentationCover,
  getPrimaryEditionCover,
  getPrimaryEditionCovers,
  getPrimaryGameArtwork,
  getPrimaryGameCover,
  getPrimaryGameCovers,
  isCatalogMediaDisplayable,
} = await import("../packages/data/src/index.ts");
const { toCatalogMedia } = await import("../packages/data/src/catalog/mapping.ts");
const { InvalidRowError } = await import("../packages/data/src/result.ts");

function readEnvironment() {
  const status = JSON.parse(
    execFileSync("pnpm", ["exec", "supabase", "status", "-o", "json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }),
  );

  return {
    url: status.API_URL,
    anonKey: status.ANON_KEY,
    serviceRoleKey: status.SERVICE_ROLE_KEY,
  };
}

const results = [];

function record(name, passed, detail) {
  results.push({ name, passed });
  process.stdout.write(`${passed ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}\n`);
}

function errorDetail(result) {
  return result.error?.message;
}

function createCountingClient(url, key) {
  const { fetch } = globalThis;
  let requests = 0;
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const requestUrl = typeof input === "string" ? input : input.url;

        if (requestUrl.includes("/rest/v1/")) {
          requests += 1;
        }

        return fetch(input, init);
      },
    },
  });

  return { client, requests: () => requests };
}

function recordRejects(name, field, map) {
  let outcome = "returned a model";

  try {
    map();
  } catch (error) {
    outcome = error instanceof InvalidRowError ? error.field : `threw ${error?.name}`;
  }

  record(name, outcome === field, outcome === field ? undefined : `got ${outcome}`);
}

const environment = readEnvironment();
const runId = randomUUID().slice(0, 8);
const password = `Pw-${randomUUID()}`;
const admin = createClient(environment.url, environment.serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const anonymous = createClient(environment.url, environment.anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const authenticated = createClient(environment.url, environment.anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const fixtures = { userId: null, gameIds: [], editionIds: [], platformIds: [] };

function media(overrides) {
  return {
    kind: "cover_front",
    asset_url: `https://assets.example.com/${runId}/${randomUUID()}.jpg`,
    source_provider: "smoke-provider",
    source_asset_id: randomUUID(),
    rights_status: "reusable",
    ...overrides,
  };
}

try {
  const user = await admin.auth.admin.createUser({
    email: `catalog-media-${runId}@example.com`,
    password,
    email_confirm: true,
  });
  fixtures.userId = user.data.user?.id ?? null;
  record("authenticated fixture user created", user.error === null, user.error?.message);

  const signIn = await authenticated.auth.signInWithPassword({
    email: `catalog-media-${runId}@example.com`,
    password,
  });
  record("authenticated client signed in", signIn.error === null, signIn.error?.message);

  const platformInsert = await admin
    .from("platforms")
    .insert({ slug: `catalog-media-${runId}`, name: `Catalog Media ${runId}` })
    .select("id")
    .single();
  const platformId = platformInsert.data?.id;
  if (platformId !== undefined) fixtures.platformIds.push(platformId);
  record(
    "catalog Platform fixture created",
    platformInsert.error === null,
    errorDetail(platformInsert),
  );

  const gamesInsert = await admin
    .from("games")
    .insert(
      ["publishable", "noncommercial", "restricted", "unknown", "missing"].map((suffix) => ({
        canonical_title: `Catalog Media ${suffix} ${runId}`,
      })),
    )
    .select("id, canonical_title")
    .order("canonical_title");
  record("five Game fixtures created", gamesInsert.error === null, errorDetail(gamesInsert));
  const games = Object.fromEntries(
    (gamesInsert.data ?? []).map((row) => [row.canonical_title.split(" ")[2], row.id]),
  );
  fixtures.gameIds.push(...Object.values(games));

  const editionsInsert = await admin
    .from("editions")
    .insert([
      { game_id: games.publishable, platform_id: platformId, edition_name: "Publishable" },
      { game_id: games.noncommercial, platform_id: platformId, edition_name: null },
      { game_id: games.noncommercial, platform_id: platformId, edition_name: "Collector" },
      { game_id: games.restricted, platform_id: platformId, edition_name: "Restricted" },
    ])
    .select("id, game_id, edition_name");
  record(
    "four Edition fixtures created",
    editionsInsert.error === null,
    errorDetail(editionsInsert),
  );
  const editions = Object.fromEntries(
    (editionsInsert.data ?? []).flatMap((row) =>
      row.edition_name ? [[row.edition_name.toLowerCase(), row.id]] : [],
    ),
  );
  fixtures.editionIds.push(...(editionsInsert.data ?? []).map(({ id }) => id));

  const gameCoverInsert = await admin
    .from("catalog_media")
    .insert(media({ game_id: games.publishable, is_primary: true, width: 800, height: 1100 }))
    .select("*")
    .single();
  record(
    "A. trusted setup inserts a reusable Game cover",
    gameCoverInsert.error === null,
    errorDetail(gameCoverInsert),
  );

  const editionCoverInsert = await admin
    .from("catalog_media")
    .insert(media({ edition_id: editions.publishable, is_primary: true }))
    .select("*")
    .single();
  record(
    "B. trusted setup inserts a reusable Edition cover",
    editionCoverInsert.error === null,
    errorDetail(editionCoverInsert),
  );

  const licensedInsert = await admin
    .from("catalog_media")
    .insert(
      media({
        game_id: games.publishable,
        kind: "artwork",
        rights_status: "licensed",
        is_primary: true,
      }),
    )
    .select("id")
    .single();
  const noncommercialEdition = editionsInsert.data.find(
    ({ game_id, edition_name }) => game_id === games.noncommercial && edition_name === null,
  );
  const noncommercialVariant = editionsInsert.data.find(
    ({ game_id, edition_name }) => game_id === games.noncommercial && edition_name === "Collector",
  );
  const noncommercialInsert = await admin
    .from("catalog_media")
    .insert(
      media({
        edition_id: noncommercialEdition?.id,
        rights_status: "noncommercial",
        is_primary: true,
        attribution: "Data by MobyGames.com",
      }),
    )
    .select("*")
    .single();
  const noncommercialVariantInsert = await admin.from("catalog_media").insert(
    media({
      edition_id: noncommercialVariant?.id,
      rights_status: "noncommercial",
      is_primary: true,
      attribution: "Data by MobyGames.com",
    }),
  );
  const restrictedInsert = await admin
    .from("catalog_media")
    .insert(media({ game_id: games.restricted, is_primary: false, rights_status: "restricted" }))
    .select("id")
    .single();
  const unknownInsert = await admin
    .from("catalog_media")
    .insert(media({ game_id: games.unknown, is_primary: false, rights_status: "unknown" }))
    .select("id")
    .single();
  record(
    "licensed media can be primary",
    licensedInsert.error === null,
    errorDetail(licensedInsert),
  );
  record(
    "noncommercial media can be primary without implying commercial rights",
    noncommercialInsert.error === null && noncommercialVariantInsert.error === null,
    noncommercialInsert.error?.message ?? noncommercialVariantInsert.error?.message,
  );
  record(
    "restricted and unknown non-primary provenance rows remain allowed",
    restrictedInsert.error === null && unknownInsert.error === null,
    restrictedInsert.error?.message ?? unknownInsert.error?.message,
  );

  const restrictedPrimary = await admin.from("catalog_media").insert(
    media({
      game_id: games.restricted,
      kind: "cover_back",
      rights_status: "restricted",
      is_primary: true,
    }),
  );
  record(
    "restricted media cannot be primary",
    restrictedPrimary.error !== null,
    errorDetail(restrictedPrimary),
  );

  const unknownPrimary = await admin.from("catalog_media").insert(
    media({
      game_id: games.unknown,
      kind: "cover_back",
      rights_status: "unknown",
      is_primary: true,
    }),
  );
  record(
    "unknown-rights media cannot be primary",
    unknownPrimary.error !== null,
    errorDetail(unknownPrimary),
  );

  const primaryRightsDowngrade = await admin
    .from("catalog_media")
    .update({ rights_status: "restricted" })
    .eq("id", gameCoverInsert.data.id);
  record(
    "a primary asset cannot be updated to restricted rights",
    primaryRightsDowngrade.error !== null,
    errorDetail(primaryRightsDowngrade),
  );

  const secondTargetUpdate = await admin
    .from("catalog_media")
    .update({ edition_id: editions.publishable })
    .eq("id", gameCoverInsert.data.id);
  record(
    "target XOR is enforced on UPDATE",
    secondTargetUpdate.error !== null,
    errorDetail(secondTargetUpdate),
  );

  const anonReusable = await anonymous
    .from("catalog_media")
    .select("id")
    .eq("id", gameCoverInsert.data.id);
  record(
    "C. anon reads reusable media",
    anonReusable.data?.length === 1,
    errorDetail(anonReusable),
  );

  const authReusable = await authenticated
    .from("catalog_media")
    .select("id")
    .eq("id", gameCoverInsert.data.id);
  record(
    "D. authenticated reads reusable media",
    authReusable.data?.length === 1,
    errorDetail(authReusable),
  );

  const anonLicensed = await anonymous
    .from("catalog_media")
    .select("id")
    .eq("id", licensedInsert.data.id);
  record(
    "E. licensed media is readable",
    anonLicensed.data?.length === 1,
    errorDetail(anonLicensed),
  );

  const anonNoncommercial = await anonymous
    .from("catalog_media")
    .select("id")
    .eq("id", noncommercialInsert.data.id);
  record(
    "authorized local noncommercial mode exposes noncommercial media",
    anonNoncommercial.data?.length === 1,
    errorDetail(anonNoncommercial),
  );

  const commercialApi = await getPrimaryEditionCover(anonymous, noncommercialEdition.id, {
    usageMode: "commercial",
  });
  const noncommercialApi = await getPrimaryEditionCover(anonymous, noncommercialEdition.id, {
    usageMode: "noncommercial",
  });
  record(
    "canonical data policy displays Hobbyist media only in noncommercial mode",
    commercialApi.outcome === "ok" &&
      commercialApi.data === null &&
      noncommercialApi.outcome === "ok" &&
      noncommercialApi.data?.rightsStatus === "noncommercial" &&
      isCatalogMediaDisplayable("noncommercial", "noncommercial") &&
      !isCatalogMediaDisplayable("noncommercial", "commercial"),
    `${commercialApi.outcome} / ${noncommercialApi.outcome}`,
  );

  const commercialServerMode = await admin
    .from("catalog_media_usage_configuration")
    .update({ usage_mode: "commercial" })
    .eq("singleton", true);
  const serverRejected = await anonymous
    .from("catalog_media")
    .select("id")
    .eq("id", noncommercialInsert.data.id);
  const restoreServerMode = await admin
    .from("catalog_media_usage_configuration")
    .update({ usage_mode: "noncommercial" })
    .eq("singleton", true);
  record(
    "server-side commercial mode rejects noncommercial media and local mode restores cleanly",
    commercialServerMode.error === null &&
      serverRejected.data?.length === 0 &&
      restoreServerMode.error === null,
    commercialServerMode.error?.message ??
      serverRejected.error?.message ??
      restoreServerMode.error?.message,
  );

  const anonRestricted = await anonymous
    .from("catalog_media")
    .select("id")
    .eq("id", restrictedInsert.data.id);
  record(
    "F. restricted media is not exposed",
    anonRestricted.data?.length === 0,
    errorDetail(anonRestricted),
  );

  const authUnknown = await authenticated
    .from("catalog_media")
    .select("id")
    .eq("id", unknownInsert.data.id);
  record(
    "G. unknown-rights media is not exposed",
    authUnknown.data?.length === 0,
    errorDetail(authUnknown),
  );

  const clientInsert = await authenticated
    .from("catalog_media")
    .insert(media({ game_id: games.missing }));
  record("H. client INSERT is rejected", clientInsert.error !== null, errorDetail(clientInsert));

  const clientUpdate = await authenticated
    .from("catalog_media")
    .update({ attribution: "not allowed" })
    .eq("id", gameCoverInsert.data.id);
  record("I. client UPDATE is rejected", clientUpdate.error !== null, errorDetail(clientUpdate));

  const clientDelete = await authenticated
    .from("catalog_media")
    .delete()
    .eq("id", gameCoverInsert.data.id);
  record("J. client DELETE is rejected", clientDelete.error !== null, errorDetail(clientDelete));

  const bothTargets = await admin
    .from("catalog_media")
    .insert(media({ game_id: games.publishable, edition_id: editions.publishable }));
  record(
    "K. Game and Edition together are rejected",
    bothTargets.error !== null,
    errorDetail(bothTargets),
  );

  const noTarget = await admin.from("catalog_media").insert(media({}));
  record("L. missing both targets is rejected", noTarget.error !== null, errorDetail(noTarget));

  const secondGamePrimary = await admin
    .from("catalog_media")
    .insert(media({ game_id: games.publishable, is_primary: true }));
  record(
    "M. second primary Game cover is rejected",
    secondGamePrimary.error !== null,
    errorDetail(secondGamePrimary),
  );

  const secondEditionPrimary = await admin
    .from("catalog_media")
    .insert(media({ edition_id: editions.publishable, is_primary: true }));
  record(
    "N. second primary Edition cover is rejected",
    secondEditionPrimary.error !== null,
    errorDetail(secondEditionPrimary),
  );

  const nonPrimary = await admin
    .from("catalog_media")
    .insert([
      media({ game_id: games.publishable, is_primary: false }),
      media({ game_id: games.publishable, is_primary: false }),
    ]);
  record(
    "O. multiple non-primary covers are allowed",
    nonPrimary.error === null,
    errorDetail(nonPrimary),
  );

  const scopedSourceAssetId = randomUUID();
  const firstScopedSource = await admin.from("catalog_media").insert(
    media({
      game_id: games.missing,
      kind: "artwork",
      source_asset_id: scopedSourceAssetId,
    }),
  );
  const duplicateScopedSource = await admin.from("catalog_media").insert(
    media({
      game_id: games.missing,
      kind: "logo",
      source_asset_id: scopedSourceAssetId,
    }),
  );
  const sharedSourceDifferentTarget = await admin.from("catalog_media").insert(
    media({
      edition_id: editions.restricted,
      kind: "artwork",
      source_asset_id: scopedSourceAssetId,
    }),
  );
  record(
    "source assets are idempotent per target and reusable across targets",
    firstScopedSource.error === null &&
      duplicateScopedSource.error !== null &&
      sharedSourceDifferentTarget.error === null,
    duplicateScopedSource.error?.message,
  );

  const nullableSourceIds = await admin.from("catalog_media").insert([
    media({
      game_id: games.missing,
      kind: "cover_back",
      source_asset_id: null,
    }),
    media({
      game_id: games.missing,
      kind: "logo",
      source_asset_id: null,
    }),
  ]);
  record(
    "multiple provenance rows with null source asset ids are allowed",
    nullableSourceIds.error === null,
    errorDetail(nullableSourceIds),
  );

  const invalidKind = await admin
    .from("catalog_media")
    .insert(media({ game_id: games.missing, kind: "screenshot" }));
  record("P. invalid media kind is rejected", invalidKind.error !== null, errorDetail(invalidKind));

  const invalidRights = await admin
    .from("catalog_media")
    .insert(media({ game_id: games.missing, rights_status: "development_only" }));
  record(
    "Q. invalid rights status is rejected",
    invalidRights.error !== null,
    errorDetail(invalidRights),
  );

  const invalidDimensions = await admin
    .from("catalog_media")
    .insert(media({ game_id: games.missing, width: 0, height: -1 }));
  record(
    "R. invalid dimensions are rejected",
    invalidDimensions.error !== null,
    errorDetail(invalidDimensions),
  );

  const gameCover = await getPrimaryGameCover(anonymous, games.publishable);
  record(
    "S. getPrimaryGameCover maps the domain model",
    gameCover.outcome === "ok" &&
      gameCover.data?.gameId === games.publishable &&
      gameCover.data.editionId === null &&
      gameCover.data.kind === "cover_front" &&
      gameCover.data.rightsStatus === "reusable",
    gameCover.outcome,
  );

  const editionCover = await getPrimaryEditionCover(authenticated, editions.publishable);
  record(
    "T. getPrimaryEditionCover maps the domain model",
    editionCover.outcome === "ok" &&
      editionCover.data?.editionId === editions.publishable &&
      editionCover.data.gameId === null,
    editionCover.outcome,
  );

  const presentationCover = await getGamePresentationCover(authenticated, games.noncommercial, {
    usageMode: "noncommercial",
  });
  record(
    "Game presentation deterministically prefers a standard Edition front cover",
    presentationCover.outcome === "ok" &&
      presentationCover.data?.gameId === games.noncommercial &&
      presentationCover.data.media.editionId === noncommercialEdition.id &&
      presentationCover.data.media.attribution === "Data by MobyGames.com",
    presentationCover.outcome,
  );

  const gameArtwork = await getPrimaryGameArtwork(anonymous, games.publishable);
  record(
    "publishable About artwork is selected independently from package cover",
    gameArtwork.outcome === "ok" &&
      gameArtwork.data?.kind === "artwork" &&
      gameArtwork.data.rightsStatus === "licensed",
    gameArtwork.outcome,
  );

  const missingCover = await getPrimaryGameCover(anonymous, games.missing);
  record(
    "U. missing cover is ok/null",
    missingCover.outcome === "ok" && missingCover.data === null,
    missingCover.outcome,
  );

  const countedGames = createCountingClient(environment.url, environment.anonKey);
  const bulkGames = await getPrimaryGameCovers(countedGames.client, [
    games.publishable,
    games.missing,
  ]);
  const countedEditions = createCountingClient(environment.url, environment.anonKey);
  const bulkEditions = await getPrimaryEditionCovers(countedEditions.client, [
    editions.publishable,
    editions.restricted,
  ]);
  record(
    "V. bulk Game and Edition lookups each use one bounded request",
    bulkGames.outcome === "ok" &&
      bulkEditions.outcome === "ok" &&
      countedGames.requests() === 1 &&
      countedEditions.requests() === 1,
    `${countedGames.requests()} Game / ${countedEditions.requests()} Edition requests`,
  );

  let oversizedBatchRejected = false;

  try {
    await getPrimaryGameCovers(
      anonymous,
      Array.from({ length: 101 }, () => randomUUID()),
    );
  } catch (error) {
    oversizedBatchRejected = error instanceof RangeError;
  }

  record("bulk cover lookup rejects more than 100 target ids", oversizedBatchRejected);

  const countedDuplicates = createCountingClient(environment.url, environment.anonKey);
  const duplicateBatch = await getPrimaryGameCovers(countedDuplicates.client, [
    games.publishable,
    games.publishable,
  ]);
  record(
    "bulk cover lookup deduplicates target ids without hidden reads",
    duplicateBatch.outcome === "ok" &&
      duplicateBatch.data.length === 1 &&
      countedDuplicates.requests() === 1,
    `${countedDuplicates.requests()} request(s)`,
  );

  const restrictedApi = await getPrimaryGameCover(admin, games.restricted);
  const unknownBulk = await getPrimaryGameCovers(admin, [games.restricted, games.unknown]);
  record(
    "W. restricted and unknown media cannot leak through @geek/data",
    restrictedApi.outcome === "ok" &&
      restrictedApi.data === null &&
      unknownBulk.outcome === "ok" &&
      unknownBulk.data.length === 0,
    `${restrictedApi.outcome} / ${unknownBulk.outcome}`,
  );

  const validRow = gameCoverInsert.data;
  recordRejects("mapper rejects unknown media kinds", "catalog_media.kind", () =>
    toCatalogMedia({ ...validRow, kind: "video" }),
  );
  recordRejects("mapper rejects unknown rights statuses", "catalog_media.rights_status", () =>
    toCatalogMedia({ ...validRow, rights_status: "maybe" }),
  );
  recordRejects("mapper rejects unusable asset URLs", "catalog_media.asset_url", () =>
    toCatalogMedia({ ...validRow, asset_url: "relative/cover.jpg" }),
  );
} finally {
  if (fixtures.userId !== null) {
    const removedUser = await admin.auth.admin.deleteUser(fixtures.userId);
    record("fixture user removed", removedUser.error === null, removedUser.error?.message);
  }

  for (const [table, ids] of [
    ["editions", fixtures.editionIds],
    ["games", fixtures.gameIds],
    ["platforms", fixtures.platformIds],
  ]) {
    if (ids.length === 0) continue;
    const removed = await admin.from(table).delete().in("id", ids);
    record(`${table} fixtures removed`, removed.error === null, removed.error?.message);
  }
}

const failed = results.filter((result) => !result.passed);
process.stdout.write(`\n${results.length - failed.length}/${results.length} checks passed\n`);
process.exitCode = failed.length === 0 ? 0 : 1;
