import type { AcceptedAuctionBid, Auction, AuctionBidState, Money } from "@geek/domain";
import {
  createAuctionStartingPrice,
  createMoney,
  parseAuctionStatus,
  parseCurrencyCode,
} from "@geek/domain";
import type { GeekSupabaseClient } from "@geek/supabase";

import { resolveCaller } from "../caller";
import type { OwnedResult } from "../result";
import { databaseFailure, InvalidRowError, mapRows } from "../result";

export const AUCTION_SELECT = `
  id, copy_id, seller_id, starting_amount_minor, currency, min_increment_minor,
  local_pickup, shipping_available, status, starts_at, ends_at,
  current_amount_minor, bid_count, created_at, updated_at
`;

export type CreateAuctionInput = {
  readonly auctionId: string;
  readonly copyId: string;
  readonly startingPrice: Money;
};

export type CreateAuctionResult = OwnedResult<Auction> | { readonly outcome: "invalid_input" };

export type PlaceAuctionBidInput = {
  readonly bidId: string;
  readonly auctionId: string;
  readonly amount: Money;
};

export type PlaceAuctionBidResult =
  | OwnedResult<AcceptedAuctionBid>
  | { readonly outcome: "invalid_input" }
  | {
      readonly outcome:
        | "auction_ended"
        | "auction_unavailable"
        | "auction_upcoming"
        | "bid_too_low"
        | "seller_forbidden";
      readonly data: AuctionBidState;
    };

/**
 * Atomically creates the caller's scheduled seven-day Auction commitment.
 *
 * The stable Auction id belongs to one UI submission attempt and makes a lost
 * response retry-safe. Seller identity, V1 increment, fulfillment, and the
 * authoritative time window are all established inside the database RPC.
 */
export async function createAuction(
  client: GeekSupabaseClient,
  input: CreateAuctionInput,
): Promise<CreateAuctionResult> {
  const caller = await resolveCaller(client);
  if (caller.outcome !== "ok") return caller;

  const currency = parseCurrencyCode("EUR");
  if (currency === null) throw new Error("EUR must be a valid ISO 4217 currency");
  const startingPrice = createAuctionStartingPrice(
    input.startingPrice.amountMinor,
    input.startingPrice.currency,
  );
  if (
    startingPrice === null ||
    startingPrice.currency !== currency ||
    !isUuid(input.auctionId) ||
    !isUuid(input.copyId)
  ) {
    return { outcome: "invalid_input" };
  }

  const created = await client.rpc("create_auction", {
    request_auction_id: input.auctionId,
    requested_starting_amount_minor: startingPrice.amountMinor,
    target_copy_id: input.copyId,
  });
  if (created.error !== null) return databaseFailure(created.error);

  return mapRows(() => {
    const [auction] = created.data;
    if (created.data.length !== 1 || auction === undefined) {
      throw new InvalidRowError("create_auction", "expected exactly one canonical Auction");
    }
    return toAuction({ ...auction, id: auction.auction_id });
  });
}

/** Reads the public-safe canonical Auction state needed to open the bid sheet. */
export async function getAuctionForBidding(
  client: GeekSupabaseClient,
  auctionId: string,
): Promise<OwnedResult<Auction> | { readonly outcome: "not_found" }> {
  const caller = await resolveCaller(client);
  if (caller.outcome !== "ok") return caller;
  if (!isUuid(auctionId)) {
    return { outcome: "invalid_data", field: "auctions.id", message: "Invalid Auction id" };
  }

  const result = await client
    .from("auctions")
    .select(AUCTION_SELECT)
    .eq("id", auctionId)
    .maybeSingle();
  if (result.error !== null) return databaseFailure(result.error);
  if (result.data === null) return { outcome: "not_found" };
  const row = result.data;
  return mapRows(() => toAuction(row));
}

