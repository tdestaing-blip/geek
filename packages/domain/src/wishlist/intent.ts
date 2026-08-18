import type { ConditionGrade } from "../ownership/components";
import type { Money } from "../values";

/** A collector's acquisition intent for a Game, optionally narrowed to an Edition. */
export type WishlistIntent = {
  readonly id: string;
  readonly ownerId: string;
  readonly gameId: string;
  readonly editionId: string | null;
  readonly visibility: WishlistIntentVisibility;
  readonly status: WishlistIntentStatus;
  readonly purchaseInterest: boolean;
  readonly tradeInterest: boolean;
  readonly constraints: WishlistIntentConstraints;
  readonly createdAt: string;
  readonly updatedAt: string;
};

/** Network-safe matching preferences. Absence means the collector is flexible. */
export type WishlistIntentConstraints = {
  readonly preferredRegionCode: string | null;
  readonly completeness: WishlistCompletenessPreference;
  /**
   * A universal lower bound for each catalogued component recorded as present.
   * It is never an overall Copy score. A future strict matcher must treat an
   * unassessed component or `unknown` presence as unable to prove this
   * constraint; missing components are handled separately by completeness.
   */
  readonly minimumComponentConditionGrade: ConditionGrade | null;
};

export type WishlistCompletenessPreference = "any" | "complete_preferred" | "complete_required";
export type WishlistIntentVisibility = "private" | "public";
export type WishlistIntentStatus = "active" | "fulfilled" | "archived";

/** Owner-private acquisition preferences, never part of a network-safe intent row. */
export type WishlistIntentPrivatePreferences = {
  readonly intentId: string;
  readonly maxPurchaseBudget: Money | null;
  readonly maxTradeDistanceKm: number | null;
  readonly priority: WishlistIntentPriority;
  readonly privateNotes: string | null;
};

export type WishlistIntentPriority = 1 | 2 | 3;

const COMPLETENESS_PREFERENCES: readonly string[] = [
  "any",
  "complete_preferred",
  "complete_required",
];
const VISIBILITIES: readonly string[] = ["private", "public"];
const STATUSES: readonly string[] = ["active", "fulfilled", "archived"];

export function parseWishlistCompletenessPreference(
  value: string,
): WishlistCompletenessPreference | null {
  return COMPLETENESS_PREFERENCES.includes(value)
    ? (value as WishlistCompletenessPreference)
    : null;
}

export function parseWishlistIntentVisibility(value: string): WishlistIntentVisibility | null {
  return VISIBILITIES.includes(value) ? (value as WishlistIntentVisibility) : null;
}

export function parseWishlistIntentStatus(value: string): WishlistIntentStatus | null {
  return STATUSES.includes(value) ? (value as WishlistIntentStatus) : null;
}

export function parseWishlistIntentPriority(value: number): WishlistIntentPriority | null {
  return value === 1 || value === 2 || value === 3 ? value : null;
}
