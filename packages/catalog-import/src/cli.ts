import { execFileSync } from "node:child_process";
import process from "node:process";

import type { Database } from "@geek/supabase";
import { createClient } from "@supabase/supabase-js";

import { writeCatalogBatch } from "./database.ts";
import { libretroProvider } from "./libretro.ts";

type CliOptions = {
  readonly sourceRoot: string;
  readonly platformKey: string;
  readonly dryRun: boolean;
};

const options = parseArguments(process.argv.slice(2));
const providerRevision = readProviderRevision(options.sourceRoot);
const batch = await libretroProvider.normalize({
  sourceRoot: options.sourceRoot,
  providerRevision,
  platformKey: options.platformKey,
});

if (options.dryRun) {
  printHumanReport(batch, true);
  printMachineReport("dry-run", batch);
} else {
  const environment = readEnvironment();
  const client = createClient<Database>(environment.url, environment.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const database = await writeCatalogBatch(client, batch);
  printHumanReport(batch, false, database);
  printMachineReport("import", batch, database);
}

function parseArguments(arguments_: readonly string[]): CliOptions {
  let sourceRoot: string | null = null;
  let platformKey: string | null = null;
  let dryRun = false;

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];

    if (argument === "--") continue;

    if (argument === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (argument === "--source" || argument === "--platform") {
      const value = arguments_[index + 1];

      if (value === undefined || value.startsWith("--")) {
        throw new RangeError(`${argument} requires a value`);
      }

      if (argument === "--source") sourceRoot = value;
      else platformKey = value;
      index += 1;
      continue;
    }

    throw new RangeError(`unknown catalog import argument: ${argument}`);
  }

  if (sourceRoot === null || platformKey === null) {
    throw new RangeError(
      "usage: --source <libretro checkout> --platform <reviewed key> [--dry-run]",
    );
  }

  return { sourceRoot, platformKey, dryRun };
}

function readProviderRevision(sourceRoot: string): string {
  const revision = execFileSync("git", ["-C", sourceRoot, "rev-parse", "HEAD"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();

  if (!/^[0-9a-f]{40}$/u.test(revision)) {
    throw new Error("Libretro source must be a Git checkout with a full commit SHA");
  }

  return revision;
}

function readEnvironment(): { readonly url: string; readonly serviceRoleKey: string } {
  const environmentUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
  const environmentKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (environmentUrl !== undefined && environmentKey !== undefined) {
    return { url: environmentUrl, serviceRoleKey: environmentKey };
  }

  const raw = execFileSync("pnpm", ["exec", "supabase", "status", "-o", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const parsed: unknown = JSON.parse(raw);

  if (
    !isRecord(parsed) ||
    typeof parsed.API_URL !== "string" ||
    typeof parsed.SERVICE_ROLE_KEY !== "string"
  ) {
    throw new Error("Supabase status did not provide local import credentials");
  }

  return { url: parsed.API_URL, serviceRoleKey: parsed.SERVICE_ROLE_KEY };
}

function printHumanReport(
  batch: Awaited<ReturnType<typeof libretroProvider.normalize>>,
  dryRun: boolean,
  database?: Awaited<ReturnType<typeof writeCatalogBatch>>,
): void {
  const statistics = batch.statistics;
  const writeLines =
    database === undefined
      ? ["Database writes: 0 (dry run)"]
      : [
          `Created: ${database.database.gamesCreated} Games / ${database.database.editionsCreated} Editions / ${database.database.identifiersCreated} identifiers`,
          `Updated: ${database.database.mappingsUpdated} provider mappings`,
          `Unchanged: ${database.database.gamesUnchanged} Games / ${database.database.editionsUnchanged} Editions`,
        ];
  process.stdout.write(
    [
      `Catalog import ${dryRun ? "dry run" : "write"}`,
      `Provider: ${batch.provider}@${batch.providerRevision}`,
      `Platform: ${batch.platform.name} (${batch.platform.slug})`,
      `Scanned: ${statistics.sourceEntriesScanned}`,
      `Accepted: ${statistics.acceptedEntries}`,
      `Excluded: ${statistics.excludedEntries}`,
      `Skipped: ${statistics.excludedEntries}`,
      `Games: ${statistics.uniqueNormalizedGames}`,
      `Editions: ${statistics.editionsGenerated}`,
      `Identifiers: ${statistics.identifiersGenerated}`,
      `Media: ${batch.media.length}`,
      `Exclusions: ${JSON.stringify(statistics.exclusions)}`,
      `Regions: ${JSON.stringify(statistics.regionDistribution)}`,
      `Conflicts: ${statistics.conflicts}`,
      `Errors: ${statistics.errors}`,
      ...writeLines,
      "",
    ].join("\n"),
  );
}

function printMachineReport(
  mode: "dry-run" | "import",
  batch: Awaited<ReturnType<typeof libretroProvider.normalize>>,
  database?: Awaited<ReturnType<typeof writeCatalogBatch>>,
): void {
  const writeOutcome =
    database === undefined
      ? {
          created: { games: 0, editions: 0, identifiers: 0 },
          updated: { providerMappings: 0 },
          unchanged: { games: 0, editions: 0 },
        }
      : {
          created: {
            games: database.database.gamesCreated,
            editions: database.database.editionsCreated,
            identifiers: database.database.identifiersCreated,
          },
          updated: { providerMappings: database.database.mappingsUpdated },
          unchanged: {
            games: database.database.gamesUnchanged,
            editions: database.database.editionsUnchanged,
          },
        };
  process.stdout.write(
    `${JSON.stringify(
      {
        mode,
        provider: batch.provider,
        providerRevision: batch.providerRevision,
        platform: {
          sourceName: batch.platform.providerSystemName,
          slug: batch.platform.slug,
          name: batch.platform.name,
        },
        statistics: batch.statistics,
        mediaGenerated: batch.media.length,
        outcome: {
          ...writeOutcome,
          skippedEntries: batch.statistics.excludedEntries,
          conflicts: batch.statistics.conflicts,
          errors: batch.statistics.errors,
        },
        ...(database === undefined ? {} : { database }),
      },
      null,
      2,
    )}\n`,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
