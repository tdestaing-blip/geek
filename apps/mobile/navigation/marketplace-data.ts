import { getEditionMarketOpportunities, getPublicCopyDetail } from "@geek/data";
import type { EditionMarketOpportunity, PublicCopyDetail } from "@geek/domain";

import { supabase } from "../lib/supabase";
import type { CanonicalMarketCatalog } from "./canonical-catalog";
import { loadCanonicalMarket } from "./canonical-catalog-data";

export type MarketLoadResult<T> =
  | { readonly outcome: "ok"; readonly data: T }
  | { readonly outcome: "not_found" }
  | { readonly outcome: "error" };

export async function loadEditionMarketOpportunities(
  gameId: string,
  editionId: string,
): Promise<MarketLoadResult<readonly EditionMarketOpportunity[]>> {
  const result = await getEditionMarketOpportunities(supabase, gameId, editionId);
  return result.outcome === "ok" ? { outcome: "ok", data: result.data } : { outcome: "error" };
}

export async function loadCanonicalPublicCopy(
  copyId: string,
): Promise<
  MarketLoadResult<{ readonly detail: PublicCopyDetail; readonly catalog: CanonicalMarketCatalog }>
> {
  const detailResult = await getPublicCopyDetail(supabase, copyId);
  if (detailResult.outcome === "not_found") return { outcome: "not_found" };
  if (detailResult.outcome !== "ok") return { outcome: "error" };

  const detail = detailResult.data;
  if (detail.copy.editionId === null) return { outcome: "not_found" };
  const catalogResult = await loadCanonicalMarket(detail.copy.gameId, detail.copy.editionId);
  if (catalogResult.outcome !== "ok") return catalogResult;
  if (
    catalogResult.data.game.id !== detail.game.id ||
    catalogResult.data.edition.id !== detail.edition?.id
  ) {
    return { outcome: "error" };
  }
  return { outcome: "ok", data: { detail, catalog: catalogResult.data } };
}
