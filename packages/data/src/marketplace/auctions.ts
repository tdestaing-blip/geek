import type {
  AcceptedAuctionBid,
  Auction,
  AuctionBidHistoryEntry,
  AuctionBidState,
  AuctionLiveState,
  AuctionParticipation,
  AuctionResult,
  Money,
} from "@geek/domain";
import {
  createAuctionStartingPrice,
  createMoney,
  parseAuctionCallerBidState,
  parseAuctionCallerOutcome,
  parseAuctionStatus,
  parseCurrencyCode,
  parseResolvedAuctionParticipationOutcome,
} from "@geek/domain";
import type { GeekSupabaseClient } from "@geek/supabase";

import { resolveCaller } from "../caller";
import type { EntityResult, OwnedEntityResult, OwnedResult } from "../result";
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

/** Reads the fixed caller-relative result of one resolved Auction. */
export async function getAuctionResult(
  client: GeekSupabaseClient,
  auctionId: string,
): Promise<OwnedEntityResult<AuctionResult>> {
  const caller = await resolveCaller(client);
  if (caller.outcome !== "ok") return caller;
  if (!isUuid(auctionId)) {
    return { outcome: "invalid_data", field: "auctions.id", message: "Invalid Auction id" };
  }

  const result = await client.rpc("get_auction_result", {
    target_auction_id: auctionId,
  });
  if (result.error !== null) return databaseFailure(result.error);

  const [row] = result.data;
  if (row === undefined) return { outcome: "not_found" };
  if (result.data.length !== 1) {
    return {
      outcome: "invalid_data",
      field: "get_auction_result",
      message: "get_auction_result: expected one caller-relative result",
    };
  }
  return mapRows(() => toAuctionResult(row));
}

/** Reads one public-safe live aggregate with caller-relative Bid state. */
export async function getAuctionLiveState(
  client: GeekSupabaseClient,
  auctionId: string,
): Promise<EntityResult<AuctionLiveState>> {
  if (!isUuid(auctionId)) {
    return { outcome: "invalid_data", field: "auctions.id", message: "Invalid Auction id" };
  }

  const result = await client.rpc("get_auction_live_state", {
    target_auction_id: auctionId,
  });
  if (result.error !== null) return databaseFailure(result.error);

  const [row] = result.data;
  if (row === undefined) return { outcome: "not_found" };
  if (result.data.length !== 1) {
    return {
      outcome: "invalid_data",
      field: "get_auction_live_state",
      message: "get_auction_live_state: expected one live Auction state",
    };
  }
  return mapRows(() => toAuctionLiveState(row));
}

/** Reads live and bounded recent resolved Auctions in which the caller placed a Bid. */
export async function getMyAuctionParticipations(
  client: GeekSupabaseClient,
): Promise<OwnedResult<readonly AuctionParticipation[]>> {
  const caller = await resolveCaller(client);
  if (caller.outcome !== "ok") return caller;

  const result = await client.rpc("get_my_auction_participations");
  if (result.error !== null) return databaseFailure(result.error);
  return mapRows(() => result.data.map(toAuctionParticipation));
}

