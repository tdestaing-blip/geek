import type {
  AuctionOpportunity,
  DirectListingOpportunity,
  EditionMarketOpportunity,
  Profile,
  PublicCopyComponentAssessment,
  PublicCopyDetail,
  ReciprocalTradeOpportunity,
} from "@geek/domain";
import {
  createMoney,
  parseCalendarDate,
  parseConditionGrade,
  parseCopyAvailability,
  parseCopyComponentPresence,
  parseCurrencyCode,
} from "@geek/domain";
import type { GeekSupabaseClient } from "@geek/supabase";

import { resolveCaller } from "../caller";
import { toProfile } from "../profile/mapping";
import { getMyReciprocalTradeMatches } from "../matching/matches";
import type { EntityResult, OwnedResult } from "../result";
import { databaseFailure, InvalidRowError, mapRows } from "../result";

const DISCOVERY_PAGE_SIZE = 50;

/**
 * Reads every current opportunity for one exact Edition.
 *
 * Listing and Auction lifecycle filtering remains server-authoritative in the
 * existing discovery RPCs. Reciprocal Trade rows come only from the canonical
 * calculated Match projection; `open_to_trade` by itself is never surfaced.
 */
export async function getEditionMarketOpportunities(
  client: GeekSupabaseClient,
  gameId: string,
  editionId: string,
): Promise<OwnedResult<readonly EditionMarketOpportunity[]>> {
  const caller = await resolveCaller(client);
  if (caller.outcome !== "ok") return caller;

  const [listingResult, auctionResult, tradeResult] = await Promise.all([
    loadListingRows(client, gameId, editionId),
    loadAuctionRows(client, gameId, editionId),
    loadReciprocalTradeRows(client, gameId, editionId),
  ]);

  if (listingResult.outcome !== "ok") return listingResult;
  if (auctionResult.outcome !== "ok") return auctionResult;
  if (tradeResult.outcome !== "ok") return tradeResult;

  const sellerIds = [
    ...new Set([
      ...listingResult.data.map((opportunity) => opportunity.sellerId),
      ...auctionResult.data.map((opportunity) => opportunity.sellerId),
    ]),
  ];
  const profilesResult = await loadSellerProfiles(client, sellerIds);
  if (profilesResult.outcome !== "ok") return profilesResult;

  const opportunities: EditionMarketOpportunity[] = [
    ...listingResult.data.map(({ sellerId, ...opportunity }) => ({
      ...opportunity,
      seller: requireSeller(profilesResult.data, sellerId),
    })),
    ...auctionResult.data.map(({ sellerId, ...opportunity }) => ({
      ...opportunity,
      seller: requireSeller(profilesResult.data, sellerId),
    })),
    ...tradeResult.data,
  ];

  return mapRows(() => opportunities.sort(compareMarketOpportunities));
}

/** Resolves a marketplace-safe Copy projection using only its canonical id. */
export async function getPublicCopyDetail(
  client: GeekSupabaseClient,
  copyId: string,
): Promise<EntityResult<PublicCopyDetail>> {
  const { data, error } = await client.rpc("get_public_copy_detail", {
    target_copy_id: copyId,
  });

  if (error !== null) return databaseFailure(error);
  if (!Array.isArray(data) || data.length === 0) return { outcome: "not_found" };
  return mapRows(() => toPublicCopyDetail(data));
}

type Loaded<T> =
  | { readonly outcome: "ok"; readonly data: readonly T[] }
  | Exclude<OwnedResult<never>, { readonly outcome: "ok" }>;

type ListingRowOpportunity = Omit<DirectListingOpportunity, "seller"> & {
  readonly sellerId: string;
};

type AuctionRowOpportunity = Omit<AuctionOpportunity, "seller"> & {
  readonly sellerId: string;
};

