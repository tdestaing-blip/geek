import type {
  ConditionGrade,
  Money,
  WishlistCompletenessPreference,
  WishlistIntent,
  WishlistIntentPriority,
  WishlistIntentPrivatePreferences,
  WishlistIntentStatus,
  WishlistIntentVisibility,
} from "@geek/domain";
import type { GeekSupabaseClient } from "@geek/supabase";

import { resolveCaller } from "../caller";
import type { OwnedEntityResult, OwnedResult } from "../result";
import { databaseFailure, mapRows } from "../result";
import { toWishlistIntent, toWishlistIntentPrivatePreferences } from "./mapping";

const INTENT_FIELDS = `
  id, owner_id, game_id, edition_id, visibility, status,
  purchase_interest, trade_interest, preferred_region_code,
  completeness_preference, minimum_component_condition_grade,
  created_at, updated_at
`;

const MY_INTENTS_SELECT = `
  ${INTENT_FIELDS},
  wishlist_intent_private_details (
    wishlist_intent_id, max_purchase_amount_minor, max_purchase_currency,
    max_trade_distance_km, priority, private_notes
  )
`;

export type MyWishlistIntent = {
  readonly intent: WishlistIntent;
  readonly privatePreferences: WishlistIntentPrivatePreferences | null;
};

export type AddWishlistIntentInput = {
  readonly gameId: string;
  readonly editionId?: string;
  readonly visibility?: WishlistIntentVisibility;
  readonly status?: WishlistIntentStatus;
  readonly purchaseInterest?: boolean;
  readonly tradeInterest?: boolean;
  readonly preferredRegionCode?: string | null;
  readonly completeness?: WishlistCompletenessPreference;
  readonly minimumComponentConditionGrade?: ConditionGrade | null;
};

export type UpdateWishlistIntentPatch = {
  readonly editionId?: string | null;
  readonly visibility?: WishlistIntentVisibility;
  readonly status?: WishlistIntentStatus;
  readonly purchaseInterest?: boolean;
  readonly tradeInterest?: boolean;
  readonly preferredRegionCode?: string | null;
  readonly completeness?: WishlistCompletenessPreference;
  readonly minimumComponentConditionGrade?: ConditionGrade | null;
};

export type UpdateWishlistIntentPrivatePreferences = {
  readonly maxPurchaseBudget?: Money | null;
  readonly maxTradeDistanceKm?: number | null;
  readonly priority?: WishlistIntentPriority;
  readonly privateNotes?: string | null;
};

