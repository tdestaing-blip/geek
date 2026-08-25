import { createHash } from "node:crypto";

const PROVIDER = "mobygames";
const TRANSIENT_STATUSES = new Set([429, 500, 502, 503, 504]);
const EUROPEAN_COUNTRIES = new Set([
  "Austria",
  "Belgium",
  "Denmark",
  "Europe",
  "Finland",
  "France",
  "Germany",
  "Ireland",
  "Italy",
  "Netherlands",
  "Norway",
  "Portugal",
  "Spain",
  "Sweden",
  "Switzerland",
  "United Kingdom",
]);

export type MobyGamesRecordType = "game" | "platform" | "game_platform" | "covers";

export type MobyGamesSourceRecord = {
  readonly provider: typeof PROVIDER;
  readonly recordType: MobyGamesRecordType;
  readonly sourceKey: string;
  readonly providerExternalId: string | null;
  readonly payload: Record<string, unknown>;
  readonly checksum: string;
  readonly fetchedAt: string;
};

export type MobyGamesIdentifier = {
  readonly scheme:
    | "asin"
    | "ean_13"
    | "ebay_product_id"
    | "nintendo_media_pn"
    | "publisher_product_code"
    | "upc_a";
  readonly value: string;
  readonly authority: "MobyGames";
  readonly identityRole: "strong_physical" | "corroborating" | "weak";
};

export type MobyGamesReconciliationStatus =
  | "NEW"
  | "MATCHED_BY_SOURCE_EVIDENCE"
  | "MATCHED_BY_STRONG_IDENTIFIER"
  | "RECONCILIATION_AMBIGUOUS"
  | "SOURCE_AMBIGUOUS";

export type MobyGamesEvidence = {
  readonly sourceRecordType: "game_platform" | "covers";
  readonly kind: "release" | "cover_group";
  readonly fingerprint: string;
};

export type MobyGamesMedia = {
  readonly kind: "cover_front" | "cover_back";
  readonly assetUrl: string;
  readonly sourceAssetId: string;
  readonly sourcePageUrl: string | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly attribution: "Data by MobyGames.com";
};

export type MobyGamesEditionCandidate = {
  readonly key: string;
  readonly regionCode: string | null;
  readonly editionName: string | null;
  readonly releaseDate: string | null;
  readonly publisherName: string | null;
  readonly identifiers: readonly MobyGamesIdentifier[];
  readonly evidence: readonly MobyGamesEvidence[];
  readonly media: readonly MobyGamesMedia[];
  readonly releaseDates: readonly string[];
  readonly groupingReasons: readonly string[];
  readonly ambiguities: readonly string[];
  readonly canonicalizable: boolean;
  readonly reconciliationStatus: "NEW" | "SOURCE_AMBIGUOUS";
};

export type MobyGamesImportPlan = {
  readonly provider: typeof PROVIDER;
  readonly gameExternalId: string;
  readonly platformExternalId: string;
  readonly platformName: string;
  readonly canonicalTitle: string;
  readonly description: string | null;
  readonly sourceRecords: readonly MobyGamesSourceRecord[];
  readonly editions: readonly MobyGamesEditionCandidate[];
  readonly unresolvedEvidence: readonly string[];
};

export type MobyGamesClientOptions = {
  readonly apiKey: string;
  readonly delayMs?: number;
  readonly maxRetries?: number;
  readonly baseUrl?: string;
  readonly fetchImplementation?: typeof fetch;
  readonly sleep?: (milliseconds: number) => Promise<void>;
};

export type MobyGamesImportExecution<TResult> = {
  readonly plan: MobyGamesImportPlan;
  readonly result: TResult | null;
};

export class MobyGamesClient {
  readonly #apiKey: string;
  readonly #delayMs: number;
  readonly #maxRetries: number;
  readonly #baseUrl: string;
  readonly #fetch: typeof fetch;
  readonly #sleep: (milliseconds: number) => Promise<void>;
  #lastRequestAt = 0;

