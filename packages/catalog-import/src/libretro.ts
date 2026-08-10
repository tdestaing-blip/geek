import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { childNodes, childValues, parseDat, type DatNode } from "./dat.ts";
import { getLibretroPlatform } from "./platforms.ts";
import type {
  CatalogImportProvider,
  CatalogImportSource,
  CatalogImportStatistics,
  ExclusionReason,
  NormalizedCatalogBatch,
  NormalizedEditionRecord,
  NormalizedGameRecord,
  NormalizedIdentifierRecord,
} from "./types.ts";

const PROVIDER = "libretro-database";

type SourceRecord = {
  readonly originalTitle: string;
  readonly baseTitle: string;
  readonly tags: readonly string[];
  readonly region: string | null;
  readonly serials: readonly string[];
  readonly sha1s: readonly string[];
  readonly md5s: readonly string[];
  readonly crcs: readonly string[];
  readonly romNames: readonly string[];
};

type AcceptedRecord = SourceRecord & {
  readonly editionExternalId: string;
  readonly gameExternalId: string;
  readonly editionName: string | null;
  readonly regionCode: string | null;
};

export const libretroProvider: CatalogImportProvider = {
  provider: PROVIDER,
  async normalize(input: CatalogImportSource): Promise<NormalizedCatalogBatch> {
    const platform = getLibretroPlatform(input.platformKey);

    if (platform === null) {
      throw new RangeError(`unsupported Libretro platform: ${input.platformKey}`);
    }

    const sourcePath = path.join(input.sourceRoot, platform.sourcePath);
    const source = await readFile(sourcePath, "utf8");
    const gameNodes = parseDat(source).filter((node) => node.name === "game");
    const exclusions = emptyExclusions();
    const accepted: AcceptedRecord[] = [];

    for (const node of gameNodes) {
      const record = toSourceRecord(node);
      const exclusion = classify(record);

      if (exclusion !== null) {
        exclusions[exclusion] += 1;
        continue;
      }

      accepted.push(normalizeRecord(record, platform.providerSystemName));
    }

    accepted.sort((left, right) =>
      `${left.editionExternalId}\u0000${left.originalTitle}`.localeCompare(
        `${right.editionExternalId}\u0000${right.originalTitle}`,
        "en",
      ),
    );

    const uniqueAccepted: AcceptedRecord[] = [];
    const seenEditionIds = new Set<string>();

    for (const record of accepted) {
      if (seenEditionIds.has(record.editionExternalId)) {
        exclusions.duplicate += 1;
        continue;
      }

      seenEditionIds.add(record.editionExternalId);
      uniqueAccepted.push(record);
    }

    const games = groupGames(uniqueAccepted);
    const statistics = statisticsFor(gameNodes.length, games, uniqueAccepted, exclusions);

    return {
      provider: PROVIDER,
      providerRevision: input.providerRevision,
      platform,
      games,
      media: [],
      statistics,
    };
  },
};

function toSourceRecord(node: DatNode): SourceRecord {
  const originalTitle = childValues(node, "name")[0];

  if (originalTitle === undefined || originalTitle.trim() === "") {
    throw new SyntaxError("Libretro game record has no name");
  }

  const roms = childNodes(node, "rom");
  const region = childValues(node, "region")[0] ?? null;
  const title = splitTitle(originalTitle, region);
  const serials = uniqueSorted([
    ...childValues(node, "serial"),
    ...roms.flatMap((rom) => childValues(rom, "serial")),
  ]);

  return {
    originalTitle,
    baseTitle: title.baseTitle,
    tags: title.tags,
    region,
    serials,
    sha1s: uniqueSorted(roms.flatMap((rom) => childValues(rom, "sha1"))),
    md5s: uniqueSorted(roms.flatMap((rom) => childValues(rom, "md5"))),
    crcs: uniqueSorted(roms.flatMap((rom) => childValues(rom, "crc"))),
    romNames: uniqueSorted(roms.flatMap((rom) => childValues(rom, "name"))),
  };
}

function normalizeRecord(record: SourceRecord, systemName: string): AcceptedRecord {
  const gameKey = normalizeMatchingKey(record.baseTitle);
  const revisionTags = record.tags.filter((tag) =>
    /^(rev(?:ision)?[ ._-]*[a-z0-9]+|v\d)/iu.test(tag),
  );

  return {
    ...record,
    gameExternalId: `group:${digest(`${systemName}\u0000${gameKey}`)}`,
    editionExternalId: `record:${digest(`${systemName}\u0000${strongRecordIdentity(record)}`)}`,
    editionName: revisionTags.length === 0 ? null : revisionTags.join(" · "),
    regionCode: normalizeRegion(record.region),
  };
}

