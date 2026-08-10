import type { CalendarDate, CatalogMedia, Edition, Game, Platform } from "@geek/domain";
import {
  parseCalendarDate,
  parseCatalogMediaKind,
  parseCatalogMediaRightsStatus,
} from "@geek/domain";
import type { Tables } from "@geek/supabase";

import { InvalidRowError } from "../result";

/**
 * Turning catalog rows into catalog models.
 *
 * How far the generated types can be trusted depends on where they came from,
 * and the distinction matters enough to state once:
 *
 * A table `Row` type derives its nullability from real `NOT NULL` constraints,
 * so it is dependable. What it cannot express is a CHECK constraint or a text
 * format, which arrive as bare `string`. Those are narrowed here.
 *
 * A function's `Returns` type is not dependable at all, because PostgreSQL does
 * not record nullability for `RETURNS TABLE` columns and the generator has no
 * choice but to guess non-null. RPC results are therefore validated from
 * `unknown` rather than read through their generated shape; see `./search.ts`.
 */

/**
 * Each mapper takes exactly the columns it reads, as a `Pick` of the generated
 * row rather than the whole row. Queries in this package select named columns,
 * so a whole-row parameter would not match what they return, and stating the
 * subset keeps the mapper and the `select` honest about each other.
 */
type GameFields = Pick<
  Tables<"games">,
  "id" | "canonical_title" | "description" | "original_release_date"
>;

type PlatformFields = Pick<Tables<"platforms">, "id" | "slug" | "name">;

type EditionFields = Pick<
  Tables<"editions">,
  | "id"
  | "game_id"
  | "platform_id"
  | "edition_name"
  | "region_code"
  | "supported_languages"
  | "release_date"
  | "publisher_name"
  | "packaging_type"
>;

export type CatalogMediaFields = Pick<
  Tables<"catalog_media">,
  | "id"
  | "game_id"
  | "edition_id"
  | "kind"
  | "asset_url"
  | "source_provider"
  | "source_asset_id"
  | "source_page_url"
  | "rights_status"
  | "license_name"
  | "license_url"
  | "attribution"
  | "width"
  | "height"
  | "is_primary"
  | "created_at"
  | "updated_at"
>;

export function toGame(row: GameFields): Game {
  return {
    id: row.id,
    canonicalTitle: row.canonical_title,
    description: row.description,
    originalReleaseDate: toOptionalCalendarDate(
      row.original_release_date,
      "games.original_release_date",
    ),
  };
}

export function toPlatform(row: PlatformFields): Platform {
  return { id: row.id, slug: row.slug, name: row.name };
}

export function toEdition(row: EditionFields): Edition {
  return {
    id: row.id,
    gameId: row.game_id,
    platformId: row.platform_id,
    editionName: row.edition_name,
    regionCode: row.region_code,
    supportedLanguages: row.supported_languages,
    releaseDate: toOptionalCalendarDate(row.release_date, "editions.release_date"),
    publisherName: row.publisher_name,
    packagingType: row.packaging_type,
  };
}

/** Maps one publishable catalog-media row and rechecks its domain invariants. */
export function toCatalogMedia(row: CatalogMediaFields): CatalogMedia {
  const kind = parseCatalogMediaKind(row.kind);

  if (kind === null) {
    throw new InvalidRowError("catalog_media.kind", `unknown media kind "${row.kind}"`);
  }

  const rightsStatus = parseCatalogMediaRightsStatus(row.rights_status);

  if (rightsStatus === null) {
    throw new InvalidRowError(
      "catalog_media.rights_status",
      `unknown rights status "${row.rights_status}"`,
    );
  }

  const target = toCatalogMediaTarget(row);

  return {
    id: row.id,
    ...target,
    kind,
    assetUrl: toAbsoluteHttpUrl(row.asset_url, "catalog_media.asset_url"),
    sourceProvider: row.source_provider,
    sourceAssetId: row.source_asset_id,
    sourcePageUrl: row.source_page_url,
    rightsStatus,
    licenseName: row.license_name,
    licenseUrl: row.license_url,
    attribution: row.attribution,
    width: row.width,
    height: row.height,
    isPrimary: row.is_primary,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toCatalogMediaTarget(
  row: Pick<CatalogMediaFields, "game_id" | "edition_id">,
):
  | { readonly gameId: string; readonly editionId: null }
  | { readonly gameId: null; readonly editionId: string } {
  if (row.game_id !== null && row.edition_id === null) {
    return { gameId: row.game_id, editionId: null };
  }

  if (row.game_id === null && row.edition_id !== null) {
    return { gameId: null, editionId: row.edition_id };
  }

  throw new InvalidRowError(
    "catalog_media.game_id/edition_id",
    "expected exactly one canonical target",
  );
}

function toAbsoluteHttpUrl(value: string, field: string): string {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new InvalidRowError(field, `expected an absolute http/https URL, got "${value}"`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new InvalidRowError(field, `expected an absolute http/https URL, got "${value}"`);
  }

  return value;
}

/**
 * Reads a nullable `date` column.
 *
 * A `date` reaches JSON as a plain string, indistinguishable at the type level
 * from a timestamp or from free text, so the format is checked rather than
 * assumed.
 */
export function toOptionalCalendarDate(value: string | null, field: string): CalendarDate | null {
  if (value === null) {
    return null;
  }

  const date = parseCalendarDate(value);

  if (date === null) {
    throw new InvalidRowError(field, `expected a YYYY-MM-DD date, got "${value}"`);
  }

  return date;
}
