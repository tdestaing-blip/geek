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
