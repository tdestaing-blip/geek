import type { CalendarDate, Money } from "../values";

/**
 * What one owner privately recorded about a Copy.
 *
 * This is deliberately a separate type from `Copy`, not a set of optional
 * fields on it. Making a Copy public exposes the Copy; it must never expose
 * what someone paid for it or where they keep it, and the cleanest guarantee of
 * that is that the two never share a shape.
 *
 * The data belongs to the owner who wrote it rather than to the object, so it
 * is keyed by both. After a trade the previous owner keeps their own record and
 * the new owner starts with none.
 */
export type CopyPrivateDetails = {
  readonly copyId: string;
  readonly ownerId: string;
  readonly acquiredAt: CalendarDate | null;
  /** What this owner paid. Never an estimate of what the Copy is worth. */
  readonly purchasePrice: Money | null;
  readonly provenance: string | null;
  readonly privateNotes: string | null;
  readonly storageLocation: string | null;
};
