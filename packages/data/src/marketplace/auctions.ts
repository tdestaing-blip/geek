import type { Auction, Money } from "@geek/domain";
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

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
