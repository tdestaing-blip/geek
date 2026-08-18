/** Focused local validation for the provider-neutral Catalog Import pipeline. */
import { execFileSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";

import { createClient } from "@supabase/supabase-js";

const { getLibretroPlatform, LIBRETRO_PLATFORMS, libretroProvider, writeCatalogBatch } =
  await import("../packages/catalog-import/src/index.ts");

const FIXTURE_REVISION = "fixture:6fd53f98459c9a29a657c37a2efaac9f7dec25e5";
const fixtureRoot = fileURLToPath(
  new URL("../packages/catalog-import/fixtures/libretro/", import.meta.url),
);
const environment = readEnvironment();
const admin = createClient(environment.url, environment.serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const anonymous = createClient(environment.url, environment.anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const results = [];

function record(name, passed, detail) {
  results.push({ name, passed });
  process.stdout.write(`${passed ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}\n`);
}

const batch = await libretroProvider.normalize({
  sourceRoot: fixtureRoot,
  providerRevision: FIXTURE_REVISION,
  platformKey: "snes",
});

try {
  const statistics = batch.statistics;
  record(
    "A. provider parser handles the representative fixture",
    statistics.sourceEntriesScanned === 14 &&
      statistics.acceptedEntries === 7 &&
      statistics.excludedEntries === 7,
    `${statistics.sourceEntriesScanned} scanned / ${statistics.acceptedEntries} accepted`,
  );

  record(
    "B. all 13 reviewed platform families resolve explicitly",
    LIBRETRO_PLATFORMS.length === 13 &&
      new Set(LIBRETRO_PLATFORMS.map((platform) => platform.key)).size === 13 &&
      LIBRETRO_PLATFORMS.every(
        (platform) => getLibretroPlatform(platform.providerSystemName)?.slug === platform.slug,
      ),
  );

  const beforeUnsupported = await catalogCounts();
  record(
    "C. unsupported platforms are rejected before import",
    getLibretroPlatform("Atari - 2600") === null,
  );
  record("D. retail releases normalize into canonical candidates", batch.games.length === 4);
  record(
    "E. explicit prototype, beta, demo, hack, homebrew and digital noise is measured",
    statistics.exclusions.prototype === 1 &&
      statistics.exclusions.beta === 1 &&
      statistics.exclusions.demo === 1 &&
      statistics.exclusions.hack === 1 &&
      statistics.exclusions.homebrew === 1 &&
      statistics.exclusions.unsupported === 1,
    JSON.stringify(statistics.exclusions),
  );
  record(
    "S. meaningful parenthetical title identity is preserved",
    batch.games.some((game) => game.canonicalTitle === "Championship Racer (Collector's Cut)"),
  );

  execFileSync(
    "pnpm",
    ["catalog:import:libretro", "--", "--source", fixtureRoot, "--platform", "snes", "--dry-run"],
    { cwd: fileURLToPath(new URL("../", import.meta.url)), stdio: "pipe" },
  );
  const afterDryRun = await catalogCounts();
  record(
    "O. CLI dry run performs zero database writes",
    JSON.stringify(beforeUnsupported) === JSON.stringify(afterDryRun),
  );

  const first = await writeCatalogBatch(admin, batch);
  const firstCounts = await importedCounts();
  record(
    "F. first import creates each source record once",
    first.database.gamesCreated === 4 && first.database.editionsCreated === 7,
    JSON.stringify(first.database),
  );

  const second = await writeCatalogBatch(admin, batch);
  const secondCounts = await importedCounts();
  record(
    "G. identical provider revision rerun creates no duplicates",
    second.database.gamesCreated === 0 &&
      second.database.editionsCreated === 0 &&
      second.database.identifiersCreated === 0 &&
      JSON.stringify(firstCounts) === JSON.stringify(secondCounts),
    JSON.stringify(second.database),
  );

  const gameMappings = await admin
    .from("game_provider_mappings")
    .select("game_id, external_id, games!inner (id, canonical_title)")
    .eq("provider", batch.provider);
  record(
    "H. imported Games use canonical Geek UUIDs",
    gameMappings.error === null &&
      gameMappings.data.length === 4 &&
      gameMappings.data.every((mapping) => /^[0-9a-f-]{36}$/u.test(mapping.game_id)),
    gameMappings.error?.message,
  );
  record(
    "I. provider references remain external mappings only",
    gameMappings.error === null &&
      gameMappings.data.every(
        (mapping) =>
          mapping.external_id.startsWith("group:") && mapping.external_id !== mapping.game_id,
      ),
  );

  const streetFighter = batch.games.find((game) => game.canonicalTitle === "Street Fighter II");
  record(
    "J. USA, Europe and Japan releases remain separate Editions of one Game",
    streetFighter?.editions.length === 3 &&
      new Set(streetFighter.editions.map((edition) => edition.regionCode)).size === 3,
  );

  const mediaCount = await count("catalog_media");
  record(
    "K. Libretro import creates no CatalogMedia or thumbnail references",
    batch.media.length === 0 && mediaCount === 0,
  );

  const clientWrite = await anonymous.rpc("import_catalog_batch", {
    provider_name: "libretro-database",
    provider_revision: "forbidden",
    platform_slug: "forbidden",
    platform_name: "Forbidden",
    platform_manufacturer: "Forbidden",
    normalized_games: [],
    import_summary: {},
  });
  record(
    "L. normal clients cannot invoke trusted import writes",
    clientWrite.error !== null,
    clientWrite.error?.code,
  );

  const search = await anonymous.rpc("search_catalog", {
    search_query: "Street Fighter II",
    result_limit: 20,
    result_offset: 0,
  });
  record(
    "M. representative imported Game is discoverable through existing search",
    search.error === null &&
      search.data.some(
        (result) => result.result_kind === "game" && result.primary_title === "Street Fighter II",
      ),
    search.error?.message,
  );

  const partialExternalId = "partial-rollback-game";
  const partial = await admin.rpc("import_catalog_batch", {
    provider_name: batch.provider,
    provider_revision: FIXTURE_REVISION,
    platform_slug: batch.platform.slug,
    platform_name: batch.platform.name,
    platform_manufacturer: batch.platform.manufacturer,
    normalized_games: [
      {
        externalId: partialExternalId,
        canonicalTitle: "Must Roll Back",
        sourceTitle: "Must Roll Back",
        editions: [],
      },
      {
        externalId: "invalid-second-record",
        canonicalTitle: "Invalid",
        sourceTitle: "",
        editions: [],
      },
    ],
    import_summary: {},
  });
  const orphan = await admin
    .from("game_provider_mappings")
    .select("game_id")
    .eq("provider", batch.provider)
    .eq("external_id", partialExternalId);
  record(
    "N. partial failure leaves no orphan canonical identity or provenance",
    partial.error !== null && orphan.error === null && orphan.data.length === 0,
    partial.error?.message,
  );

  record(
    "P. report counts reconcile with actual database results",
    statistics.acceptedEntries === statistics.editionsGenerated &&
      statistics.sourceEntriesScanned === statistics.acceptedEntries + statistics.excludedEntries &&
      firstCounts.games === statistics.uniqueNormalizedGames &&
      firstCounts.editions === statistics.editionsGenerated &&
      firstCounts.identifiers === statistics.identifiersGenerated,
    JSON.stringify(firstCounts),
  );

  const runs = await admin
    .from("catalog_import_runs")
    .select("provider_revision, status, dry_run, summary")
    .eq("provider", batch.provider)
    .eq("provider_revision", FIXTURE_REVISION);
  record(
    "Q. real import runs record the exact provider revision and summary",
    runs.error === null &&
      runs.data.length === 2 &&
      runs.data.every(
        (run) =>
          run.provider_revision === FIXTURE_REVISION && run.status === "succeeded" && !run.dry_run,
      ),
    runs.error?.message,
  );

  const afterImport = await catalogCounts();
  record(
    "R. import touches no Copy or user-owned data",
    afterImport.copies === beforeUnsupported.copies,
    `${beforeUnsupported.copies} before / ${afterImport.copies} after`,
  );
} finally {
  await cleanup();
}

const failed = results.filter((result) => !result.passed);
process.stdout.write(`\n${results.length - failed.length}/${results.length} checks passed\n`);
process.exitCode = failed.length === 0 ? 0 : 1;

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

async function count(table) {
  const result = await admin.from(table).select("*", { count: "exact", head: true });
  if (result.error !== null) throw result.error;
  return result.count ?? 0;
}

async function catalogCounts() {
  return {
    games: await count("games"),
    editions: await count("editions"),
    gameMappings: await count("game_provider_mappings"),
    editionMappings: await count("edition_provider_mappings"),
    runs: await count("catalog_import_runs"),
    copies: await count("copies"),
    media: await count("catalog_media"),
  };
}

async function importedCounts() {
  const gameMappings = await admin
    .from("game_provider_mappings")
    .select("game_id")
    .eq("provider", batch.provider);
  const editionMappings = await admin
    .from("edition_provider_mappings")
    .select("edition_id")
    .eq("provider", batch.provider);
  if (gameMappings.error !== null) throw gameMappings.error;
  if (editionMappings.error !== null) throw editionMappings.error;
  const editionIds = editionMappings.data.map((mapping) => mapping.edition_id);
  let identifiers = 0;

  if (editionIds.length > 0) {
    const identifierResult = await admin
      .from("edition_identifiers")
      .select("id", { count: "exact" })
      .in("edition_id", editionIds);
    if (identifierResult.error !== null) throw identifierResult.error;
    identifiers = identifierResult.count ?? identifierResult.data.length;
  }

  return {
    games: gameMappings.data.length,
    editions: editionMappings.data.length,
    identifiers,
  };
}

async function cleanup() {
  const runs = await admin
    .from("catalog_import_runs")
    .delete()
    .eq("provider", batch.provider)
    .eq("provider_revision", FIXTURE_REVISION);
  if (runs.error !== null) throw runs.error;

  const editionMappings = await admin
    .from("edition_provider_mappings")
    .select("edition_id")
    .eq("provider", batch.provider);
  if (editionMappings.error !== null) throw editionMappings.error;
  const editionIds = editionMappings.data.map((mapping) => mapping.edition_id);
  if (editionIds.length > 0) {
    const editions = await admin.from("editions").delete().in("id", editionIds);
    if (editions.error !== null) throw editions.error;
  }

  const gameMappings = await admin
    .from("game_provider_mappings")
    .select("game_id")
    .eq("provider", batch.provider);
  if (gameMappings.error !== null) throw gameMappings.error;
  const gameIds = gameMappings.data.map((mapping) => mapping.game_id);
  if (gameIds.length > 0) {
    const games = await admin.from("games").delete().in("id", gameIds);
    if (games.error !== null) throw games.error;
  }

  const platform = await admin.from("platforms").delete().eq("slug", batch.platform.slug);
  if (platform.error !== null) throw platform.error;
}
