import type { ConditionGrade, CopyComponentPresence } from "../ownership/components";
import type { CopyAvailability } from "../ownership/copy";
import type { Profile } from "../profile/profile";
import type { CalendarDate, Money } from "../values";

export type DirectListingOpportunity = {
  readonly type: "listing";
  readonly listingId: string;
  readonly copyId: string;
  readonly gameId: string;
  readonly editionId: string;
  readonly seller: Profile;
  readonly askingPrice: Money;
  readonly localPickup: boolean;
  readonly shippingAvailable: boolean;
  readonly publishedAt: string | null;
};

export type AuctionOpportunity = {
  readonly type: "auction";
  readonly auctionId: string;
  readonly copyId: string;
  readonly gameId: string;
  readonly editionId: string;
  readonly seller: Profile;
  readonly currentPrice: Money;
  readonly bidCount: number;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly phase: "upcoming" | "live";
  readonly localPickup: boolean;
  readonly shippingAvailable: boolean;
};

/** A calculated reciprocal Match, not a persisted TradeOffer. */
export type ReciprocalTradeOpportunity = {
  readonly type: "trade";
  readonly copyId: string;
  readonly gameId: string;
  readonly editionId: string;
  readonly collector: Profile;
};

export type EditionMarketOpportunity =
  DirectListingOpportunity | AuctionOpportunity | ReciprocalTradeOpportunity;

export type PublicCopyComponentAssessment = {
  readonly editionComponentId: string;
  readonly kind: string;
  readonly name: string;
  readonly sortOrder: number;
  readonly presence: CopyComponentPresence | null;
  readonly conditionGrade: ConditionGrade | null;
};

export type PublicCopyDetail = {
  readonly copy: {
    readonly id: string;
    readonly gameId: string;
    readonly editionId: string | null;
    readonly availability: CopyAvailability;
  };
  readonly game: {
    readonly id: string;
    readonly canonicalTitle: string;
    readonly description: string | null;
    readonly originalReleaseDate: CalendarDate | null;
  };
  readonly edition: {
    readonly id: string;
    readonly gameId: string;
    readonly editionName: string | null;
    readonly regionCode: string | null;
    readonly releaseDate: CalendarDate | null;
    readonly publisherName: string | null;
  } | null;
  readonly platform: {
    readonly id: string;
    readonly name: string;
    readonly slug: string;
  } | null;
  readonly owner: Profile;
  readonly components: readonly PublicCopyComponentAssessment[];
  readonly opportunity:
    | Pick<DirectListingOpportunity, "type" | "listingId" | "copyId" | "askingPrice">
    | Pick<
        AuctionOpportunity,
        "type" | "auctionId" | "copyId" | "currentPrice" | "bidCount" | "endsAt"
      >
    | Pick<ReciprocalTradeOpportunity, "type" | "copyId">
    | null;
};