function groupGames(records: readonly AcceptedRecord[]): NormalizedGameRecord[] {
  const groups = new Map<string, AcceptedRecord[]>();

  for (const record of records) {
    const existing = groups.get(record.gameExternalId) ?? [];
    existing.push(record);
    groups.set(record.gameExternalId, existing);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right, "en"))
    .map(([externalId, editions]) => {
      editions.sort((left, right) =>
        left.editionExternalId.localeCompare(right.editionExternalId, "en"),
      );
      const canonicalTitle = [...new Set(editions.map((edition) => edition.baseTitle))].sort(
        (left, right) => left.localeCompare(right, "en"),
      )[0];

      if (canonicalTitle === undefined) throw new Error("normalized Game has no title");

      return {
        externalId,
        canonicalTitle,
        sourceTitle: canonicalTitle,
        editions: editions.map(toEdition),
      };
    });
}

function toEdition(record: AcceptedRecord): NormalizedEditionRecord {
  const identifiers: NormalizedIdentifierRecord[] = record.serials.map((serial) => ({
    scheme: "publisher_product_code",
    value: serial,
    authority: null,
  }));

  return {
    externalId: record.editionExternalId,
    sourceTitle: record.originalTitle,
    editionName: record.editionName,
    regionCode: record.regionCode,
    identifiers,
  };
}

function classify(record: SourceRecord): ExclusionReason | null {
  const romTags = record.romNames.flatMap(
    (romName) => splitTitle(romName.replace(/\.[^.]+$/u, ""), record.region).tags,
  );
  const text = [...record.tags, ...romTags].join(" ").toLowerCase();
  const rules: readonly [RegExp, ExclusionReason][] = [
    [/\b(proto|prototype)\b/u, "prototype"],
    [/\bbeta\b/u, "beta"],
    [/\bsample\b/u, "sample"],
    [/\bdemo\b/u, "demo"],
    [/\b(hack|translation|t-[a-z]{2})\b/u, "hack"],
    [/\b(aftermarket|homebrew)\b/u, "homebrew"],
    [/\bpirate\b/u, "pirate"],
    [/\bunl\b/u, "unlicensed"],
    [/\balt(?:ernate)?\b/u, "alternate"],
    [
      /(virtual console|switch(?: online)?|steam|gog|evercade|wii u|gamecube|retro-bit|piko interactive|qubyte classics|ratalaika games|the retro room|enhancement chip|classic mini|capcom town|disney classic games|digital|nes conversion|arcade|collection)/u,
      "unsupported",
    ],
  ];

  return rules.find(([pattern]) => pattern.test(text))?.[1] ?? null;
}

function splitTitle(
  value: string,
  sourceRegion: string | null = null,
): {
  readonly baseTitle: string;
  readonly tags: readonly string[];
} {
  const trimmed = value.trim();
  const segments: { readonly start: number; readonly tag: string }[] = [];
  let candidate = trimmed;

  while (true) {
    const match = candidate.match(/\s*\(([^()]*)\)\s*$/u);

    if (match === null || match.index === undefined) break;
    const tag = match[1] ?? "";
    segments.unshift({ start: match.index, tag });
    candidate = candidate.slice(0, match.index).trimEnd();
  }

  const regionIndex = segments.findIndex(
    (segment) =>
      isRegionDecoration(segment.tag) ||
      (sourceRegion !== null &&
        normalizeDecoration(segment.tag) === normalizeDecoration(sourceRegion)),
  );

  if (regionIndex >= 0) {
    const boundary = segments[regionIndex];

    if (boundary === undefined) throw new Error("release-decoration boundary is missing");

    return {
      baseTitle: trimmed.slice(0, boundary.start).trimEnd(),
      tags: segments.slice(regionIndex).map((segment) => segment.tag),
    };
  }

  let firstDecoration = segments.length;

  while (
    firstDecoration > 0 &&
    isReleaseDecoration(segments[firstDecoration - 1]?.tag ?? "", null)
  ) {
    firstDecoration -= 1;
  }

  const boundary = segments[firstDecoration];

  return boundary === undefined
    ? { baseTitle: trimmed, tags: [] }
    : {
        baseTitle: trimmed.slice(0, boundary.start).trimEnd(),
        tags: segments.slice(firstDecoration).map((segment) => segment.tag),
      };
}