async function loadListingRows(
  client: GeekSupabaseClient,
  gameId: string,
  editionId: string,
): Promise<Loaded<ListingRowOpportunity>> {
  const rows: unknown[] = [];
  for (let offset = 0; ; offset += DISCOVERY_PAGE_SIZE) {
    const { data, error } = await client.rpc("get_buy_discovery", {
      target_game_id: gameId,
      target_edition_id: editionId,
      result_limit: DISCOVERY_PAGE_SIZE,
      result_offset: offset,
    });
    if (error !== null) return databaseFailure(error);
    if (!Array.isArray(data)) {
      return {
        outcome: "invalid_data",
        field: "get_buy_discovery",
        message: "get_buy_discovery: expected an array of rows",
      };
    }
    rows.push(...data);
    if (data.length < DISCOVERY_PAGE_SIZE) break;
  }
  return mapRows(() => rows.map(toListingOpportunity));
}

async function loadAuctionRows(
  client: GeekSupabaseClient,
  gameId: string,
  editionId: string,
): Promise<Loaded<AuctionRowOpportunity>> {
  const rows: unknown[] = [];
  for (let offset = 0; ; offset += DISCOVERY_PAGE_SIZE) {
    const { data, error } = await client.rpc("get_auction_discovery", {
      target_game_id: gameId,
      target_edition_id: editionId,
      result_limit: DISCOVERY_PAGE_SIZE,
      result_offset: offset,
    });
    if (error !== null) return databaseFailure(error);
    if (!Array.isArray(data)) {
      return {
        outcome: "invalid_data",
        field: "get_auction_discovery",
        message: "get_auction_discovery: expected an array of rows",
      };
    }
    rows.push(...data);
    if (data.length < DISCOVERY_PAGE_SIZE) break;
  }
  return mapRows(() => rows.map(toAuctionOpportunity));
}

async function loadReciprocalTradeRows(
  client: GeekSupabaseClient,
  gameId: string,
  editionId: string,
): Promise<Loaded<ReciprocalTradeOpportunity>> {
  const byCopyId = new Map<string, ReciprocalTradeOpportunity>();
  for (let offset = 0; ; offset += DISCOVERY_PAGE_SIZE) {
    const result = await getMyReciprocalTradeMatches(client, {
      limit: DISCOVERY_PAGE_SIZE,
      offset,
      maxDistanceKm: 200,
    });
    if (result.outcome !== "ok") {
      // A caller without discovery geography has no nearby reciprocal result.
      if (result.outcome === "failed" && result.failure.code === "P0002") {
        return { outcome: "ok", data: [] };
      }
      return result;
    }

    for (const match of result.data.items) {
      if (
        match.theirCopy.gameId === gameId &&
        match.theirCopy.editionId === editionId &&
        !byCopyId.has(match.theirCopy.id)
      ) {
        byCopyId.set(match.theirCopy.id, {
          type: "trade",
          copyId: match.theirCopy.id,
          gameId,
          editionId,
          collector: match.collector,
        });
      }
    }

    if (result.data.items.length < DISCOVERY_PAGE_SIZE) break;
  }
  return { outcome: "ok", data: [...byCopyId.values()] };
}

function toListingOpportunity(value: unknown): ListingRowOpportunity {
  const row = requireRecord(value, "get_buy_discovery");
  const currency = requireMoney(row, "asking_amount_minor", "asking_currency", "Listing");
  return {
    type: "listing",
    listingId: requireString(row, "listing_id", "get_buy_discovery"),
    copyId: requireString(row, "copy_id", "get_buy_discovery"),
    sellerId: requireString(row, "seller_id", "get_buy_discovery"),
    gameId: requireString(row, "game_id", "get_buy_discovery"),
    editionId: requireString(row, "edition_id", "get_buy_discovery"),
    askingPrice: currency,
    localPickup: requireBoolean(row, "local_pickup", "get_buy_discovery"),
    shippingAvailable: requireBoolean(row, "shipping_available", "get_buy_discovery"),
    publishedAt: optionalString(row, "published_at", "get_buy_discovery"),
  };
}