/** Places one retry-safe bid using a caller-generated stable Bid UUID. */
export async function placeAuctionBid(
  client: GeekSupabaseClient,
  input: PlaceAuctionBidInput,
): Promise<PlaceAuctionBidResult> {
  const caller = await resolveCaller(client);
  if (caller.outcome !== "ok") return caller;
  if (
    !isUuid(input.bidId) ||
    !isUuid(input.auctionId) ||
    input.amount.amountMinor < 0 ||
    input.amount.currency !== "EUR" ||
    !Number.isSafeInteger(input.amount.amountMinor)
  ) {
    return { outcome: "invalid_input" };
  }

  const result = await client.rpc("place_auction_bid", {
    bid_amount_minor: input.amount.amountMinor,
    request_bid_id: input.bidId,
    target_auction_id: input.auctionId,
  });
  if (result.error !== null) return databaseFailure(result.error);

  const [row] = result.data;
  if (result.data.length !== 1 || row === undefined) {
    return {
      outcome: "invalid_data",
      field: "place_auction_bid",
      message: "place_auction_bid: expected exactly one result",
    };
  }
  const mapped = mapRows(() => toAuctionBidState(row));
  if (mapped.outcome !== "ok") return mapped;
  const state = mapped.data;
  switch (row.result_code) {
    case "accepted": {
      if (row.bid_id === null || row.accepted_amount_minor === null || row.created_at === null) {
        return {
          outcome: "invalid_data",
          field: "place_auction_bid",
          message: "place_auction_bid: accepted result is incomplete",
        };
      }
      const acceptedAmount = createMoney(row.accepted_amount_minor, state.currentPrice.currency);
      if (acceptedAmount === null || acceptedAmount.amountMinor < 0) {
        return {
          outcome: "invalid_data",
          field: "place_auction_bid.accepted_amount_minor",
          message: "place_auction_bid.accepted_amount_minor: invalid Money",
        };
      }
      return {
        outcome: "ok",
        data: {
          ...state,
          bidId: row.bid_id,
          acceptedAmount,
          createdAt: row.created_at,
        },
      };
    }
    case "auction_ended":
    case "auction_unavailable":
    case "auction_upcoming":
    case "bid_too_low":
    case "seller_forbidden":
      return { outcome: row.result_code, data: state };
    default:
      return {
        outcome: "invalid_data",
        field: "place_auction_bid.result_code",
        message: "place_auction_bid.result_code: unknown result code",
      };
  }
}

export type AuctionRow = {
  readonly id: string;
  readonly copy_id: string;
  readonly seller_id: string;
  readonly starting_amount_minor: number;
  readonly currency: string;
  readonly min_increment_minor: number;
  readonly local_pickup: boolean;
  readonly shipping_available: boolean;
  readonly status: string;
  readonly starts_at: string | null;
  readonly ends_at: string | null;
  readonly current_amount_minor: number | null;
  readonly bid_count: number;
  readonly created_at: string;
  readonly updated_at: string;
};

export function toAuction(row: AuctionRow): Auction {
  const currency = parseCurrencyCode(row.currency);
  const status = parseAuctionStatus(row.status);
  const startingPrice =
    currency === null ? null : createAuctionStartingPrice(row.starting_amount_minor, currency);
  const minIncrement = currency === null ? null : createMoney(row.min_increment_minor, currency);
  const currentPrice =
    row.current_amount_minor === null || currency === null
      ? null
      : createMoney(row.current_amount_minor, currency);

  if (startingPrice === null) {
    throw new InvalidRowError(
      "auctions.starting_amount_minor",
      `expected non-negative safe minor units, got ${row.starting_amount_minor}`,
    );
  }
  if (minIncrement === null || minIncrement.amountMinor <= 0) {
    throw new InvalidRowError(
      "auctions.min_increment_minor",
      `expected positive safe minor units, got ${row.min_increment_minor}`,
    );
  }
  if (row.current_amount_minor !== null && currentPrice === null) {
    throw new InvalidRowError(
      "auctions.current_amount_minor",
      `expected safe minor units, got ${row.current_amount_minor}`,
    );
  }
  if (status === null) {
    throw new InvalidRowError("auctions.status", `unknown status "${row.status}"`);
  }
  if (row.starts_at === null || row.ends_at === null) {
    throw new InvalidRowError("auctions.starts_at", "scheduled Auction requires a time window");
  }
  if (!Number.isSafeInteger(row.bid_count) || row.bid_count < 0) {
    throw new InvalidRowError("auctions.bid_count", `invalid count ${row.bid_count}`);
  }

  return {
    id: row.id,
    copyId: row.copy_id,
    sellerId: row.seller_id,
    startingPrice,
    minIncrement,
    localPickup: row.local_pickup,
    shippingAvailable: row.shipping_available,
    status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    currentPrice,
    bidCount: row.bid_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toAuctionBidState(row: {
  readonly auction_id: string;
  readonly bid_count: number;
  readonly currency: string;
  readonly current_amount_minor: number;
  readonly ends_at: string;
  readonly min_increment_minor: number;
  readonly minimum_bid_minor: number;
  readonly status: string;
}): AuctionBidState {
  const currency = parseCurrencyCode(row.currency);
  const status = parseAuctionStatus(row.status);
  const currentPrice = currency === null ? null : createMoney(row.current_amount_minor, currency);
  const minIncrement = currency === null ? null : createMoney(row.min_increment_minor, currency);
  const minimumBid = currency === null ? null : createMoney(row.minimum_bid_minor, currency);
  if (
    currency === null ||
    status === null ||
    currentPrice === null ||
    currentPrice.amountMinor < 0 ||
    minIncrement === null ||
    minIncrement.amountMinor <= 0 ||
    minimumBid === null ||
    minimumBid.amountMinor < 0 ||
    !Number.isSafeInteger(row.bid_count) ||
    row.bid_count < 0
  ) {
    throw new InvalidRowError("place_auction_bid", "invalid canonical Auction projection");
  }
  return {
    auctionId: row.auction_id,
    currentPrice,
    bidCount: row.bid_count,
    minIncrement,
    minimumBid,
    endsAt: row.ends_at,
    status,
  };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
