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
  readonly editionId: string;
  readonly ownerId: string;
  readonly visibility: CopyVisibility;
  readonly tradeAvailability: CopyTradeAvailability;
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
 * Whether the owner has opened this Copy to trade offers.
 *
 * Independent of visibility, and independent of any actual TradeOffer: this is
 * discoverability intent, not a commitment.
 */
export type CopyTradeAvailability = "not_open" | "open_to_trade";

const COPY_VISIBILITIES: readonly string[] = ["private", "public"];
const COPY_TRADE_AVAILABILITIES: readonly string[] = ["not_open", "open_to_trade"];

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

/** Narrows a stored trade-availability value, returning `null` for anything unknown. */
export function parseCopyTradeAvailability(value: string): CopyTradeAvailability | null {
  return COPY_TRADE_AVAILABILITIES.includes(value) ? (value as CopyTradeAvailability) : null;
}