  constructor(options: MobyGamesClientOptions) {
    if (options.apiKey.trim() === "") throw new Error("MOBYGAMES_API_KEY must be nonblank");
    this.#apiKey = options.apiKey;
    this.#delayMs = options.delayMs ?? 5_000;
    this.#maxRetries = options.maxRetries ?? 2;
    this.#baseUrl = options.baseUrl ?? "https://api.mobygames.com/v1";
    this.#fetch = options.fetchImplementation ?? fetch;
    this.#sleep =
      options.sleep ??
      ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  async fetchImportPlan(gameId: number, platformId: number): Promise<MobyGamesImportPlan> {
    assertPositiveInteger(gameId, "gameId");
    assertPositiveInteger(platformId, "platformId");

    const game = await this.#request(`/games/${gameId}`);
    const gamePlatform = await this.#request(`/games/${gameId}/platforms/${platformId}`);
    const covers = await this.#request(`/games/${gameId}/platforms/${platformId}/covers`);
    return deriveMobyGamesImportPlan({
      game,
      gamePlatform,
      covers,
      fetchedAt: new Date().toISOString(),
    });
  }

  async #request(path: string): Promise<Record<string, unknown>> {
    for (let attempt = 0; attempt <= this.#maxRetries; attempt += 1) {
      const wait = Math.max(0, this.#lastRequestAt + this.#delayMs - Date.now());
      if (wait > 0) await this.#sleep(wait);

      const url = new URL(`${this.#baseUrl}${path}`);
      url.searchParams.set("api_key", this.#apiKey);

      try {
        this.#lastRequestAt = Date.now();
        const response = await this.#fetch(url);

        if (response.ok) return requireRecord(await response.json(), `MobyGames ${path}`);
        if (!TRANSIENT_STATUSES.has(response.status) || attempt === this.#maxRetries) {
          throw new Error(`MobyGames ${path} failed with HTTP ${response.status}`);
        }

        const retryAfter = Number(response.headers.get("retry-after"));
        await this.#sleep(
          Number.isFinite(retryAfter) ? retryAfter * 1_000 : this.#delayMs * (attempt + 1),
        );
      } catch (error) {
        if (attempt === this.#maxRetries || !isTransientFetchError(error)) throw error;
        await this.#sleep(this.#delayMs * (attempt + 1));
      }
    }

    throw new Error("MobyGames retry loop ended unexpectedly");
  }
}

/** Keeps dry-run behavior structurally incapable of invoking the trusted writer. */
export async function executeMobyGamesImport<TResult>(input: {
  readonly client: Pick<MobyGamesClient, "fetchImportPlan">;
  readonly gameId: number;
  readonly platformId: number;
  readonly dryRun: boolean;
  readonly write: (plan: MobyGamesImportPlan) => Promise<TResult>;
}): Promise<MobyGamesImportExecution<TResult>> {
  const plan = await input.client.fetchImportPlan(input.gameId, input.platformId);
  return {
    plan,
    result: input.dryRun ? null : await input.write(plan),
  };
}

export function deriveMobyGamesImportPlan(input: {
  readonly game: Record<string, unknown>;
  readonly gamePlatform: Record<string, unknown>;
  readonly covers: Record<string, unknown>;
  readonly fetchedAt: string;
}): MobyGamesImportPlan {
  const gameId = requireInteger(input.game, "game_id");
  const platformId = requireInteger(input.gamePlatform, "platform_id");
  const canonicalTitle = requireString(input.game, "title");
  const platformName = requireString(input.gamePlatform, "platform_name");
  const sourceKey = `${gameId}:${platformId}`;
  const sourceRecords: readonly MobyGamesSourceRecord[] = [
    sourceRecord("game", String(gameId), String(gameId), input.game, input.fetchedAt),
    sourceRecord(
      "platform",
      String(platformId),
      String(platformId),
      { platform_id: platformId, platform_name: platformName },
      input.fetchedAt,
    ),
    sourceRecord("game_platform", sourceKey, null, input.gamePlatform, input.fetchedAt),
    sourceRecord("covers", sourceKey, null, input.covers, input.fetchedAt),
  ];
  const releases = arrayOfRecords(input.gamePlatform["releases"]);
  const groups = arrayOfRecords(input.covers["cover_groups"]);
  const grouped = partitionReleaseEvidence(gameId, platformId, releases);
  const unresolvedEvidence: string[] = [];

  groups.forEach((group) => {
    const regionCode = normalizeMobyGamesRegion(stringArray(group["countries"]), []);
    const variant = variantLabel(optionalString(group["comments"]));
    const exact = grouped.filter(
      (candidate) =>
        regionCodesOverlap(candidate.regionCode, regionCode) && candidate.variant === variant,
    );
    const compatibleRegion = grouped.filter((candidate) =>
      regionCodesOverlap(candidate.regionCode, regionCode),
    );
    const candidate =
      exact.length === 1
        ? exact[0]
        : variant === null && compatibleRegion.length === 1
          ? compatibleRegion[0]
          : undefined;

    if (candidate === undefined) {
      unresolvedEvidence.push(`cover_group:${evidenceFingerprint(group)}`);
      return;
    }

    candidate.evidence.push({
      sourceRecordType: "covers",
      kind: "cover_group",
      fingerprint: evidenceFingerprint(group),
    });
    const media = mediaFromGroup(group);
    candidate.media.push(...media);
    if (
      variant !== null &&
      candidate.variant === variant &&
      exact.length === 1 &&
      media.length > 0
    ) {
      candidate.hasSafelyAssociatedPhysicalPackageEvidence = true;
      candidate.groupingReasons.push(`variant_specific_physical_package_evidence:${variant}`);
    }
  });

  const editions = grouped
    .map(finalizeCandidate)
    .sort((left, right) => left.key.localeCompare(right.key, "en"));

  return {
    provider: PROVIDER,
    gameExternalId: String(gameId),
    platformExternalId: String(platformId),
    platformName,
    canonicalTitle,
    description: sanitizeDescription(optionalString(input.game["description"])),
    sourceRecords,
    editions,
    unresolvedEvidence: unresolvedEvidence.sort(),
  };
}

export function countMobyGamesSourceCoverGroups(plan: MobyGamesImportPlan): number {
  const covers = plan.sourceRecords.find(({ recordType }) => recordType === "covers");
  return covers === undefined ? 0 : arrayOfRecords(covers.payload["cover_groups"]).length;
}

export function classifyMobyGamesIdentifierScheme(
  scheme: string,
): MobyGamesIdentifier["identityRole"] {
  if (scheme === "nintendo_media_pn") return "strong_physical";
  if (scheme === "upc_a" || scheme === "ean_13") return "corroborating";
  return "weak";
}

export function normalizeMobyGamesRegion(
  countries: readonly string[],
  identifiers: readonly MobyGamesIdentifier[],
): string | null {
  const codes = new Set<string>();
  for (const country of countries) {
    if (EUROPEAN_COUNTRIES.has(country)) codes.add("EU");
    else if (country === "Japan") codes.add("JP");
    else if (country === "United States") codes.add("US");
    else if (country === "Canada") codes.add("CA");
    else if (country === "Mexico") codes.add("MX");
    else if (country === "Australia") codes.add("AU");
    else if (country === "New Zealand") codes.add("NZ");
    else if (country === "Brazil") codes.add("BR");
    else if (country === "China") codes.add("CN");
    else if (country === "South Korea") codes.add("KR");
  }

  if (codes.size === 0 && identifiers.some(({ value }) => /-EUR$/iu.test(value))) codes.add("EU");
  if (codes.has("AU") && codes.has("NZ")) return "AU+NZ";
  return codes.size === 0 ? null : [...codes].sort().join("+");
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right, "en"))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** Mirrors the source-record revision rule used by the trusted database function. */
export function nextSourceRevision(
  currentChecksum: string,
  nextChecksum: string,
  currentRevision: number,
): number {
  return currentChecksum === nextChecksum ? currentRevision : currentRevision + 1;
}

function sourceRecord(
  recordType: MobyGamesRecordType,
  sourceKey: string,
  providerExternalId: string | null,
  payload: Record<string, unknown>,
  fetchedAt: string,
): MobyGamesSourceRecord {
  return {
    provider: PROVIDER,
    recordType,
    sourceKey,
    providerExternalId,
    payload,
    checksum: fingerprint(payload),
    fetchedAt,
  };
}

type MutableCandidate = {
  readonly key: string;
  readonly regionCode: string | null;
  readonly variant: string | null;
  readonly releases: Record<string, unknown>[];
  readonly identifiers: MobyGamesIdentifier[];
  readonly evidence: MobyGamesEvidence[];
  readonly media: MobyGamesMedia[];
  readonly groupingReasons: string[];
  hasSafelyAssociatedPhysicalPackageEvidence: boolean;
};

type PreparedRelease = {
  readonly release: Record<string, unknown>;
  readonly regionCode: string | null;
  readonly variant: string | null;
  readonly identifiers: readonly MobyGamesIdentifier[];
  readonly strongKeys: ReadonlySet<string>;
  readonly corroboratingKeys: ReadonlySet<string>;
  readonly fingerprint: string;
};

function partitionReleaseEvidence(
  gameId: number,
  platformId: number,
  releases: readonly Record<string, unknown>[],
): MutableCandidate[] {
  const prepared = releases
    .map(prepareRelease)
    .sort((left, right) => left.fingerprint.localeCompare(right.fingerprint, "en"));
  const variantPartitions = new Map<string, PreparedRelease[]>();
  for (const release of prepared) {
    const variantKey = release.variant ?? "standard";
    const partition = variantPartitions.get(variantKey) ?? [];
    partition.push(release);
    variantPartitions.set(variantKey, partition);
  }

  const candidates: MutableCandidate[] = [];
  for (const [variantKey, partition] of [...variantPartitions.entries()].sort(([left], [right]) =>
    left.localeCompare(right, "en"),
  )) {
    const identified = partition.filter(({ strongKeys }) => strongKeys.size > 0);
    const unidentified = partition.filter(({ strongKeys }) => strongKeys.size === 0);
    const connected = connectedStrongIdentityGroups(identified);

    if (connected.length === 0) {
      for (const [regionKey, regionPartition] of partitionByRegion(partition)) {
        const candidate = mutableCandidate(
          gameId,
          platformId,
          `${variantKey}:${regionKey}:no-strong-identity`,
          regionPartition[0]?.regionCode ?? null,
          regionPartition[0]?.variant ?? null,
          ["region_and_variant_partition", "no_conflicting_strong_physical_identity"],
        );
        regionPartition.forEach((release) => addReleaseEvidence(candidate, release));
        candidates.push(candidate);
      }
      continue;
    }

    const strongPartitions = connected.map((group) => {
      const strongKeys = distinct(group.flatMap((release) => [...release.strongKeys])).sort();
      const regionCode = combineRegionCodes(group.map((release) => release.regionCode));
      const candidate = mutableCandidate(
        gameId,
        platformId,
        `${variantKey}:strong:${strongKeys.join("+")}`,
        regionCode,
        group[0]?.variant ?? null,
        [
          "explicit_variant_partition",
          `connected_strong_physical_identity:${strongKeys.join(",")}`,
          `derived_region_coverage:${regionCode ?? "unknown"}`,
        ],
      );
      group.forEach((release) => addReleaseEvidence(candidate, release));
      return {
        candidate,
        corroboratingKeys: new Set(group.flatMap((release) => [...release.corroboratingKeys])),
      };
    });

    const unresolved: PreparedRelease[] = [];
    for (const release of unidentified) {
      const supportedPartitions = strongPartitions.filter(
        ({ candidate, corroboratingKeys }) =>
          release.corroboratingKeys.size > 0 &&
          regionCodesOverlap(release.regionCode, candidate.regionCode) &&
          setsIntersect(release.corroboratingKeys, corroboratingKeys) &&
          [...release.corroboratingKeys].every((identifier) => corroboratingKeys.has(identifier)),
      );
      const supported = supportedPartitions[0];
      if (supportedPartitions.length !== 1 || supported === undefined) {
        unresolved.push(release);
        continue;
      }
      const shared = [...release.corroboratingKeys]
        .filter((identifier) => supported.corroboratingKeys.has(identifier))
        .sort();
      supported.candidate.groupingReasons.push(
        `unidentified_release_joined_by_shared_corroborating_identity:${shared.join(",")}`,
      );
      addReleaseEvidence(supported.candidate, release);
    }

    for (const [regionKey, regionPartition] of partitionByRegion(unresolved)) {
      const unresolvedCandidate = mutableCandidate(
        gameId,
        platformId,
        `${variantKey}:${regionKey}:unresolved:${regionPartition
          .map(({ fingerprint }) => fingerprint)
          .join("+")}`,
        regionPartition[0]?.regionCode ?? null,
        regionPartition[0]?.variant ?? null,
        ["region_and_variant_partition"],
      );
      regionPartition.forEach((release) => addReleaseEvidence(unresolvedCandidate, release));
      strongPartitions.push({ candidate: unresolvedCandidate, corroboratingKeys: new Set() });
    }
    candidates.push(...strongPartitions.map(({ candidate }) => candidate));
  }
  return candidates;
}

function prepareRelease(release: Record<string, unknown>): PreparedRelease {
  const identifiers = identifiersFromRelease(release);
  return {
    release,
    regionCode: normalizeMobyGamesRegion(stringArray(release["countries"]), identifiers),
    variant: variantLabel(optionalString(release["description"])),
    identifiers,
    strongKeys: new Set(
      identifiers
        .filter(({ identityRole }) => identityRole === "strong_physical")
        .map(identifierKey),
    ),
    corroboratingKeys: new Set(
      identifiers.filter(({ identityRole }) => identityRole === "corroborating").map(identifierKey),
    ),
    fingerprint: evidenceFingerprint(release),
  };
}

function connectedStrongIdentityGroups(releases: readonly PreparedRelease[]): PreparedRelease[][] {
  const groups: PreparedRelease[][] = [];
  for (const release of releases) {
    const matchingIndexes = groups.flatMap((group, index) =>
      group.some((member) => setsIntersect(member.strongKeys, release.strongKeys)) ? [index] : [],
    );
    if (matchingIndexes.length === 0) {
      groups.push([release]);
      continue;
    }
    const merged = [release];
    for (const index of [...matchingIndexes].sort((left, right) => right - left)) {
      merged.push(...groups.splice(index, 1)[0]!);
    }
    groups.push(
      merged.sort((left, right) => left.fingerprint.localeCompare(right.fingerprint, "en")),
    );
  }
  return groups.sort((left, right) =>
    [...left[0]!.strongKeys]
      .sort()
      .join(":")
      .localeCompare([...right[0]!.strongKeys].sort().join(":"), "en"),
  );
}

function setsIntersect(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return [...left].some((value) => right.has(value));
}

function partitionByRegion(
  releases: readonly PreparedRelease[],
): readonly (readonly [string, readonly PreparedRelease[]])[] {
  const partitions = new Map<string, PreparedRelease[]>();
  for (const release of releases) {
    const key = release.regionCode ?? "unknown";
    const partition = partitions.get(key) ?? [];
    partition.push(release);
    partitions.set(key, partition);
  }
  return [...partitions.entries()].sort(([left], [right]) => left.localeCompare(right, "en"));
}

function combineRegionCodes(regionCodes: readonly (string | null)[]): string | null {
  const values = distinct(
    regionCodes.flatMap((regionCode) => (regionCode === null ? [] : regionCode.split("+"))),
  ).sort();
  return values.length === 0 ? null : values.join("+");
}

function regionCodesOverlap(left: string | null, right: string | null): boolean {
  if (left === null || right === null) return false;
  return setsIntersect(new Set(left.split("+")), new Set(right.split("+")));
}

function addReleaseEvidence(candidate: MutableCandidate, prepared: PreparedRelease): void {
  candidate.releases.push(prepared.release);
  candidate.identifiers.push(...prepared.identifiers);
  candidate.evidence.push({
    sourceRecordType: "game_platform",
    kind: "release",
    fingerprint: prepared.fingerprint,
  });
}

function mutableCandidate(
  gameId: number,
  platformId: number,
  groupingKey: string,
  regionCode: string | null,
  variant: string | null,
  groupingReasons: readonly string[],
): MutableCandidate {
  return {
    key: fingerprint({ provider: PROVIDER, gameId, platformId, groupingKey }),
    regionCode,
    variant,
    releases: [],
    identifiers: [],
    evidence: [],
    media: [],
    groupingReasons: [...groupingReasons],
    hasSafelyAssociatedPhysicalPackageEvidence: false,
  };
}

function finalizeCandidate(candidate: MutableCandidate): MobyGamesEditionCandidate {
  const identifiers = deduplicateIdentifiers(candidate.identifiers);
  const hasStrongPhysicalIdentity = identifiers.some(
    ({ identityRole }) => identityRole === "strong_physical",
  );
  const ambiguities: string[] = [];
  if (!hasStrongPhysicalIdentity && !candidate.hasSafelyAssociatedPhysicalPackageEvidence) {
    ambiguities.push("insufficient_positive_physical_evidence");
  }
  if (candidate.regionCode === null) ambiguities.push("region_unresolved");
  const descriptions = distinct(
    candidate.releases.map((release) => optionalString(release["description"])).filter(isString),
  );
  if (candidate.variant === null && descriptions.length > 1)
    ambiguities.push("multiple_release_descriptions");

  const releaseDates = distinct(
    candidate.releases.map((release) => optionalString(release["release_date"])).filter(isString),
  ).sort();
  const publishers = distinct(
    candidate.releases.flatMap((release) =>
      arrayOfRecords(release["companies"])
        .filter(
          (company) => optionalString(company["role"])?.toLowerCase().includes("publish") === true,
        )
        .map((company) => optionalString(company["company_name"]))
        .filter(isString),
    ),
  );

  return {
    key: candidate.key,
    regionCode: candidate.regionCode,
    editionName: candidate.variant,
    releaseDate: releaseDates.find(isFullDate) ?? null,
    publisherName: publishers.length === 1 ? (publishers[0] ?? null) : null,
    identifiers,
    evidence: deduplicateEvidence(candidate.evidence),
    media: deduplicateMedia(candidate.media),
    releaseDates,
    groupingReasons: distinct(candidate.groupingReasons).sort(),
    ambiguities,
    canonicalizable: ambiguities.length === 0,
    reconciliationStatus: ambiguities.length === 0 ? "NEW" : "SOURCE_AMBIGUOUS",
  };
}

function identifiersFromRelease(release: Record<string, unknown>): MobyGamesIdentifier[] {
  return arrayOfRecords(release["product_codes"]).flatMap((code) => {
    const type = optionalString(code["product_code_type"] ?? code["type"]);
    const value = optionalString(code["product_code"] ?? code["code"] ?? code["value"]);
    if (type === null || value === null) return [];
    const normalized = type
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, " ")
      .trim();
    const mapping: Readonly<Record<string, MobyGamesIdentifier["scheme"]>> = {
      "nintendo media pn": "nintendo_media_pn",
      "upc a": "upc_a",
      upc: "upc_a",
      "ean 13": "ean_13",
      ean: "ean_13",
      asin: "asin",
      "ebay product id": "ebay_product_id",
    };
    const scheme = mapping[normalized] ?? "publisher_product_code";
    return [
      {
        scheme,
        identityRole: classifyMobyGamesIdentifierScheme(scheme),
        value: value.trim(),
        authority: "MobyGames" as const,
      },
    ];
  });
}

