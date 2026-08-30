import type { ActivityCursor, ActivityItem, ActivityPage, ActivitySegment } from "@geek/domain";
import {
  createMoney,
  parseActivityKind,
  parseActivityRole,
  parseActivitySegment,
  parseActivityState,
  parseCurrencyCode,
} from "@geek/domain";
import type { GeekFunctionReturns, GeekSupabaseClient } from "@geek/supabase";

import { resolveCaller } from "../caller";
import type { OwnedResult } from "../result";
import { databaseFailure, InvalidRowError, mapRows } from "../result";

export const ACTIVITY_DEFAULT_LIMIT = 20;
export const ACTIVITY_MAX_LIMIT = 50;

export type ActivityRequest = {
  readonly segment?: ActivitySegment;
  readonly limit?: number;
  readonly cursor?: ActivityCursor;
};

/** Reads one deterministic caller-relative page from the canonical Activity projection. */
export async function getMyActivity(
  client: GeekSupabaseClient,
  request: ActivityRequest = {},
): Promise<OwnedResult<ActivityPage>> {
  const caller = await resolveCaller(client);
  if (caller.outcome !== "ok") return caller;

  const segment = request.segment ?? "current";
  const limit = request.limit ?? ACTIVITY_DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > ACTIVITY_MAX_LIMIT) {
    throw new RangeError(
      `Activity limit must be an integer between 1 and ${ACTIVITY_MAX_LIMIT}, got ${limit}`,
    );
  }
  if (request.cursor && !Number.isFinite(Date.parse(request.cursor.occurredAt))) {
    throw new RangeError("Activity cursor occurredAt must be a valid timestamp");
  }

  const result = await client.rpc("get_my_activity", {
    activity_segment: segment,
    result_limit: limit,
    cursor_requires_attention: request.cursor?.requiresAttention,
    cursor_occurred_at: request.cursor?.occurredAt,
    cursor_activity_id: request.cursor?.activityId,
  });
  if (result.error !== null) return databaseFailure(result.error);

  return mapRows(() => {
    const items = result.data.map((row) => mapActivityRow(row, segment));
    const last = items.at(-1);
    return {
      items,
      limit,
      nextCursor:
        last && result.data.at(-1)?.has_more
          ? {
              requiresAttention: last.requiresAttention,
              occurredAt: last.occurredAt,
              activityId: last.id,
            }
          : null,
    };
  });
}

type ActivityRow = GeekFunctionReturns<"get_my_activity">[number];

function mapActivityRow(row: ActivityRow, requestedSegment: ActivitySegment): ActivityItem {
  const kind = parseActivityKind(row.kind);
  const role = parseActivityRole(row.caller_role);
  const state = parseActivityState(row.activity_state);
  const segment = parseActivitySegment(row.segment);
  if (kind === null) throw invalid("kind", `unknown kind ${row.kind}`);
  if (role === null) throw invalid("caller_role", `unknown role ${row.caller_role}`);
  if (state === null) throw invalid("activity_state", `unknown state ${row.activity_state}`);
  if (segment === null || segment !== requestedSegment) {
    throw invalid("segment", `unexpected segment ${row.segment}`);
  }
  if (!isUuid(row.object_id) || !isUuid(row.copy_id) || !isUuid(row.game_id)) {
    throw invalid("object_reference", "invalid canonical object reference");
  }
  if (row.edition_id !== null && !isUuid(row.edition_id)) {
    throw invalid("edition_id", "invalid Edition id");
  }
  if (!Number.isFinite(Date.parse(row.occurred_at))) {
    throw invalid("occurred_at", "invalid canonical timestamp");
  }
  if (row.ends_at !== null && !Number.isFinite(Date.parse(row.ends_at))) {
    throw invalid("ends_at", "invalid canonical timestamp");
  }

  const currency = row.currency === null ? null : parseCurrencyCode(row.currency);
  const amount =
    row.amount_minor === null || currency === null ? null : createMoney(row.amount_minor, currency);
  if (amount === null || amount.amountMinor < 0) {
    throw invalid("amount_minor", "Activity source must expose valid canonical Money");
  }

  const counterparty =
    row.counterparty_profile_id === null
      ? null
      : {
          id: row.counterparty_profile_id,
          displayName: row.counterparty_display_name,
          avatarPath: row.counterparty_avatar_path,
        };
  if (counterparty !== null && !isUuid(counterparty.id)) {
    throw invalid("counterparty_profile_id", "invalid public Profile id");
  }

  const navigationTarget =
    row.navigation_kind === "public_copy" && row.auction_id !== null
      ? { kind: "public_copy" as const, copyId: row.copy_id, auctionId: row.auction_id }
      : row.navigation_kind === "owned_copy"
        ? { kind: "owned_copy" as const, copyId: row.copy_id }
        : null;
  if (navigationTarget === null) {
    throw invalid("navigation_kind", "Activity row has no canonical destination");
  }

  assertStateContract({
    kind,
    role,
    state,
    segment,
    requiresAttention: row.requires_attention,
    navigationKind: navigationTarget.kind,
  });

  return {
    id: row.activity_id,
    kind,
    role,
    state,
    segment,
    objectId: row.object_id,
    copyId: row.copy_id,
    gameId: row.game_id,
    editionId: row.edition_id,
    title: row.title,
    platformName: row.platform_name,
    regionCode: row.region_code,
    thumbnailUrl: row.thumbnail_url,
    counterparty,
    amount,
    occurredAt: row.occurred_at,
    endsAt: row.ends_at,
    requiresAttention: row.requires_attention,
    navigationTarget,
  };
}

