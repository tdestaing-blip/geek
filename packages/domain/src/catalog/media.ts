/** Reference media attached to one canonical Game or Edition. */
export type CatalogMedia = CatalogMediaDetails & CatalogMediaTarget;

/** The finite media roles Geek currently renders. */
export type CatalogMediaKind = "cover_front" | "cover_back" | "artwork" | "logo";

/** Whether Geek may expose an asset through its normal product surfaces. */
export type CatalogMediaRightsStatus = "reusable" | "licensed" | "restricted" | "unknown";

type CatalogMediaTarget =
  | { readonly gameId: string; readonly editionId: null }
  | { readonly gameId: null; readonly editionId: string };

type CatalogMediaDetails = {
  readonly id: string;
  readonly kind: CatalogMediaKind;
  readonly assetUrl: string;
  readonly sourceProvider: string;
  readonly sourceAssetId: string | null;
  readonly sourcePageUrl: string | null;
  readonly rightsStatus: CatalogMediaRightsStatus;
  readonly licenseName: string | null;
  readonly licenseUrl: string | null;
  readonly attribution: string | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly isPrimary: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
};

const CATALOG_MEDIA_KINDS: readonly string[] = ["cover_front", "cover_back", "artwork", "logo"];

const CATALOG_MEDIA_RIGHTS_STATUSES: readonly string[] = [
  "reusable",
  "licensed",
  "restricted",
  "unknown",
];

/** Narrows a stored media kind, refusing values outside Geek's finite contract. */
export function parseCatalogMediaKind(value: string): CatalogMediaKind | null {
  return CATALOG_MEDIA_KINDS.includes(value) ? (value as CatalogMediaKind) : null;
}

/** Narrows a stored rights status, refusing values outside Geek's finite contract. */
export function parseCatalogMediaRightsStatus(value: string): CatalogMediaRightsStatus | null {
  return CATALOG_MEDIA_RIGHTS_STATUSES.includes(value) ? (value as CatalogMediaRightsStatus) : null;
}
