import type { CatalogSearchResult } from "@geek/domain";
import { parseCatalogSearchResultKind } from "@geek/domain";
import type { GeekSupabaseClient } from "@geek/supabase";

import type { Page, PageRequest } from "../pagination";
import { resolvePage } from "../pagination";
import type { ReadResult } from "../result";
import { databaseFailure, InvalidRowError, mapRows } from "../result";

/**
 * Catalog search.
 *
 * A thin, honest wrapper over the `search_catalog` function. Ranking, matching
 * and normalisation stay in the database: it is the only place that can see the
 * whole catalog, and a second ranking pass here would quietly become a
 * competing definition of what a good match is. This function decides nothing
 * about relevance and reorders nothing.
 *
 * What it does own is the boundary. Callers get validated domain results, and
 * `supabase.rpc("search_catalog", ...)` never appears in a screen.
 */

/** The window the database function itself accepts. Asking for more is refused. */
const SEARCH_PAGE = { defaultLimit: 20, maxLimit: 50 } as const;

/**
 * Searches Games and Editions.
 *
 * A blank query returns an empty page without a round trip. The function
 * behaves the same way, but a search box is empty far more often than it is
 * full, and an empty query is not a question worth asking the database.
 */
export async function searchCatalog(
  client: GeekSupabaseClient,
  query: string,
  page?: PageRequest,
): Promise<ReadResult<Page<CatalogSearchResult>>> {
  const { limit, offset } = resolvePage(page, SEARCH_PAGE);

  if (query.trim() === "") {
    return { outcome: "ok", data: { items: [], limit, offset } };
  }

  const { data, error } = await client.rpc("search_catalog", {
    search_query: query,
    result_limit: limit,
    result_offset: offset,
  });

  if (error !== null) {
    return databaseFailure(error);
  }

  return mapRows(() => ({ items: toSearchResults(data), limit, offset }));
}

/**
 * Validates the function's rows into domain results.
 *
 * Exported for the data-layer smoke test, which feeds it the malformed rows the
 * database cannot be made to produce, and left out of the package's public API
 * because callers have no reason to reach it.
 *
 * Deliberately typed as `unknown` rather than through the generated `Returns`
 * shape. PostgreSQL does not record nullability for `RETURNS TABLE` columns, so
 * the generator types every one of them as non-null — including `edition_id`,
 * `platform_id` and `secondary_label`, all of which the function returns as
 * NULL for a Game result. Reading through that shape would hand callers a
 * `string` that is `null` at runtime, which is exactly the class of bug this
 * layer exists to stop. Widening to `unknown` costs a few lines of checking and
 * makes the generated lie unreachable.
 */
export function toSearchResults(rows: unknown): CatalogSearchResult[] {
  if (!Array.isArray(rows)) {
    throw new InvalidRowError("search_catalog", "expected an array of rows");
  }

  return rows.map((row: unknown) => {
    if (!isRecord(row)) {
      throw new InvalidRowError("search_catalog", "expected each row to be an object");
    }

    return toSearchResult(row);
  });
}

function toSearchResult(row: Record<string, unknown>): CatalogSearchResult {
  const kindValue = requireString(row, "result_kind");
  const kind = parseCatalogSearchResultKind(kindValue);

  if (kind === null) {
    throw new InvalidRowError("search_catalog.result_kind", `unknown result kind "${kindValue}"`);
  }

  const title = requireString(row, "primary_title");
  const relevanceScore = requireNumber(row, "relevance_score");
  const gameId = requireString(row, "game_id");

  if (kind === "game") {
    // A Game result carrying an Edition identity would mean the two kinds had
    // become confusable at the source, so it is rejected rather than ignored.
    // `secondary_label` is not checked: it is presentation, and a stray label
    // on a Game result is not worth failing a search over.
    requireNull(row, "edition_id");
    requireNull(row, "platform_id");

    return { kind: "game", gameId, title, relevanceScore };
  }

  return {
    kind: "edition",
    editionId: requireString(row, "entity_id"),
    gameId,
    platformId: requireString(row, "platform_id"),
    title,
    secondaryLabel: requireString(row, "secondary_label"),
    relevanceScore,
  };
}

/**
 * A type guard rather than a cast, so field access stays `unknown` and every
 * value still has to be checked before it is used.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function requireString(row: Record<string, unknown>, field: string): string {
  const value = row[field];

  if (typeof value !== "string") {
    throw new InvalidRowError(
      `search_catalog.${field}`,
      `expected a string, got ${describe(value)}`,
    );
  }

  return value;
}

function requireNumber(row: Record<string, unknown>, field: string): number {
  const value = row[field];

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new InvalidRowError(
      `search_catalog.${field}`,
      `expected a finite number, got ${describe(value)}`,
    );
  }

  return value;
}

function requireNull(row: Record<string, unknown>, field: string): void {
  const value = row[field];

  if (value !== null && value !== undefined) {
    throw new InvalidRowError(`search_catalog.${field}`, `expected null, got ${describe(value)}`);
  }
}

function describe(value: unknown): string {
  return value === null ? "null" : typeof value;
}