function mediaFromGroup(group: Record<string, unknown>): MobyGamesMedia[] {
  return arrayOfRecords(group["covers"]).flatMap((cover) => {
    const scanOf = optionalString(cover["scan_of"]);
    const kind =
      scanOf === "Front Cover" ? "cover_front" : scanOf === "Back Cover" ? "cover_back" : null;
    const assetUrl = optionalString(cover["image"]);
    if (kind === null || assetUrl === null || !/^https?:\/\//u.test(assetUrl)) return [];
    return [
      {
        kind,
        assetUrl,
        sourceAssetId: fingerprint(assetUrl),
        sourcePageUrl: null,
        width: optionalPositiveInteger(cover["width"]),
        height: optionalPositiveInteger(cover["height"]),
        attribution: "Data by MobyGames.com" as const,
      },
    ];
  });
}

function variantLabel(value: string | null): string | null {
  if (value === null) return null;
  const matches = [
    ...value.matchAll(
      /\b(pre[- ]?order|collector(?:'?s)? edition|players choice|player's choice|limited edition|gold game pak|ique)\b/giu,
    ),
  ];
  const labels = distinct(
    matches.map((match) => normalizeVariantMatch(match[0] ?? "")).filter(isString),
  );
  return labels.length === 0 ? null : labels.join(" + ");
}

function normalizeVariantMatch(value: string): string | null {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/gu, "");
  if (normalized === "preorder") return "Preorder";
  if (normalized === "collectorsedition" || normalized === "collectoredition")
    return "Collector's Edition";
  if (normalized === "playerschoice" || normalized === "playerchoice") return "Players Choice";
  if (normalized === "limitededition") return "Limited Edition";
  if (normalized === "goldgamepak") return "Gold Game Pak";
  if (normalized === "ique") return "iQue";
  return null;
}

function identifierKey(identifier: Pick<MobyGamesIdentifier, "scheme" | "value">): string {
  return `${identifier.scheme}\u0000${identifier.value}`;
}

function sanitizeDescription(value: string | null): string | null {
  if (value === null) return null;
  const plain = value
    .replace(/<br\s*\/?>/giu, "\n")
    .replace(/<[^>]+>/gu, "")
    .replace(/&nbsp;/gu, " ")
    .replace(/&amp;/gu, "&")
    .replace(/&quot;/gu, '"')
    .replace(/&#39;/gu, "'")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
  return plain === "" ? null : plain;
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function evidenceFingerprint(value: unknown): string {
  return fingerprint(sortEvidenceArrays(value));
}

function sortEvidenceArrays(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .map(sortEvidenceArrays)
      .sort((left, right) => stableJson(left).localeCompare(stableJson(right), "en"));
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, sortEvidenceArrays(child)]),
    );
  }
  return value;
}