function toAuctionOpportunity(value: unknown): AuctionRowOpportunity {
  const row = requireRecord(value, "get_auction_discovery");
  const currentAmount = optionalNumber(row, "current_amount_minor", "get_auction_discovery");
  const startingAmount = requireNumber(row, "starting_amount_minor", "get_auction_discovery");
  const currencyValue = requireString(row, "currency", "get_auction_discovery");
  const currency = parseCurrencyCode(currencyValue);
  const currentPrice =
    currency === null ? null : createMoney(currentAmount ?? startingAmount, currency);
  if (currentPrice === null) {
    throw new InvalidRowError("get_auction_discovery.current_price", "invalid Auction money");
  }
  const phase = requireString(row, "phase", "get_auction_discovery");
  if (phase !== "upcoming" && phase !== "live") {
    throw new InvalidRowError("get_auction_discovery.phase", `unknown phase ${phase}`);
  }
  return {
    type: "auction",
    auctionId: requireString(row, "auction_id", "get_auction_discovery"),
    copyId: requireString(row, "copy_id", "get_auction_discovery"),
    sellerId: requireString(row, "seller_id", "get_auction_discovery"),
    gameId: requireString(row, "game_id", "get_auction_discovery"),
    editionId: requireString(row, "edition_id", "get_auction_discovery"),
    currentPrice,
    bidCount: requireNumber(row, "bid_count", "get_auction_discovery"),
    startsAt: requireString(row, "starts_at", "get_auction_discovery"),
    endsAt: requireString(row, "ends_at", "get_auction_discovery"),
    phase,
    localPickup: requireBoolean(row, "local_pickup", "get_auction_discovery"),
    shippingAvailable: requireBoolean(row, "shipping_available", "get_auction_discovery"),
  };
}

export function compareMarketOpportunities(
  left: EditionMarketOpportunity,
  right: EditionMarketOpportunity,
): number {
  const typeOrder = { listing: 0, auction: 1, trade: 2 } as const;
  const typeDifference = typeOrder[left.type] - typeOrder[right.type];
  if (typeDifference !== 0) return typeDifference;

  if (left.type === "listing" && right.type === "listing") {
    return (
      left.askingPrice.currency.localeCompare(right.askingPrice.currency, "en") ||
      left.askingPrice.amountMinor - right.askingPrice.amountMinor ||
      left.listingId.localeCompare(right.listingId, "en")
    );
  }
  if (left.type === "auction" && right.type === "auction") {
    return (
      Number(left.phase === "upcoming") - Number(right.phase === "upcoming") ||
      left.endsAt.localeCompare(right.endsAt, "en") ||
      left.auctionId.localeCompare(right.auctionId, "en")
    );
  }
  if (left.type === "trade" && right.type === "trade") {
    return (
      left.collector.id.localeCompare(right.collector.id, "en") ||
      left.copyId.localeCompare(right.copyId, "en")
    );
  }
  return 0;
}

function toPublicCopyDetail(value: unknown): PublicCopyDetail {
  if (!Array.isArray(value) || value.length === 0) {
    throw new InvalidRowError("get_public_copy_detail", "expected at least one row");
  }
  const rows = value.map((row) => requireRecord(row, "get_public_copy_detail"));
  const [first, ...remaining] = rows;
  if (first === undefined) {
    throw new InvalidRowError("get_public_copy_detail", "expected at least one row");
  }
  const copyId = requireString(first, "copy_id", "get_public_copy_detail");
  const gameId = requireString(first, "game_id", "get_public_copy_detail");
  const editionId = optionalString(first, "edition_id", "get_public_copy_detail");
  const availabilityValue = requireString(first, "availability", "get_public_copy_detail");
  const availability = parseCopyAvailability(availabilityValue);
  if (availability === null) {
    throw new InvalidRowError("get_public_copy_detail.availability", availabilityValue);
  }

  for (const row of remaining) {
    if (
      row.copy_id !== copyId ||
      row.game_id !== gameId ||
      row.edition_id !== editionId ||
      row.listing_id !== first.listing_id ||
      row.auction_id !== first.auction_id ||
      row.trade_available !== first.trade_available
    ) {
      throw new InvalidRowError("get_public_copy_detail", "inconsistent repeated Copy rows");
    }
  }

  const edition = toProjectedEdition(first, gameId, editionId);
  const platform = toProjectedPlatform(first, editionId);
  return {
    copy: { id: copyId, gameId, editionId, availability },
    game: {
      id: gameId,
      canonicalTitle: requireString(first, "game_title", "get_public_copy_detail"),
      description: optionalString(first, "game_description", "get_public_copy_detail"),
      originalReleaseDate: optionalCalendarDate(
        first,
        "game_original_release_date",
        "get_public_copy_detail",
      ),
    },
    edition,
    platform,
    owner: {
      id: requireString(first, "owner_id", "get_public_copy_detail"),
      username: optionalString(first, "owner_username", "get_public_copy_detail"),
      displayName: optionalString(first, "owner_display_name", "get_public_copy_detail"),
      avatarPath: optionalString(first, "owner_avatar_path", "get_public_copy_detail"),
      bio: optionalString(first, "owner_bio", "get_public_copy_detail"),
    },
    components: rows.flatMap(toPublicComponent),
    opportunity: toProjectedOpportunity(first, copyId),
  };
}