export async function getMyWishlistIntents(
  client: GeekSupabaseClient,
): Promise<OwnedResult<readonly MyWishlistIntent[]>> {
  const caller = await resolveCaller(client);
  if (caller.outcome !== "ok") return caller;

  const { data, error } = await client
    .from("wishlist_intents")
    .select(MY_INTENTS_SELECT)
    .eq("owner_id", caller.userId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (error !== null) return databaseFailure(error);

  return mapRows(() =>
    data.map((row) => {
      const privateRow = row.wishlist_intent_private_details;
      return {
        intent: toWishlistIntent(row),
        privatePreferences:
          privateRow === null ? null : toWishlistIntentPrivatePreferences(privateRow),
      };
    }),
  );
}

export async function addWishlistIntent(
  client: GeekSupabaseClient,
  input: AddWishlistIntentInput,
): Promise<OwnedResult<WishlistIntent>> {
  const caller = await resolveCaller(client);
  if (caller.outcome !== "ok") return caller;

  const { data, error } = await client
    .from("wishlist_intents")
    .insert({
      owner_id: caller.userId,
      game_id: input.gameId,
      ...(input.editionId === undefined ? {} : { edition_id: input.editionId }),
      ...(input.visibility === undefined ? {} : { visibility: input.visibility }),
      ...(input.status === undefined ? {} : { status: input.status }),
      ...(input.purchaseInterest === undefined
        ? {}
        : { purchase_interest: input.purchaseInterest }),
      ...(input.tradeInterest === undefined ? {} : { trade_interest: input.tradeInterest }),
      ...(input.preferredRegionCode === undefined
        ? {}
        : { preferred_region_code: input.preferredRegionCode }),
      ...(input.completeness === undefined ? {} : { completeness_preference: input.completeness }),
      ...(input.minimumComponentConditionGrade === undefined
        ? {}
        : { minimum_component_condition_grade: input.minimumComponentConditionGrade }),
    })
    .select(INTENT_FIELDS)
    .single();

  if (error !== null) return databaseFailure(error);
  return mapRows(() => toWishlistIntent(data));
}

export async function updateWishlistIntent(
  client: GeekSupabaseClient,
  intentId: string,
  patch: UpdateWishlistIntentPatch,
): Promise<OwnedEntityResult<WishlistIntent>> {
  const caller = await resolveCaller(client);
  if (caller.outcome !== "ok") return caller;

  const changes = {
    ...(patch.editionId === undefined ? {} : { edition_id: patch.editionId }),
    ...(patch.visibility === undefined ? {} : { visibility: patch.visibility }),
    ...(patch.status === undefined ? {} : { status: patch.status }),
    ...(patch.purchaseInterest === undefined ? {} : { purchase_interest: patch.purchaseInterest }),
    ...(patch.tradeInterest === undefined ? {} : { trade_interest: patch.tradeInterest }),
    ...(patch.preferredRegionCode === undefined
      ? {}
      : { preferred_region_code: patch.preferredRegionCode }),
    ...(patch.completeness === undefined ? {} : { completeness_preference: patch.completeness }),
    ...(patch.minimumComponentConditionGrade === undefined
      ? {}
      : { minimum_component_condition_grade: patch.minimumComponentConditionGrade }),
  };
  if (Object.keys(changes).length === 0) {
    throw new RangeError("updateWishlistIntent needs at least one field to change");
  }

  const { data, error } = await client
    .from("wishlist_intents")
    .update(changes)
    .eq("id", intentId)
    .eq("owner_id", caller.userId)
    .select(INTENT_FIELDS)
    .maybeSingle();

  if (error !== null) return databaseFailure(error);
  if (data === null) return { outcome: "not_found" };
  return mapRows(() => toWishlistIntent(data));
}

export async function updateWishlistIntentPrivatePreferences(
  client: GeekSupabaseClient,
  intentId: string,
  patch: UpdateWishlistIntentPrivatePreferences,
): Promise<OwnedEntityResult<WishlistIntentPrivatePreferences>> {
  const caller = await resolveCaller(client);
  if (caller.outcome !== "ok") return caller;
  if (Object.keys(patch).length === 0) {
    throw new RangeError("updateWishlistIntentPrivatePreferences needs at least one field");
  }

  const ownedIntent = await client
    .from("wishlist_intents")
    .select("id")
    .eq("id", intentId)
    .eq("owner_id", caller.userId)
    .maybeSingle();
  if (ownedIntent.error !== null) return databaseFailure(ownedIntent.error);
  if (ownedIntent.data === null) return { outcome: "not_found" };

  const budget = patch.maxPurchaseBudget;
  const changes = {
    ...(budget === undefined
      ? {}
      : {
          max_purchase_amount_minor: budget?.amountMinor ?? null,
          max_purchase_currency: budget?.currency ?? null,
        }),
    ...(patch.maxTradeDistanceKm === undefined
      ? {}
      : { max_trade_distance_km: patch.maxTradeDistanceKm }),
    ...(patch.priority === undefined ? {} : { priority: patch.priority }),
    ...(patch.privateNotes === undefined ? {} : { private_notes: patch.privateNotes }),
  };
  const existing = await client
    .from("wishlist_intent_private_details")
    .select("wishlist_intent_id")
    .eq("wishlist_intent_id", intentId)
    .maybeSingle();
  if (existing.error !== null) return databaseFailure(existing.error);

  const response =
    existing.data === null
      ? await client
          .from("wishlist_intent_private_details")
          .insert({ wishlist_intent_id: intentId, ...changes })
          .select(
            `wishlist_intent_id, max_purchase_amount_minor, max_purchase_currency,
             max_trade_distance_km, priority, private_notes`,
          )
          .single()
      : await client
          .from("wishlist_intent_private_details")
          .update(changes)
          .eq("wishlist_intent_id", intentId)
          .select(
            `wishlist_intent_id, max_purchase_amount_minor, max_purchase_currency,
             max_trade_distance_km, priority, private_notes`,
          )
          .single();
  const { data, error } = response;

  if (error !== null) return databaseFailure(error);
  return mapRows(() => toWishlistIntentPrivatePreferences(data));
}

export async function removeWishlistIntent(
  client: GeekSupabaseClient,
  intentId: string,
): Promise<OwnedEntityResult<WishlistIntent>> {
  const caller = await resolveCaller(client);
  if (caller.outcome !== "ok") return caller;

  const { data, error } = await client
    .from("wishlist_intents")
    .delete()
    .eq("id", intentId)
    .eq("owner_id", caller.userId)
    .select(INTENT_FIELDS)
    .maybeSingle();

  if (error !== null) return databaseFailure(error);
  if (data === null) return { outcome: "not_found" };
  return mapRows(() => toWishlistIntent(data));
}
