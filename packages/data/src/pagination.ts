/**
 * Every list in this layer is paginated, and none of them can be asked for
 * everything.
 *
 * A collection can reach thousands of Copies and the catalog is unbounded, so
 * an API that quietly fetched all rows would work in development and fall over
 * on the first serious collector. PostgREST would cap such a request at its own
 * `max_rows` anyway, silently truncating the answer, which is worse than a
 * bounded API because the caller cannot tell.
 */

/** One page of results, and the window it came from. */
export type Page<T> = {
  readonly items: readonly T[];
  readonly limit: number;
  readonly offset: number;
};

/** How much to read, and from where. */
export type PageRequest = {
  readonly limit?: number;
  readonly offset?: number;
};

/**
 * Resolves a page request against the bounds a particular API allows.
 *
 * Out-of-range values throw rather than being clamped. A caller asking for 500
 * rows has a bug: silently handing back 50 would hide it, and the difference
 * only surfaces much later as a page of missing data. This is not a runtime
 * data condition and so is not one of the result outcomes — it cannot happen
 * unless application code passes the wrong number.
 */
export function resolvePage(
  request: PageRequest | undefined,
  bounds: { readonly defaultLimit: number; readonly maxLimit: number },
): { readonly limit: number; readonly offset: number } {
  const limit = request?.limit ?? bounds.defaultLimit;
  const offset = request?.offset ?? 0;

  if (!Number.isInteger(limit) || limit < 1 || limit > bounds.maxLimit) {
    throw new RangeError(`limit must be an integer between 1 and ${bounds.maxLimit}, got ${limit}`);
  }

  if (!Number.isInteger(offset) || offset < 0) {
    throw new RangeError(`offset must be an integer of at least 0, got ${offset}`);
  }

  return { limit, offset };
}

/** The inclusive row range PostgREST expects for a window. */
export function toRange(limit: number, offset: number): { from: number; to: number } {
  return { from: offset, to: offset + limit - 1 };
}
