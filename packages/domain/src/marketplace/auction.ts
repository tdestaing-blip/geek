import type { CopyAvailability } from "../ownership/copy";
import { createMoney, type CurrencyCode, type Money } from "../values";
import type { OwnedCopyCommercialState } from "./listing";

export const AUCTION_STATUSES = [
  "draft",
  "scheduled",
  "won",
  "ended",
  "cancelled",
  "sold",
] as const;

export const CREATE_AUCTION_V1_MIN_INCREMENT_MINOR = 100;
export const CREATE_AUCTION_V1_DURATION_DAYS = 7;

export type AuctionStatus = (typeof AUCTION_STATUSES)[number];

export type Auction = {
  readonly id: string;
  readonly copyId: string;
  readonly sellerId: string;
  readonly startingPrice: Money;
  readonly minIncrement: Money;
  readonly localPickup: boolean;
  readonly shippingAvailable: boolean;
  readonly status: AuctionStatus;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly currentPrice: Money | null;
  readonly bidCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type AuctionBidState = {
  readonly auctionId: string;
  readonly currentPrice: Money;
  readonly bidCount: number;
  readonly minIncrement: Money;
  readonly minimumBid: Money;
  readonly endsAt: string;
  readonly status: AuctionStatus;
};

export type AcceptedAuctionBid = AuctionBidState & {
  readonly bidId: string;
  readonly acceptedAmount: Money;
  readonly createdAt: string;
};

export const AUCTION_CALLER_BID_STATES = ["none", "leading", "outbid"] as const;

export type AuctionCallerBidState = (typeof AUCTION_CALLER_BID_STATES)[number];

export type AuctionLiveState = {
  readonly auctionId: string;
  readonly currentPrice: Money;
  readonly bidCount: number;
  readonly minIncrement: Money;
  readonly minimumBid: Money;
  readonly endsAt: string;
  readonly status: "scheduled";
  readonly callerBidState: AuctionCallerBidState | null;
};

export const AUCTION_CALLER_OUTCOMES = ["seller_won", "seller_no_sale", "won", "lost"] as const;

export type AuctionCallerOutcome = (typeof AUCTION_CALLER_OUTCOMES)[number];

export type AuctionResult = {
  readonly auctionId: string;
  readonly status: "ended" | "won";
  readonly finalPrice: Money | null;
  readonly bidCount: number;
  readonly endsAt: string;
  readonly callerOutcome: AuctionCallerOutcome;
};

export function parseAuctionStatus(value: string): AuctionStatus | null {
  switch (value) {
    case "draft":
    case "scheduled":
    case "won":
    case "ended":
    case "cancelled":
    case "sold":
      return value;
    default:
      return null;
  }
}

export function parseAuctionCallerOutcome(value: string): AuctionCallerOutcome | null {
  switch (value) {
    case "seller_won":
    case "seller_no_sale":
    case "won":
    case "lost":
      return value;
    default:
      return null;
  }
}

export function parseAuctionCallerBidState(value: string): AuctionCallerBidState | null {
  switch (value) {
    case "none":
    case "leading":
    case "outbid":
      return value;
    default:
      return null;
  }
}

/** Builds the non-negative starting Money value allowed by the Auction model. */
export function createAuctionStartingPrice(
  amountMinor: number,
  currency: CurrencyCode,
): Money | null {
  if (amountMinor < 0) return null;
  return createMoney(amountMinor, currency);
}

export function canCreateAuction(
  availability: CopyAvailability,
  commercialState: OwnedCopyCommercialState,
): boolean {
  return (
    commercialState.kind === "none" &&
    (availability === "private" || availability === "open_to_trade")
  );
}

/** Calculates the next legal bid for presentation; the database remains authoritative. */
export function getAuctionMinimumBid(auction: Auction): Money | null {
  if (auction.bidCount === 0) return auction.startingPrice;
  if (
    auction.currentPrice === null ||
    auction.currentPrice.currency !== auction.minIncrement.currency
  ) {
    return null;
  }
  return createMoney(
    auction.currentPrice.amountMinor + auction.minIncrement.amountMinor,
    auction.currentPrice.currency,
  );
}
