import type { Money } from "../values";
import type { Profile } from "../profile/profile";

export const ACTIVITY_SEGMENTS = ["current", "history"] as const;
export type ActivitySegment = (typeof ACTIVITY_SEGMENTS)[number];

export const ACTIVITY_KINDS = ["auction", "order", "listing"] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export const ACTIVITY_ROLES = ["bidder", "seller", "buyer"] as const;
export type ActivityRole = (typeof ACTIVITY_ROLES)[number];

export const ACTIVITY_STATES = [
  "auction_bidder_leading",
  "auction_bidder_outbid",
  "auction_bidder_resolving",
  "auction_bidder_won",
  "auction_bidder_lost",
  "auction_bidder_ended",
  "auction_seller_live",
  "auction_seller_resolving",
  "auction_seller_won",
  "auction_seller_ended",
  "order_buyer_awaiting_payment",
  "order_seller_awaiting_payment",
  "listing_active",
  "listing_withdrawn",
  "listing_expired",
  "listing_sold",
] as const;
export type ActivityState = (typeof ACTIVITY_STATES)[number];

export type ActivityCounterparty = Pick<Profile, "id" | "displayName" | "avatarPath">;

export type ActivityNavigationTarget =
  | {
      readonly kind: "public_copy";
      readonly copyId: string;
      readonly auctionId: string;
    }
  | { readonly kind: "owned_copy"; readonly copyId: string };

/** A caller-relative read projection over canonical transaction objects. */
export type ActivityItem = {
  readonly id: string;
  readonly kind: ActivityKind;
  readonly role: ActivityRole;
  readonly state: ActivityState;
  readonly segment: ActivitySegment;
  readonly objectId: string;
  readonly copyId: string;
  readonly gameId: string;
  readonly editionId: string | null;
  readonly title: string;
  readonly platformName: string | null;
  readonly regionCode: string | null;
  readonly thumbnailUrl: string | null;
  readonly counterparty: ActivityCounterparty | null;
  readonly amount: Money | null;
  readonly occurredAt: string;
  readonly endsAt: string | null;
  readonly requiresAttention: boolean;
  readonly navigationTarget: ActivityNavigationTarget;
};

export type ActivityCursor = {
  readonly requiresAttention: boolean;
  readonly occurredAt: string;
  readonly activityId: string;
};

export type ActivityPage = {
  readonly items: readonly ActivityItem[];
  readonly limit: number;
  readonly nextCursor: ActivityCursor | null;
};

export function parseActivitySegment(value: string): ActivitySegment | null {
  return value === "current" || value === "history" ? value : null;
}

export function parseActivityKind(value: string): ActivityKind | null {
  return value === "auction" || value === "order" || value === "listing" ? value : null;
}

export function parseActivityRole(value: string): ActivityRole | null {
  return value === "bidder" || value === "seller" || value === "buyer" ? value : null;
}

export function parseActivityState(value: string): ActivityState | null {
  return ACTIVITY_STATES.find((state) => state === value) ?? null;
}
