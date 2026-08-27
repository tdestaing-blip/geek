import type { Listing, Money, OwnedCopyCommercialState } from "@geek/domain";
import { createListingAskingPrice, parseCurrencyCode, parseListingStatus } from "@geek/domain";
import type { GeekSupabaseClient, Tables } from "@geek/supabase";

import { resolveCaller } from "../caller";
import type { OwnedEntityResult, OwnedResult } from "../result";
import { databaseFailure, InvalidRowError, mapRows } from "../result";

const LISTING_SELECT = `
  id, copy_id, seller_id, asking_amount_minor, asking_currency,
  local_pickup, shipping_available, status, published_at, created_at, updated_at
`;

export type CreateListingInput = {
  readonly copyId: string;
  readonly askingPrice: Money;
};

export type CreateListingResult = OwnedResult<Listing> | { readonly outcome: "invalid_input" };

/** Reads the caller's active direct-sale Listings for a bounded Copy set. */
export async function getMyActiveListingsForCopies(
  client: GeekSupabaseClient,
  copyIds: readonly string[],
): Promise<OwnedResult<readonly Listing[]>> {
  const caller = await resolveCaller(client);
  if (caller.outcome !== "ok") return caller;

  const ids = [...new Set(copyIds)];
  if (ids.length > 100) throw new RangeError("Active Listing reads support at most 100 Copy ids");
  if (ids.length === 0) return { outcome: "ok", data: [] };

  const selected = await client
    .from("listings")
    .select(LISTING_SELECT)
    .eq("seller_id", caller.userId)
    .eq("status", "active")
    .in("copy_id", ids)
    .order("copy_id", { ascending: true })
    .order("id", { ascending: true });
  if (selected.error !== null) return databaseFailure(selected.error);

  return mapRows(() => {
    const listings = selected.data.map(toListing);
    const copyIdsWithListing = new Set<string>();
    for (const listing of listings) {
      if (copyIdsWithListing.has(listing.copyId)) {
        throw new InvalidRowError(
          "listings.copy_id",
          `expected one active Listing for Copy ${listing.copyId}`,
        );
      }
      copyIdsWithListing.add(listing.copyId);
    }
    return listings;
  });
}

/**
 * Creates the caller's active direct-sale commitment for one owned Copy.
 *
 * The caller id is resolved from the canonical Supabase session and is never
 * accepted from the UI. Existing RLS, ownership locking, active-Listing
 * uniqueness and the single Copy commitment key remain the final authority.
 */
export async function createListing(
  client: GeekSupabaseClient,
  input: CreateListingInput,
): Promise<CreateListingResult> {
  const caller = await resolveCaller(client);
  if (caller.outcome !== "ok") return caller;

  const askingPrice = createListingAskingPrice(
    input.askingPrice.amountMinor,
    input.askingPrice.currency,
  );
  if (askingPrice === null) return { outcome: "invalid_input" };

  const inserted = await client
    .from("listings")
    .insert({
      copy_id: input.copyId,
      seller_id: caller.userId,
      asking_amount_minor: askingPrice.amountMinor,
      asking_currency: askingPrice.currency,
      local_pickup: true,
      shipping_available: false,
      status: "active",
      published_at: new Date().toISOString(),
    })
    .select(LISTING_SELECT)
    .single();

  if (inserted.error !== null) return databaseFailure(inserted.error);
  return mapRows(() => toListing(inserted.data));
}

/** Reads the caller-visible commitment which currently reserves an owned Copy. */
export async function getMyCopyCommercialState(
  client: GeekSupabaseClient,
  copyId: string,
): Promise<OwnedEntityResult<OwnedCopyCommercialState>> {
  const caller = await resolveCaller(client);
  if (caller.outcome !== "ok") return caller;

  const ownedCopy = await client
    .from("copies")
    .select("id")
    .eq("id", copyId)
    .eq("owner_id", caller.userId)
    .maybeSingle();
  if (ownedCopy.error !== null) return databaseFailure(ownedCopy.error);
  if (ownedCopy.data === null) return { outcome: "not_found" };

  const [listings, auctions, tradeMemberships] = await Promise.all([
    client
      .from("listings")
      .select(LISTING_SELECT)
      .eq("copy_id", copyId)
      .in("status", ["active", "reserved"]),
    client.from("auctions").select("id").eq("copy_id", copyId).in("status", ["scheduled", "won"]),
    client
      .from("trade_offer_copies")
      .select("trade_offer_id, trade_offers!inner(status)")
      .eq("copy_id", copyId)
      .eq("trade_offers.status", "accepted"),
  ]);

  if (listings.error !== null) return databaseFailure(listings.error);
  if (auctions.error !== null) return databaseFailure(auctions.error);
  if (tradeMemberships.error !== null) return databaseFailure(tradeMemberships.error);

  return mapRows(() => {
    const commitments: OwnedCopyCommercialState[] = [
      ...listings.data.map((listing) => ({
        kind: "listing" as const,
        listing: toListing(listing),
      })),
      ...auctions.data.map((auction) => ({ kind: "auction" as const, auctionId: auction.id })),
      ...tradeMemberships.data.map((membership) => ({
        kind: "accepted_trade" as const,
        tradeOfferId: membership.trade_offer_id,
      })),
    ];

    if (commitments.length > 1) {
      throw new InvalidRowError(
        "copy_commercial_commitments.copy_id",
        `expected at most one current commitment for Copy ${copyId}`,
      );
    }
    return commitments[0] ?? { kind: "none" as const };
  });
}

type ListingRow = Pick<
  Tables<"listings">,
  | "id"
  | "copy_id"
  | "seller_id"
  | "asking_amount_minor"
  | "asking_currency"
  | "local_pickup"
  | "shipping_available"
  | "status"
  | "published_at"
  | "created_at"
  | "updated_at"
>;

function toListing(row: ListingRow): Listing {
  const currency = parseCurrencyCode(row.asking_currency);
  const askingPrice =
    currency === null ? null : createListingAskingPrice(row.asking_amount_minor, currency);
  const status = parseListingStatus(row.status);

  if (askingPrice === null) {
    throw new InvalidRowError(
      "listings.asking_amount_minor",
      `expected positive safe minor units with ISO currency, got ${row.asking_amount_minor} ${row.asking_currency}`,
    );
  }
  if (status === null) {
    throw new InvalidRowError("listings.status", `unknown status "${row.status}"`);
  }

  return {
    id: row.id,
    copyId: row.copy_id,
    sellerId: row.seller_id,
    askingPrice,
    localPickup: row.local_pickup,
    shippingAvailable: row.shipping_available,
    status,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