async function loadSellerProfiles(
  client: GeekSupabaseClient,
  sellerIds: readonly string[],
): Promise<OwnedResult<ReadonlyMap<string, Profile>>> {
  if (sellerIds.length === 0) return { outcome: "ok", data: new Map() };
  const profiles = new Map<string, Profile>();
  for (let index = 0; index < sellerIds.length; index += 100) {
    const { data, error } = await client
      .from("profiles")
      .select("id, username, display_name, avatar_path, bio")
      .in("id", sellerIds.slice(index, index + 100));
    if (error !== null) return databaseFailure(error);
    const mapped = mapRows(() => data.map(toProfile));
    if (mapped.outcome !== "ok") return mapped;
    for (const profile of mapped.data) profiles.set(profile.id, profile);
  }
  return { outcome: "ok", data: profiles };
}

function requireSeller(profiles: ReadonlyMap<string, Profile>, sellerId: string): Profile {
  const seller = profiles.get(sellerId);
  if (seller === undefined) {
    throw new InvalidRowError("profiles.id", `missing marketplace seller ${sellerId}`);
  }
  return seller;
}

function toProjectedEdition(
  row: Record<string, unknown>,
  gameId: string,
  editionId: string | null,
): PublicCopyDetail["edition"] {
  if (editionId === null) {
    for (const field of [
      "edition_name",
      "region_code",
      "edition_release_date",
      "edition_publisher_name",
    ]) {
      requireNull(row, field, "get_public_copy_detail");
    }
    return null;
  }
  return {
    id: editionId,
    gameId,
    editionName: optionalString(row, "edition_name", "get_public_copy_detail"),
    regionCode: optionalString(row, "region_code", "get_public_copy_detail"),
    releaseDate: optionalCalendarDate(row, "edition_release_date", "get_public_copy_detail"),
    publisherName: optionalString(row, "edition_publisher_name", "get_public_copy_detail"),
  };
}

function toProjectedPlatform(
  row: Record<string, unknown>,
  editionId: string | null,
): PublicCopyDetail["platform"] {
  if (editionId === null) {
    for (const field of ["platform_id", "platform_name", "platform_slug"]) {
      requireNull(row, field, "get_public_copy_detail");
    }
    return null;
  }
  return {
    id: requireString(row, "platform_id", "get_public_copy_detail"),
    name: requireString(row, "platform_name", "get_public_copy_detail"),
    slug: requireString(row, "platform_slug", "get_public_copy_detail"),
  };
}

function toPublicComponent(row: Record<string, unknown>): readonly PublicCopyComponentAssessment[] {
  const id = optionalString(row, "edition_component_id", "get_public_copy_detail");
  if (id === null) {
    for (const field of [
      "component_kind",
      "component_name",
      "component_sort_order",
      "component_presence",
      "component_condition_grade",
    ]) {
      requireNull(row, field, "get_public_copy_detail");
    }
    return [];
  }
  const presenceValue = optionalString(row, "component_presence", "get_public_copy_detail");
  const presence = presenceValue === null ? null : parseCopyComponentPresence(presenceValue);
  if (presenceValue !== null && presence === null) {
    throw new InvalidRowError("get_public_copy_detail.component_presence", presenceValue);
  }
  const gradeValue = optionalNumber(row, "component_condition_grade", "get_public_copy_detail");
  const conditionGrade = gradeValue === null ? null : parseConditionGrade(gradeValue);
  if (gradeValue !== null && conditionGrade === null) {
    throw new InvalidRowError(
      "get_public_copy_detail.component_condition_grade",
      String(gradeValue),
    );
  }
  return [
    {
      editionComponentId: id,
      kind: requireString(row, "component_kind", "get_public_copy_detail"),
      name: requireString(row, "component_name", "get_public_copy_detail"),
      sortOrder: requireNumber(row, "component_sort_order", "get_public_copy_detail"),
      presence,
      conditionGrade,
    },
  ];
}

