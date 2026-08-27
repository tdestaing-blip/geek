import type { CopyAvailability } from "../ownership/copy";
import { createMoney, type CurrencyCode, type Money } from "../values";

export const LISTING_STATUSES = [
  "draft",
  "active",
  "reserved",
  "sold",
  "paused",
  "expired",
  "withdrawn",
] as const;

export type ListingStatus = (typeof LISTING_STATUSES)[number];

export type Listing = {
  readonly id: string;
  readonly copyId: string;
  readonly sellerId: string;
  readonly askingPrice: Money;
  readonly localPickup: boolean;
  readonly shippingAvailable: boolean;
  readonly status: ListingStatus;
  readonly publishedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type OwnedCopyCommercialState =
  | { readonly kind: "none" }
  | { readonly kind: "listing"; readonly listing: Listing }
  | { readonly kind: "auction"; readonly auctionId: string }
  | { readonly kind: "accepted_trade"; readonly tradeOfferId: string };

export function parseListingStatus(value: string): ListingStatus | null {
  switch (value) {
    case "draft":
    case "active":
    case "reserved":
    case "sold":
    case "paused":
    case "expired":
    case "withdrawn":
      return value;
    default:
      return null;
  }
}

/** Builds the positive Money value required for a direct-sale Listing. */
export function createListingAskingPrice(
  amountMinor: number,
  currency: CurrencyCode,
): Money | null {
  if (amountMinor <= 0) return null;
  return createMoney(amountMinor, currency);
}

export function canCreateDirectListing(
  availability: CopyAvailability,
  commercialState: OwnedCopyCommercialState,
): boolean {
  return (
    commercialState.kind === "none" &&
    (availability === "private" || availability === "open_to_trade")
  );
}
