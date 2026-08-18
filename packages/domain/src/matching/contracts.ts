import type { Money } from "../values";
import type { Profile } from "../profile/profile";

export type MatchTargetKind = "broad_game_match" | "exact_edition_match";

/** Structured eligibility facts, never a score or generated explanation. */
export type MatchReason = {
  readonly targetKind: MatchTargetKind;
  readonly completenessPreferredSatisfied: boolean | null;
  readonly completenessRequiredSatisfied: boolean;
  readonly conditionRequirementSatisfied: boolean;
};

export type MatchCopy = {
  readonly id: string;
  readonly gameId: string;
  readonly editionId: string | null;
};

/** Another collector's trade-actionable Copy satisfies one of my intents. */
export type WishlistMatch = {
  readonly intentId: string;
  readonly copy: MatchCopy;
  readonly collector: Profile;
  readonly reason: MatchReason;
  readonly nearby: NearbyMatchSignal | null;
};

/** A currently active Listing satisfies one of my intents. */
export type ListingMatch = {
  readonly intentId: string;
  readonly listingId: string;
  readonly copy: MatchCopy;
  readonly seller: Profile;
  readonly askingPrice: Money;
  readonly reason: MatchReason;
};

export type NearbyMatchSignal = {
  readonly distanceBucket: MatchDistanceBucket;
};

export type MatchDistanceBucket =
  | "under_2_km"
  | "2_to_5_km"
  | "5_to_10_km"
  | "10_to_25_km"
  | "25_to_50_km"
  | "50_to_100_km"
  | "100_to_200_km";

/** Both directions of one current, explainable trade opportunity. */
export type ReciprocalTradeMatch = {
  readonly collector: Profile;
  readonly myIntentId: string;
  readonly theirCopy: MatchCopy;
  readonly myReason: MatchReason;
  readonly theirIntentId: string;
  readonly myCopy: MatchCopy;
  readonly theirReason: MatchReason;
  readonly nearby: NearbyMatchSignal;
};

const TARGET_KINDS: readonly string[] = ["broad_game_match", "exact_edition_match"];
const DISTANCE_BUCKETS: readonly string[] = [
  "under_2_km",
  "2_to_5_km",
  "5_to_10_km",
  "10_to_25_km",
  "25_to_50_km",
  "50_to_100_km",
  "100_to_200_km",
];

export function parseMatchTargetKind(value: string): MatchTargetKind | null {
  return TARGET_KINDS.includes(value) ? (value as MatchTargetKind) : null;
}

export function parseMatchDistanceBucket(value: string): MatchDistanceBucket | null {
  return DISTANCE_BUCKETS.includes(value) ? (value as MatchDistanceBucket) : null;
}