function isReleaseDecoration(tag: string, sourceRegion: string | null): boolean {
  if (isRegionDecoration(tag)) return true;

  if (sourceRegion !== null && normalizeDecoration(tag) === normalizeDecoration(sourceRegion)) {
    return true;
  }

  const patterns: readonly RegExp[] = [
    /^(?:en|ja|fr|de|es|it|nl|pt|sv|no|da|fi|ko|zh(?:-[a-z]+)?)(?:,(?:en|ja|fr|de|es|it|nl|pt|sv|no|da|fi|ko|zh(?:-[a-z]+)?))*$/iu,
    /^(?:rev(?:ision)?[ ._-]*[a-z0-9]+|v\d(?:\.\d+)*)$/iu,
    /^(?:(?:possible )?proto(?:type)?(?: \d+)?|beta(?: \d+)?|sample|(?:auto |tech )?demo(?: \d+)?|hack|(?:.+ )?translation|aftermarket|homebrew|pirate|unl|alt(?:ernate)?)$/iu,
    /^(?:pal|ntsc|snesdev \d{4})$/iu,
    /(?:virtual console|switch(?: online)?|steam|gog|evercade|wii u|gamecube|retro-bit|piko interactive|qubyte classics|ratalaika games|the retro room|enhancement chip|itch\.io|classic mini|capcom town|disney classic games|digital|nes conversion|arcade|collection)/iu,
    /^sns-[a-z0-9-]+$/iu,
  ];

  return patterns.some((pattern) => pattern.test(tag.trim()));
}

function isRegionDecoration(tag: string): boolean {
  return /^(?:(?:usa|europe|japan|world|france|germany|spain|italy|canada|australia|korea|sweden|brazil|asia|netherlands|hong kong|taiwan|china|peru))(?:,\s*(?:usa|europe|japan|world|france|germany|spain|italy|canada|australia|korea|sweden|brazil|asia|netherlands|hong kong|taiwan|china|peru))*$/iu.test(
    tag.trim(),
  );
}

function normalizeDecoration(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en").replace(/\s+/gu, " ").trim();
}

function normalizeMatchingKey(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en").replace(/\s+/gu, " ").trim();
}

function normalizeRegion(value: string | null): string | null {
  if (value === null || value.trim() === "") return null;

  const regionMap: Readonly<Record<string, string>> = {
    europe: "EU",
    usa: "US",
    japan: "JP",
    world: "WORLD",
    france: "FR",
    germany: "DE",
    spain: "ES",
    italy: "IT",
    canada: "CA",
    australia: "AU",
    korea: "KR",
  };
  const codes = value
    .split(/[,/]/u)
    .map((part) => regionMap[part.trim().toLowerCase()])
    .filter((part): part is string => part !== undefined);

  return codes.length === 0 ? null : [...new Set(codes)].sort().join("+");
}

function strongRecordIdentity(record: SourceRecord): string {
  if (record.sha1s.length > 0) return `sha1:${record.sha1s.join(",")}`;
  if (record.serials.length > 0) return `serial:${record.serials.join(",")}`;
  if (record.md5s.length > 0) return `md5:${record.md5s.join(",")}`;
  if (record.crcs.length > 0) return `crc:${record.crcs.join(",")}`;
  return `title:${record.originalTitle}`;
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value !== ""))].sort();
}

function emptyExclusions(): Record<ExclusionReason, number> {
  return {
    alternate: 0,
    beta: 0,
    demo: 0,
    duplicate: 0,
    hack: 0,
    homebrew: 0,
    pirate: 0,
    prototype: 0,
    sample: 0,
    unlicensed: 0,
    unsupported: 0,
  };
}

function statisticsFor(
  scanned: number,
  games: readonly NormalizedGameRecord[],
  accepted: readonly AcceptedRecord[],
  exclusions: Readonly<Record<ExclusionReason, number>>,
): CatalogImportStatistics {
  const regionDistribution: Record<string, number> = {};

  for (const record of accepted) {
    const region = record.regionCode ?? "unknown";
    regionDistribution[region] = (regionDistribution[region] ?? 0) + 1;
  }

  const excludedEntries = Object.values(exclusions).reduce((sum, count) => sum + count, 0);

  return {
    sourceEntriesScanned: scanned,
    acceptedEntries: accepted.length,
    excludedEntries,
    uniqueNormalizedGames: games.length,
    editionsGenerated: games.reduce((sum, game) => sum + game.editions.length, 0),
    identifiersGenerated: games.reduce(
      (sum, game) =>
        sum +
        game.editions.reduce((editionSum, edition) => editionSum + edition.identifiers.length, 0),
      0,
    ),
    exclusions,
    regionDistribution,
    duplicateNormalizationCases: exclusions.duplicate,
    conflicts: 0,
    errors: 0,
  };
}
