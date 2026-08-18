import type { Money, WishlistIntent, WishlistIntentPrivatePreferences } from "@geek/domain";
import {
  createMoney,
  parseConditionGrade,
  parseCurrencyCode,
  parseWishlistCompletenessPreference,
  parseWishlistIntentPriority,
  parseWishlistIntentStatus,
  parseWishlistIntentVisibility,
} from "@geek/domain";
import type { Tables } from "@geek/supabase";

import { InvalidRowError } from "../result";

type IntentFields = Pick<
  Tables<"wishlist_intents">,
  | "id"
  | "owner_id"
  | "game_id"
  | "edition_id"
  | "visibility"
  | "status"
  | "purchase_interest"
  | "trade_interest"
  | "preferred_region_code"
  | "completeness_preference"
  | "minimum_component_condition_grade"
  | "created_at"
  | "updated_at"
>;

type PrivateFields = Pick<
  Tables<"wishlist_intent_private_details">,
  | "wishlist_intent_id"
  | "max_purchase_amount_minor"
  | "max_purchase_currency"
  | "max_trade_distance_km"
  | "priority"
  | "private_notes"
>;

export function toWishlistIntent(row: IntentFields): WishlistIntent {
  const visibility = parseWishlistIntentVisibility(row.visibility);
  const status = parseWishlistIntentStatus(row.status);
  const completeness = parseWishlistCompletenessPreference(row.completeness_preference);
  const minimumGrade =
    row.minimum_component_condition_grade === null
      ? null
      : parseConditionGrade(row.minimum_component_condition_grade);

  if (visibility === null) {
    throw new InvalidRowError(
      "wishlist_intents.visibility",
      `unknown visibility "${row.visibility}"`,
    );
  }
  if (status === null) {
    throw new InvalidRowError("wishlist_intents.status", `unknown status "${row.status}"`);
  }
  if (completeness === null) {
    throw new InvalidRowError(
      "wishlist_intents.completeness_preference",
      `unknown preference "${row.completeness_preference}"`,
    );
  }
  if (row.minimum_component_condition_grade !== null && minimumGrade === null) {
    throw new InvalidRowError(
      "wishlist_intents.minimum_component_condition_grade",
      `expected a grade of 1-5, got ${row.minimum_component_condition_grade}`,
    );
  }

  return {
    id: row.id,
    ownerId: row.owner_id,
    gameId: row.game_id,
    editionId: row.edition_id,
    visibility,
    status,
    purchaseInterest: row.purchase_interest,
    tradeInterest: row.trade_interest,
    constraints: {
      preferredRegionCode: row.preferred_region_code,
      completeness,
      minimumComponentConditionGrade: minimumGrade,
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toWishlistIntentPrivatePreferences(
  row: PrivateFields,
): WishlistIntentPrivatePreferences {
  const priority = parseWishlistIntentPriority(row.priority);

  if (priority === null) {
    throw new InvalidRowError(
      "wishlist_intent_private_details.priority",
      `expected a priority of 1-3, got ${row.priority}`,
    );
  }

  if (
    row.max_trade_distance_km !== null &&
    (!Number.isInteger(row.max_trade_distance_km) ||
      row.max_trade_distance_km < 1 ||
      row.max_trade_distance_km > 1000)
  ) {
    throw new InvalidRowError(
      "wishlist_intent_private_details.max_trade_distance_km",
      `expected whole kilometers from 1-1000, got ${row.max_trade_distance_km}`,
    );
  }

  return {
    intentId: row.wishlist_intent_id,
    maxPurchaseBudget: toBudget(row.max_purchase_amount_minor, row.max_purchase_currency),
    maxTradeDistanceKm: row.max_trade_distance_km,
    priority,
    privateNotes: row.private_notes,
  };
}

function toBudget(amount: number | null, currency: string | null): Money | null {
  if (amount === null && currency === null) {
    return null;
  }
  if (amount === null || currency === null) {
    throw new InvalidRowError(
      "wishlist_intent_private_details.max_purchase_amount_minor",
      "a budget needs both an amount and a currency",
    );
  }
  if (amount < 0) {
    throw new InvalidRowError(
      "wishlist_intent_private_details.max_purchase_amount_minor",
      `expected a non-negative amount, got ${amount}`,
    );
  }

  const currencyCode = parseCurrencyCode(currency);
  const budget = currencyCode === null ? null : createMoney(amount, currencyCode);

  if (budget === null) {
    throw new InvalidRowError(
      "wishlist_intent_private_details.max_purchase_currency",
      `invalid budget ${amount} ${currency}`,
    );
  }

  return budget;
}
