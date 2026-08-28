import {
  getMyAuctionParticipations,
  getAuctionBidHistory,
  getAuctionLiveState,
  getAuctionResult,
  getEditionMarketOpportunities,
  getPublicCopyDetail,
} from "@geek/data";
import type {
  AuctionParticipation,
  AuctionBidHistoryEntry,
  AuctionLiveState,
  AuctionResult,
  EditionMarketOpportunity,
  PublicCopyDetail,
} from "@geek/domain";

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

export async function loadCanonicalAuctionResult(
  auctionId: string,
): Promise<MarketLoadResult<AuctionResult>> {
  const result = await getAuctionResult(supabase, auctionId);
  if (result.outcome === "ok") return { outcome: "ok", data: result.data };
  if (result.outcome === "not_found" || result.outcome === "unauthenticated") {
    return { outcome: "not_found" };
  }
  return { outcome: "error" };
}

export async function loadCanonicalAuctionLiveState(
  auctionId: string,
): Promise<MarketLoadResult<AuctionLiveState>> {
  const result = await getAuctionLiveState(supabase, auctionId);
  if (result.outcome === "ok") return { outcome: "ok", data: result.data };
  if (result.outcome === "not_found") return result;
  return { outcome: "error" };
}

export async function loadMyAuctionParticipations(): Promise<
  MarketLoadResult<readonly AuctionParticipation[]>
> {
  const result = await getMyAuctionParticipations(supabase);
  return result.outcome === "ok" ? { outcome: "ok", data: result.data } : { outcome: "error" };
}

export async function loadAuctionBidHistory(
  auctionId: string,
): Promise<MarketLoadResult<readonly AuctionBidHistoryEntry[]>> {
  const result = await getAuctionBidHistory(supabase, auctionId);
  if (result.outcome === "ok") return { outcome: "ok", data: result.data };
  if (result.outcome === "not_found") return result;
  return { outcome: "error" };
}
