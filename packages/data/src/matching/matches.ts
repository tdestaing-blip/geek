import type {
  ListingMatch,
  MatchReason,
  Profile,
  ReciprocalTradeMatch,
  WishlistMatch,
} from "@geek/domain";
import {
  createMoney,
  parseCurrencyCode,
  parseMatchDistanceBucket,
  parseMatchTargetKind,
} from "@geek/domain";
import type { GeekSupabaseClient } from "@geek/supabase";

import { resolveCaller } from "../caller";
import type { Page, PageRequest } from "../pagination";
import { resolvePage } from "../pagination";
import type { OwnedResult } from "../result";
import { databaseFailure, InvalidRowError, mapRows } from "../result";

const MATCH_PAGE_BOUNDS = { defaultLimit: 20, maxLimit: 50 } as const;

type SafeProfileRow = {
  readonly id: string;
  readonly username: string | null;
  readonly displayName: string | null;
  readonly avatarPath: string | null;
};

function toSafeProfile(row: SafeProfileRow): Profile {
  return { ...row, bio: null };
}

function toReason(row: {
  readonly target_kind: string;
  readonly completeness_preferred_satisfied: boolean | null;
  readonly completeness_required_satisfied: boolean;
  readonly condition_requirement_satisfied: boolean;
}): MatchReason {
  const targetKind = parseMatchTargetKind(row.target_kind);
  if (targetKind === null)
    throw new InvalidRowError("match.target_kind", `unknown kind ${row.target_kind}`);
  return {
    targetKind,
    completenessPreferredSatisfied: row.completeness_preferred_satisfied,
    completenessRequiredSatisfied: row.completeness_required_satisfied,
    conditionRequirementSatisfied: row.condition_requirement_satisfied,
  };
}

export async function getWishlistMatches(
  client: GeekSupabaseClient,
  wishlistIntentId: string,
  request?: PageRequest,
): Promise<OwnedResult<Page<WishlistMatch>>> {
  const caller = await resolveCaller(client);
  if (caller.outcome !== "ok") return caller;
  const { limit, offset } = resolvePage(request, MATCH_PAGE_BOUNDS);
  const { data, error } = await client.rpc("get_wishlist_matches", {
    wishlist_intent_id: wishlistIntentId,
    result_limit: limit,
    result_offset: offset,
  });
  if (error !== null) return databaseFailure(error);
  return mapRows(() => ({
    items: data.map((row) => {
      const distanceBucket =
        row.distance_bucket === null ? null : parseMatchDistanceBucket(row.distance_bucket);
      if (row.distance_bucket !== null && distanceBucket === null) {
        throw new InvalidRowError("match.distance_bucket", `unknown bucket ${row.distance_bucket}`);
      }
      return {
        intentId: row.intent_id,
        copy: { id: row.copy_id, gameId: row.game_id, editionId: row.edition_id },
        collector: toSafeProfile({
          id: row.collector_id,
          username: row.collector_username,
          displayName: row.collector_display_name,
          avatarPath: row.collector_avatar_path,
        }),
        reason: toReason(row),
        nearby: distanceBucket === null ? null : { distanceBucket },
      };
    }),
    limit,
    offset,
  }));
}

export async function getListingMatchesForWishlist(
  client: GeekSupabaseClient,
  wishlistIntentId: string,
  request?: PageRequest,
): Promise<OwnedResult<Page<ListingMatch>>> {
  const caller = await resolveCaller(client);
  if (caller.outcome !== "ok") return caller;
  const { limit, offset } = resolvePage(request, MATCH_PAGE_BOUNDS);
  const { data, error } = await client.rpc("get_listing_matches", {
    wishlist_intent_id: wishlistIntentId,
    result_limit: limit,
    result_offset: offset,
  });
  if (error !== null) return databaseFailure(error);
  return mapRows(() => ({
    items: data.map((row) => {
      const currency = parseCurrencyCode(row.asking_currency);
      const askingPrice = currency === null ? null : createMoney(row.asking_amount_minor, currency);
      if (askingPrice === null)
        throw new InvalidRowError("match.asking_price", "invalid Listing money");
      return {
        intentId: row.intent_id,
        listingId: row.listing_id,
        copy: { id: row.copy_id, gameId: row.game_id, editionId: row.edition_id },
        seller: toSafeProfile({
          id: row.seller_id,
          username: row.seller_username,
          displayName: row.seller_display_name,
          avatarPath: row.seller_avatar_path,
        }),
        askingPrice,
        reason: toReason(row),
      };
    }),
    limit,
    offset,
  }));
}

export async function getMyReciprocalTradeMatches(
  client: GeekSupabaseClient,
  request?: PageRequest & { readonly maxDistanceKm?: 2 | 5 | 10 | 25 | 50 | 100 | 200 },
): Promise<OwnedResult<Page<ReciprocalTradeMatch>>> {
  const caller = await resolveCaller(client);
  if (caller.outcome !== "ok") return caller;
  const { limit, offset } = resolvePage(request, MATCH_PAGE_BOUNDS);
  const { data, error } = await client.rpc("get_my_reciprocal_trade_match_pairs", {
    max_distance_km: request?.maxDistanceKm ?? 25,
    result_limit: limit,
    result_offset: offset,
  });
  if (error !== null) return databaseFailure(error);
  return mapRows(() => ({
    items: data.map((row) => {
      const distanceBucket = parseMatchDistanceBucket(row.distance_bucket);
      if (distanceBucket === null) {
        throw new InvalidRowError("match.reciprocal", "unknown explanation or distance value");
      }
      return {
        collector: toSafeProfile({
          id: row.collector_id,
          username: row.collector_username,
          displayName: row.collector_display_name,
          avatarPath: row.collector_avatar_path,
        }),
        myIntentId: row.my_intent_id,
        theirCopy: {
          id: row.their_copy_id,
          gameId: row.their_copy_game_id,
          editionId: row.their_copy_edition_id,
        },
        myReason: toReason({
          target_kind: row.my_target_kind,
          completeness_preferred_satisfied: row.my_completeness_preferred_satisfied,
          completeness_required_satisfied: row.my_completeness_required_satisfied,
          condition_requirement_satisfied: row.my_condition_requirement_satisfied,
        }),
        theirIntentId: row.their_intent_id,
        myCopy: {
          id: row.my_copy_id,
          gameId: row.my_copy_game_id,
          editionId: row.my_copy_edition_id,
        },
        theirReason: toReason({
          target_kind: row.their_target_kind,
          completeness_preferred_satisfied: row.their_completeness_preferred_satisfied,
          completeness_required_satisfied: row.their_completeness_required_satisfied,
          condition_requirement_satisfied: row.their_condition_requirement_satisfied,
        }),
        nearby: { distanceBucket },
      };
    }),
    limit,
    offset,
  }));
}