function toProjectedOpportunity(
  row: Record<string, unknown>,
  copyId: string,
): PublicCopyDetail["opportunity"] {
  const listingId = optionalString(row, "listing_id", "get_public_copy_detail");
  const auctionId = optionalString(row, "auction_id", "get_public_copy_detail");
  const tradeAvailable = requireBoolean(row, "trade_available", "get_public_copy_detail");
  const opportunityCount =
    Number(listingId !== null) + Number(auctionId !== null) + Number(tradeAvailable);
  if (opportunityCount > 1) {
    throw new InvalidRowError("get_public_copy_detail.opportunity", "conflicting opportunities");
  }
  if (listingId !== null) {
    return {
      type: "listing",
      listingId,
      copyId,
      askingPrice: requireMoney(
        row,
        "listing_amount_minor",
        "listing_currency",
        "get_public_copy_detail Listing",
      ),
    };
  }
  requireNull(row, "listing_amount_minor", "get_public_copy_detail");
  requireNull(row, "listing_currency", "get_public_copy_detail");

  if (auctionId !== null) {
    return {
      type: "auction",
      auctionId,
      copyId,
      currentPrice: requireMoney(
        row,
        "auction_amount_minor",
        "auction_currency",
        "get_public_copy_detail Auction",
      ),
      bidCount: requireNumber(row, "auction_bid_count", "get_public_copy_detail"),
      endsAt: requireString(row, "auction_ends_at", "get_public_copy_detail"),
    };
  }
  for (const field of [
    "auction_amount_minor",
    "auction_currency",
    "auction_bid_count",
    "auction_ends_at",
  ]) {
    requireNull(row, field, "get_public_copy_detail");
  }
  return tradeAvailable ? { type: "trade", copyId } : null;
}

function requireMoney(
  row: Record<string, unknown>,
  amountField: string,
  currencyField: string,
  context: string,
) {
  const amount = requireNumber(row, amountField, context);
  const currencyValue = requireString(row, currencyField, context);
  const currency = parseCurrencyCode(currencyValue);
  const money = currency === null ? null : createMoney(amount, currency);
  if (money === null || amount < 0) {
    throw new InvalidRowError(`${context}.${amountField}`, "invalid canonical Money");
  }
  return money;
}

function requireRecord(value: unknown, context: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new InvalidRowError(context, "expected an object row");
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(row: Record<string, unknown>, field: string, context: string): string {
  const value = row[field];
  if (typeof value !== "string") {
    throw new InvalidRowError(`${context}.${field}`, "expected a string");
  }
  return value;
}

function optionalString(
  row: Record<string, unknown>,
  field: string,
  context: string,
): string | null {
  const value = row[field];
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new InvalidRowError(`${context}.${field}`, "expected a string or null");
  }
  return value;
}

function requireNumber(row: Record<string, unknown>, field: string, context: string): number {
  const value = row[field];
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new InvalidRowError(`${context}.${field}`, "expected a safe integer");
  }
  return value;
}

function optionalNumber(
  row: Record<string, unknown>,
  field: string,
  context: string,
): number | null {
  const value = row[field];
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new InvalidRowError(`${context}.${field}`, "expected a safe integer or null");
  }
  return value;
}

function requireBoolean(row: Record<string, unknown>, field: string, context: string): boolean {
  const value = row[field];
  if (typeof value !== "boolean") {
    throw new InvalidRowError(`${context}.${field}`, "expected a boolean");
  }
  return value;
}

function requireNull(row: Record<string, unknown>, field: string, context: string): void {
  if (row[field] !== null) {
    throw new InvalidRowError(`${context}.${field}`, "expected null");
  }
}

function optionalCalendarDate(row: Record<string, unknown>, field: string, context: string) {
  const value = optionalString(row, field, context);
  if (value === null) return null;
  const date = parseCalendarDate(value);
  if (date === null) {
    throw new InvalidRowError(`${context}.${field}`, `invalid date ${value}`);
  }
  return date;
}