function assertStateContract(input: {
  readonly kind: ActivityItem["kind"];
  readonly role: ActivityItem["role"];
  readonly state: ActivityItem["state"];
  readonly segment: ActivityItem["segment"];
  readonly requiresAttention: boolean;
  readonly navigationKind: ActivityItem["navigationTarget"]["kind"];
}) {
  const current = input.segment === "current";
  switch (input.state) {
    case "auction_bidder_leading":
    case "auction_bidder_resolving":
      if (!current || input.kind !== "auction" || input.role !== "bidder") break;
      if (!input.requiresAttention && input.navigationKind === "public_copy") return;
      break;
    case "auction_bidder_outbid":
      if (
        current &&
        input.kind === "auction" &&
        input.role === "bidder" &&
        input.requiresAttention &&
        input.navigationKind === "public_copy"
      )
        return;
      break;
    case "auction_bidder_won":
    case "auction_bidder_lost":
    case "auction_bidder_ended":
      if (
        !current &&
        input.kind === "auction" &&
        input.role === "bidder" &&
        !input.requiresAttention &&
        input.navigationKind === "public_copy"
      )
        return;
      break;
    case "auction_seller_live":
    case "auction_seller_resolving":
      if (
        current &&
        input.kind === "auction" &&
        input.role === "seller" &&
        !input.requiresAttention &&
        input.navigationKind === "owned_copy"
      )
        return;
      break;
    case "auction_seller_won":
    case "auction_seller_ended":
      if (
        !current &&
        input.kind === "auction" &&
        input.role === "seller" &&
        !input.requiresAttention &&
        input.navigationKind === "owned_copy"
      )
        return;
      break;
    case "order_buyer_awaiting_payment":
      if (
        current &&
        input.kind === "order" &&
        input.role === "buyer" &&
        input.requiresAttention &&
        input.navigationKind === "public_copy"
      )
        return;
      break;
    case "order_seller_awaiting_payment":
      if (
        current &&
        input.kind === "order" &&
        input.role === "seller" &&
        !input.requiresAttention &&
        input.navigationKind === "owned_copy"
      )
        return;
      break;
    case "listing_active":
      if (
        current &&
        input.kind === "listing" &&
        input.role === "seller" &&
        !input.requiresAttention &&
        input.navigationKind === "owned_copy"
      )
        return;
      break;
    case "listing_withdrawn":
    case "listing_expired":
    case "listing_sold":
      if (
        !current &&
        input.kind === "listing" &&
        input.role === "seller" &&
        !input.requiresAttention &&
        input.navigationKind === "owned_copy"
      )
        return;
      break;
  }
  throw invalid("activity_state", `inconsistent state contract ${input.state}`);
}

function invalid(field: string, detail: string): InvalidRowError {
  return new InvalidRowError(`get_my_activity.${field}`, detail);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