function deduplicateIdentifiers(values: readonly MobyGamesIdentifier[]): MobyGamesIdentifier[] {
  const map = new Map(values.map((value) => [`${value.scheme}\u0000${value.value}`, value]));
  return [...map.values()].sort((left, right) =>
    `${left.scheme}:${left.value}`.localeCompare(`${right.scheme}:${right.value}`, "en"),
  );
}

function deduplicateEvidence(values: readonly MobyGamesEvidence[]): MobyGamesEvidence[] {
  const map = new Map(
    values.map((value) => [`${value.sourceRecordType}:${value.kind}:${value.fingerprint}`, value]),
  );
  return [...map.values()].sort((left, right) =>
    left.fingerprint.localeCompare(right.fingerprint, "en"),
  );
}

function deduplicateMedia(values: readonly MobyGamesMedia[]): MobyGamesMedia[] {
  const map = new Map(values.map((value) => [`${value.kind}:${value.sourceAssetId}`, value]));
  return [...map.values()].sort((left, right) =>
    `${left.kind}:${left.sourceAssetId}`.localeCompare(
      `${right.kind}:${right.sourceAssetId}`,
      "en",
    ),
  );
}

function distinct(values: readonly string[]): string[] {
  return [...new Set(values)];
}
function isString(value: string | null): value is string {
  return value !== null;
}
function isFullDate(value: string | null): value is string {
  return value !== null && /^\d{4}-\d{2}-\d{2}$/u.test(value);
}
function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
function arrayOfRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) throw new TypeError(`${field} must be an object`);
  return value;
}
function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}
function requireString(value: Record<string, unknown>, field: string): string {
  const result = optionalString(value[field]);
  if (result === null) throw new TypeError(`${field} must be a nonblank string`);
  return result;
}
function requireInteger(value: Record<string, unknown>, field: string): number {
  const result = value[field];
  if (!Number.isInteger(result)) throw new TypeError(`${field} must be an integer`);
  return result as number;
}
function optionalPositiveInteger(value: unknown): number | null {
  return Number.isInteger(value) && (value as number) > 0 ? (value as number) : null;
}
function assertPositiveInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value <= 0)
    throw new RangeError(`${field} must be a positive integer`);
}
function isTransientFetchError(error: unknown): boolean {
  return error instanceof TypeError;
}
