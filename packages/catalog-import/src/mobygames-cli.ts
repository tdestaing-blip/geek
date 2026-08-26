import { execFileSync } from "node:child_process";
import process from "node:process";

import type { Database } from "@geek/supabase";
import { createClient } from "@supabase/supabase-js";

import { writeMobyGamesImportPlan } from "./mobygames-database.ts";
import {
  countMobyGamesSourceCoverGroups,
  executeMobyGamesImport,
  MobyGamesClient,
  type MobyGamesEditionCandidate,
  type MobyGamesImportPlan,
} from "./mobygames.ts";

type CliOptions = {
  readonly gameId: number;
  readonly platformId: number;
  readonly dryRun: boolean;
  readonly delayMs: number;
};

const options = parseArguments(process.argv.slice(2));
const apiKey = process.env.MOBYGAMES_API_KEY;
if (apiKey === undefined || apiKey.trim() === "") {
  throw new Error("MOBYGAMES_API_KEY is required");
}

const client = new MobyGamesClient({ apiKey, delayMs: options.delayMs });
const execution = await executeMobyGamesImport({
  client,
  gameId: options.gameId,
  platformId: options.platformId,
  dryRun: options.dryRun,
  write: async (plan) => {
    const environment = readSupabaseEnvironment();
    const supabase = createClient<Database>(environment.url, environment.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return writeMobyGamesImportPlan(supabase, plan);
  },
});
printPlan(execution.plan, execution.result);

function parseArguments(arguments_: readonly string[]): CliOptions {
  let gameId: number | null = null;
  let platformId: number | null = null;
  let dryRun = false;
  let delayMs = 5_000;

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--") continue;
    if (argument === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (argument === "--game-id" || argument === "--platform-id" || argument === "--delay-ms") {
      const raw = arguments_[index + 1];
      if (raw === undefined || raw.startsWith("--"))
        throw new RangeError(`${argument} requires a value`);
      const value = Number(raw);
      if (!Number.isInteger(value) || value <= 0)
        throw new RangeError(`${argument} must be a positive integer`);
      if (argument === "--game-id") gameId = value;
      else if (argument === "--platform-id") platformId = value;
      else delayMs = value;
      index += 1;
      continue;
    }
    throw new RangeError(`unknown MobyGames import argument: ${argument}`);
  }

  if (gameId === null || platformId === null) {
    throw new RangeError("usage: --game-id <id> --platform-id <id> [--dry-run] [--delay-ms <ms>]");
  }
  return { gameId, platformId, dryRun, delayMs };
}

function printPlan(
  plan: MobyGamesImportPlan,
  result: Awaited<ReturnType<typeof writeMobyGamesImportPlan>> | null,
): void {
  const proposed = plan.editions.filter(({ canonicalizable }) => canonicalizable);
  const ambiguous = plan.editions.filter(({ canonicalizable }) => !canonicalizable);
  process.stdout.write(
    `${JSON.stringify(
      {
        mode: result === null ? "dry-run" : "import",
        game: {
          provider: plan.provider,
          externalId: plan.gameExternalId,
          title: plan.canonicalTitle,
        },
        platform: {
          externalId: plan.platformExternalId,
          name: plan.platformName,
        },
        sourceRecords: plan.sourceRecords.map(
          ({ recordType, sourceKey, providerExternalId, checksum }) => ({
            recordType,
            sourceKey,
            providerExternalId,
            checksum,
          }),
        ),
        sourceReleases: plan.editions.reduce(
          (count, edition) =>
            count + edition.evidence.filter(({ kind }) => kind === "release").length,
          0,
        ),
        sourceCoverGroups: countMobyGamesSourceCoverGroups(plan),
        proposedEditions: proposed.map((candidate) => summarizeCandidate(candidate, result)),
        ambiguousCandidates: ambiguous.map((candidate) => summarizeCandidate(candidate, result)),
        unresolvedEvidence: plan.unresolvedEvidence,
        writes: result,
      },
      null,
      2,
    )}\n`,
  );
}

function summarizeCandidate(
  candidate: MobyGamesEditionCandidate,
  result: Awaited<ReturnType<typeof writeMobyGamesImportPlan>> | null,
) {
  const reconciliation = result?.candidateReconciliations.find(
    ({ candidateKey }) => candidateKey === candidate.key,
  );
  return {
    key: candidate.key,
    region: candidate.regionCode,
    variant: candidate.editionName,
    releaseEvidenceCount: candidate.evidence.filter(({ kind }) => kind === "release").length,
    matchedCoverGroups: candidate.evidence.filter(({ kind }) => kind === "cover_group").length,
    strongPhysicalIdentifiers: candidate.identifiers.filter(
      ({ identityRole }) => identityRole === "strong_physical",
    ),
    corroboratingIdentifiers: candidate.identifiers.filter(
      ({ identityRole }) => identityRole === "corroborating",
    ),
    weakIdentifiers: candidate.identifiers.filter(({ identityRole }) => identityRole === "weak"),
    releaseDates: candidate.releaseDates,
    groupingReasons: candidate.groupingReasons,
    components: candidate.components.map(({ componentKey }) => componentKey),
    media: candidate.media.map(({ kind, sourceAssetId }) => ({ kind, sourceAssetId })),
    deterministic: candidate.canonicalizable,
    ambiguities: candidate.ambiguities,
    reconciliationStatus: reconciliation?.status ?? candidate.reconciliationStatus,
  };
}

function readSupabaseEnvironment(): { readonly url: string; readonly serviceRoleKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url !== undefined && serviceRoleKey !== undefined) return { url, serviceRoleKey };

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
