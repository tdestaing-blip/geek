import type { AuctionOrderView } from "@geek/domain";
import { createMoney, parseCurrencyCode, parseOrderStatus } from "@geek/domain";
import type { GeekSupabaseClient } from "@geek/supabase";

import { resolveCaller } from "../caller";
import type { OwnedEntityResult } from "../result";
import { databaseFailure, InvalidRowError, mapRows } from "../result";

/** Reads the safe canonical Order projection available only to its two parties. */
export async function getAuctionOrder(
  client: GeekSupabaseClient,
  auctionId: string,
): Promise<OwnedEntityResult<AuctionOrderView>> {
  const caller = await resolveCaller(client);
  if (caller.outcome !== "ok") return caller;
  if (!isUuid(auctionId)) {
    return { outcome: "invalid_data", field: "auction_id", message: "Invalid Auction id" };
  }

  const result = await client.rpc("get_auction_order", { target_auction_id: auctionId });
  if (result.error !== null) return databaseFailure(result.error);

  const [row] = result.data;
  if (row === undefined) return { outcome: "not_found" };
  if (result.data.length !== 1) {
    return {
      outcome: "invalid_data",
      field: "get_auction_order",
      message: "get_auction_order: expected one caller-relative Order",
    };
  }

  return mapRows(() => {
    const currency = parseCurrencyCode(row.currency);
    const status = parseOrderStatus(row.status);
    const agreedPrice = currency === null ? null : createMoney(row.amount_minor, currency);
    if (status === null) {
      throw new InvalidRowError("get_auction_order.status", `unknown status ${row.status}`);
    }
    if (agreedPrice === null || agreedPrice.amountMinor < 0) {
      throw new InvalidRowError("get_auction_order.amount_minor", "invalid canonical Money");
    }
    if (row.caller_role !== "buyer" && row.caller_role !== "seller") {
      throw new InvalidRowError("get_auction_order.caller_role", "invalid caller role");
    }
    if (!Number.isFinite(Date.parse(row.created_at))) {
      throw new InvalidRowError("get_auction_order.created_at", "invalid timestamp");
    }
    return {
      orderId: row.order_id,
      auctionId: row.auction_id,
      copyId: row.copy_id,
      status,
      agreedPrice,
      createdAt: row.created_at,
      callerRole: row.caller_role,
      counterparty: {
        id: row.counterparty_profile_id,
        displayName: row.counterparty_display_name,
        avatarPath: row.counterparty_avatar_path,
      },
    };
  });
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