/** Reads the bounded public-identity history authorized for one Auction. */
export async function getAuctionBidHistory(
  client: GeekSupabaseClient,
  auctionId: string,
): Promise<EntityResult<readonly AuctionBidHistoryEntry[]>> {
  if (!isUuid(auctionId)) {
    return { outcome: "invalid_data", field: "auctions.id", message: "Invalid Auction id" };
  }

  const result = await client.rpc("get_auction_bid_history", {
    target_auction_id: auctionId,
  });
  if (result.error !== null) return databaseFailure(result.error);
  return mapRows(() => result.data.map(toAuctionBidHistoryEntry));
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

function toAuctionResult(row: {
  readonly auction_id: string;
  readonly bid_count: number;
  readonly caller_outcome: string;
  readonly currency: string;
  readonly ends_at: string;
  readonly final_amount_minor: number | null;
  readonly status: string;
  readonly winner_public_avatar_path: string | null;
  readonly winner_public_display_name: string | null;
  readonly winner_public_profile_id: string | null;
}): AuctionResult {
  const currency = parseCurrencyCode(row.currency);
  const callerOutcome = parseAuctionCallerOutcome(row.caller_outcome);
  const finalPrice =
    row.final_amount_minor === null || currency === null
      ? null
      : createMoney(row.final_amount_minor, currency);
  if (row.status !== "ended" && row.status !== "won") {
    throw new InvalidRowError("get_auction_result.status", `unknown status "${row.status}"`);
  }
  if (currency === null) {
    throw new InvalidRowError("get_auction_result.currency", `invalid currency "${row.currency}"`);
  }
  if (callerOutcome === null) {
    throw new InvalidRowError(
      "get_auction_result.caller_outcome",
      `unknown caller outcome "${row.caller_outcome}"`,
    );
  }
  if (row.final_amount_minor !== null && finalPrice === null) {
    throw new InvalidRowError(
      "get_auction_result.final_amount_minor",
      `invalid amount ${row.final_amount_minor}`,
    );
  }
  if (!Number.isSafeInteger(row.bid_count) || row.bid_count < 0) {
    throw new InvalidRowError("get_auction_result.bid_count", `invalid count ${row.bid_count}`);
  }
  if (!Number.isFinite(Date.parse(row.ends_at))) {
    throw new InvalidRowError("get_auction_result.ends_at", `invalid timestamp "${row.ends_at}"`);
  }
  const winnerFields = [
    row.winner_public_profile_id,
    row.winner_public_display_name,
    row.winner_public_avatar_path,
  ];
  if (row.status === "ended" && winnerFields.some((value) => value !== null)) {
    throw new InvalidRowError("get_auction_result.winner", "ended Auction cannot expose a winner");
  }
  if (row.status === "won" && row.winner_public_profile_id === null) {
    throw new InvalidRowError("get_auction_result.winner", "won Auction requires a public winner");
  }
  return {
    auctionId: row.auction_id,
    status: row.status,
    finalPrice,
    bidCount: row.bid_count,
    endsAt: row.ends_at,
    callerOutcome,
    winner:
      row.winner_public_profile_id === null
        ? null
        : {
            id: row.winner_public_profile_id,
            displayName: row.winner_public_display_name,
            avatarPath: row.winner_public_avatar_path,
          },
  };
}

function toAuctionParticipation(row: {
  readonly auction_id: string;
  readonly bid_count: number;
  readonly caller_bid_state: string | null;
  readonly caller_outcome: string | null;
  readonly copy_id: string;
  readonly cover_asset_url: string | null;
  readonly currency: string;
  readonly current_amount_minor: number;
  readonly edition_id: string;
  readonly ends_at: string;
  readonly game_id: string;
  readonly game_title: string;
  readonly platform_name: string;
  readonly participation_phase: string;
  readonly region_code: string | null;
}): AuctionParticipation {
  const currency = parseCurrencyCode(row.currency);
  const currentPrice = currency === null ? null : createMoney(row.current_amount_minor, currency);
  if (currentPrice === null || currentPrice.amountMinor < 0) {
    throw new InvalidRowError(
      "get_my_auction_participations.current_amount_minor",
      "invalid canonical Money",
    );
  }
  if (!Number.isSafeInteger(row.bid_count) || row.bid_count < 1) {
    throw new InvalidRowError(
      "get_my_auction_participations.bid_count",
      "expected a positive count",
    );
  }
  if (!Number.isFinite(Date.parse(row.ends_at))) {
    throw new InvalidRowError("get_my_auction_participations.ends_at", "invalid timestamp");
  }
  const display = {
    auctionId: row.auction_id,
    copyId: row.copy_id,
    gameId: row.game_id,
    editionId: row.edition_id,
    gameTitle: row.game_title,
    platformName: row.platform_name,
    regionCode: row.region_code,
    coverAssetUrl: row.cover_asset_url,
    currentPrice,
    bidCount: row.bid_count,
    endsAt: row.ends_at,
  };

  if (row.participation_phase === "live") {
    if (
      (row.caller_bid_state !== "leading" && row.caller_bid_state !== "outbid") ||
      row.caller_outcome !== null
    ) {
      throw new InvalidRowError(
        "get_my_auction_participations.live_state",
        "live participation requires leading/outbid state only",
      );
    }
    return { ...display, phase: "live", callerBidState: row.caller_bid_state };
  }

  if (
    row.participation_phase === "resolving" &&
    row.caller_bid_state === null &&
    row.caller_outcome === null
  ) {
    return { ...display, phase: "resolving" };
  }

  const callerOutcome =
    row.caller_outcome === null
      ? null
      : parseResolvedAuctionParticipationOutcome(row.caller_outcome);
  if (
    row.participation_phase !== "resolved" ||
    row.caller_bid_state !== null ||
    callerOutcome === null
  ) {
    throw new InvalidRowError(
      "get_my_auction_participations.resolved_state",
      "resolved participation requires won/lost/ended outcome only",
    );
  }
  return { ...display, phase: "resolved", callerOutcome };
}

function toAuctionBidHistoryEntry(row: {
  readonly accepted_at: string;
  readonly amount_minor: number;
  readonly currency: string;
  readonly is_caller: boolean;
  readonly is_leading: boolean;
  readonly is_winning: boolean;
  readonly public_avatar_path: string | null;
  readonly public_display_name: string | null;
  readonly public_profile_id: string;
}): AuctionBidHistoryEntry {
  const currency = parseCurrencyCode(row.currency);
  const amount = currency === null ? null : createMoney(row.amount_minor, currency);
  if (amount === null || amount.amountMinor < 0) {
    throw new InvalidRowError("get_auction_bid_history.amount_minor", "invalid canonical Money");
  }
  if (!Number.isFinite(Date.parse(row.accepted_at))) {
    throw new InvalidRowError("get_auction_bid_history.accepted_at", "invalid timestamp");
  }
  return {
    amount,
    acceptedAt: row.accepted_at,
    bidder: {
      id: row.public_profile_id,
      displayName: row.public_display_name,
      avatarPath: row.public_avatar_path,
    },
    isCaller: row.is_caller,
    isLeading: row.is_leading,
    isWinning: row.is_winning,
  };
}

function toAuctionLiveState(row: {
  readonly auction_id: string;
  readonly bid_count: number;
  readonly caller_bid_state: string | null;
  readonly currency: string;
  readonly current_amount_minor: number;
  readonly ends_at: string;
  readonly min_increment_minor: number;
  readonly minimum_bid_minor: number;
  readonly status: string;
}): AuctionLiveState {
  const currency = parseCurrencyCode(row.currency);
  const currentPrice = currency === null ? null : createMoney(row.current_amount_minor, currency);
  const minIncrement = currency === null ? null : createMoney(row.min_increment_minor, currency);
  const minimumBid = currency === null ? null : createMoney(row.minimum_bid_minor, currency);
  const callerBidState =
    row.caller_bid_state === null ? null : parseAuctionCallerBidState(row.caller_bid_state);
  if (row.status !== "scheduled") {
    throw new InvalidRowError("get_auction_live_state.status", `unknown status "${row.status}"`);
  }
  if (currency === null || currentPrice === null || minIncrement === null || minimumBid === null) {
    throw new InvalidRowError("get_auction_live_state.money", "invalid canonical Auction money");
  }
  if (row.caller_bid_state !== null && callerBidState === null) {
    throw new InvalidRowError(
      "get_auction_live_state.caller_bid_state",
      `unknown caller state "${row.caller_bid_state}"`,
    );
  }
  if (!Number.isSafeInteger(row.bid_count) || row.bid_count < 0) {
    throw new InvalidRowError("get_auction_live_state.bid_count", `invalid count ${row.bid_count}`);
  }
  if (!Number.isFinite(Date.parse(row.ends_at))) {
    throw new InvalidRowError(
      "get_auction_live_state.ends_at",
      `invalid timestamp "${row.ends_at}"`,
    );
  }
  return {
    auctionId: row.auction_id,
    currentPrice,
    bidCount: row.bid_count,
    minIncrement,
    minimumBid,
    endsAt: row.ends_at,
    status: row.status,
    callerBidState,
  };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
