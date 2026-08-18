export type CatalogImportProvider = {
  readonly provider: string;
  normalize(input: CatalogImportSource): Promise<NormalizedCatalogBatch>;
};

export type CatalogImportSource = {
  readonly sourceRoot: string;
  readonly providerRevision: string;
  readonly platformKey: string;
};

export type NormalizedPlatformRecord = {
  readonly slug: string;
  readonly name: string;
  readonly manufacturer: string;
  readonly providerSystemName: string;
};

export type NormalizedIdentifierRecord = {
  readonly scheme: "publisher_product_code";
  readonly value: string;
  readonly authority: null;
};

export type NormalizedCatalogMediaTarget =
  | { readonly kind: "game"; readonly externalId: string }
  | { readonly kind: "edition"; readonly externalId: string };

/** Provider-neutral media evidence for a future explicitly licensed importer. */
export type NormalizedCatalogMediaRecord = {
  readonly target: NormalizedCatalogMediaTarget;
  readonly kind: "cover_front" | "cover_back" | "artwork" | "logo";
  readonly assetUrl: string;
  readonly sourceProvider: string;
  readonly sourceAssetId: string | null;
  readonly sourcePageUrl: string | null;
  readonly rightsStatus: "reusable" | "licensed" | "restricted" | "unknown";
  readonly licenseName: string | null;
  readonly licenseUrl: string | null;
  readonly attribution: string | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly isPrimary: boolean;
};

export type NormalizedEditionRecord = {
  readonly externalId: string;
  readonly sourceTitle: string;
  readonly editionName: string | null;
  readonly regionCode: string | null;
  readonly identifiers: readonly NormalizedIdentifierRecord[];
};

export type NormalizedGameRecord = {
  readonly externalId: string;
  readonly canonicalTitle: string;
  readonly sourceTitle: string;
  readonly editions: readonly NormalizedEditionRecord[];
};

export type ExclusionReason =
  | "alternate"
  | "beta"
  | "demo"
  | "duplicate"
  | "hack"
  | "homebrew"
  | "pirate"
  | "prototype"
  | "sample"
  | "unlicensed"
  | "unsupported";

export type CatalogImportStatistics = {
  readonly sourceEntriesScanned: number;
  readonly acceptedEntries: number;
  readonly excludedEntries: number;
  readonly uniqueNormalizedGames: number;
  readonly editionsGenerated: number;
  readonly identifiersGenerated: number;
  readonly exclusions: Readonly<Record<ExclusionReason, number>>;
  readonly regionDistribution: Readonly<Record<string, number>>;
  readonly duplicateNormalizationCases: number;
  readonly conflicts: number;
  readonly errors: number;
};

export type NormalizedCatalogBatch = {
  readonly provider: string;
  readonly providerRevision: string;
  readonly platform: NormalizedPlatformRecord;
  readonly games: readonly NormalizedGameRecord[];
  readonly media: readonly NormalizedCatalogMediaRecord[];
  readonly statistics: CatalogImportStatistics;
};

export type CatalogImportDatabaseResult = {
  readonly runId: string;
  readonly database: {
    readonly gamesCreated: number;
    readonly gamesUnchanged: number;
    readonly editionsCreated: number;
    readonly editionsUnchanged: number;
    readonly identifiersCreated: number;
    readonly mappingsUpdated: number;
  };
  readonly summary: Record<string, unknown>;
};
