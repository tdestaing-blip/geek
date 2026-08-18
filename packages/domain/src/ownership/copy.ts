/**
 * A Copy is one physical object owned by one person.
 *
 * This model holds only what is safe to see when its owner makes the Copy
 * public. Everything the owner recorded privately about it lives in
 * `CopyPrivateDetails`, in a separate type, so a public surface cannot reach
 * private data by accident.
 */
export type Copy = {
  readonly id: string;
  readonly gameId: string;
  readonly editionId: string | null;
  readonly ownerId: string;
  readonly visibility: CopyVisibility;
  readonly availability: CopyAvailability;
  readonly createdAt: string;
};

/**
 * Whether the Copy appears in its owner's public collection.
 *
 * Visibility is not availability. A public Copy is not for sale or trade, and a
 * private Copy can still be open to trade.
 */
export type CopyVisibility = "private" | "public";

/**
 * The owner's one transaction-intent mode for this Copy.
 *
 * Independent of visibility and separate from the system's commercial
 * commitment. Listing and Auction modes are relationship-driven.
 */
export type CopyAvailability = "private" | "open_to_trade" | "for_sale" | "in_auction";

const COPY_VISIBILITIES: readonly string[] = ["private", "public"];
const COPY_AVAILABILITIES: readonly string[] = [
  "private",
  "open_to_trade",
  "for_sale",
  "in_auction",
];

/**
 * Narrows a stored visibility value, returning `null` for anything unknown.
 *
 * The database constrains this column with a CHECK, but the generated types
 * still describe it as `string`. An unrecognised value has to stop here: a Copy
 * whose visibility cannot be established must not reach a surface that decides
 * what to show, where defaulting either way is a privacy or correctness bug.
 */
export function parseCopyVisibility(value: string): CopyVisibility | null {
  return COPY_VISIBILITIES.includes(value) ? (value as CopyVisibility) : null;
}

/** Narrows a stored availability value, returning `null` for anything unknown. */
export function parseCopyAvailability(value: string): CopyAvailability | null {
  return COPY_AVAILABILITIES.includes(value) ? (value as CopyAvailability) : null;
}
