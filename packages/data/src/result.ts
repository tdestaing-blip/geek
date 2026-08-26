import type { SupabaseApiError } from "@geek/supabase";

/**
 * What a data-layer call can end in.
 *
 * Four outcomes rather than one error type, because they call for genuinely
 * different responses and collapsing them would throw that information away:
 *
 * - `not_found` is an ordinary answer. The Edition someone linked to may simply
 *   not exist, and that is not a failure of anything.
 * - `unauthenticated` means there is nobody to answer for. Only owner-scoped
 *   reads can produce it.
 * - `invalid_data` means the database returned something the domain says is
 *   impossible, such as a Copy visibility that is neither private nor public.
 *   That is a bug in Geek, not a network problem, and must never be shown to a
 *   user as "something went wrong, try again": retrying cannot fix it.
 * - `failed` is the transient case, and it keeps the provider's own diagnostics
 *   so a caller can inspect the real cause.
 *
 * The result unions are assembled per operation so that each one admits exactly
 * the outcomes it can actually produce. A catalog read cannot be
 * `unauthenticated`, and a list cannot be `not_found` — an empty list is a
 * perfectly good answer to "show me my collection".
 */

/** A successful read or write. */
export type Ok<T> = { readonly outcome: "ok"; readonly data: T };

/** The requested entity does not exist. */
export type NotFound = { readonly outcome: "not_found" };

/** Nobody is signed in, so an owner-scoped operation has no subject. */
export type Unauthenticated = { readonly outcome: "unauthenticated" };

/** Stored data violated a domain invariant. A defect, not a transient error. */
export type InvalidData = {
  readonly outcome: "invalid_data";
  /** Where the problem was found, as `table.column`, for logs and triage. */
  readonly field: string;
  readonly message: string;
};

/** The request itself did not succeed. */
export type Failed = { readonly outcome: "failed"; readonly failure: DataFailure };

/**
 * A provider failure, preserved rather than flattened to a string.
 *
 * `source` distinguishes Auth, PostgREST, and private Storage because an
 * expired session, a rejected row, and a failed object upload lead somewhere
 * different. PostgREST fields are kept verbatim; Auth and Storage errors have
 * no equivalent of `details` or `hint` and leave them null.
 */
export type DataFailure = {
  readonly source: "auth" | "database" | "storage";
  readonly message: string;
  readonly code: string | null;
  readonly details: string | null;
  readonly hint: string | null;
};

/** A read that either works or does not. */
export type ReadResult<T> = Ok<T> | InvalidData | Failed;

/** A read of one entity, which may legitimately find nothing. */
export type EntityResult<T> = ReadResult<T> | NotFound;

/** A read of the caller's own data. */
export type OwnedResult<T> = ReadResult<T> | Unauthenticated;

/** A read of one entity belonging to the caller. */
export type OwnedEntityResult<T> = EntityResult<T> | Unauthenticated;

/**
 * Raised inside a mapper when stored data cannot become a domain model.
 *
 * Mappers throw instead of returning a result so that mapping one field of one
 * row stays a single readable expression. Every public function converts this
 * into an `invalid_data` outcome at its own boundary, so the exception never
 * escapes the data layer.
 */
export class InvalidRowError extends Error {
  public readonly field: string;

  constructor(field: string, detail: string) {
    super(`${field}: ${detail}`);
    this.name = "InvalidRowError";
    this.field = field;
  }
}

/** Wraps a mapping step, turning an invariant violation into an outcome. */
export function mapRows<T>(map: () => T): Ok<T> | InvalidData {
  try {
    return { outcome: "ok", data: map() };
  } catch (error) {
    if (error instanceof InvalidRowError) {
      return { outcome: "invalid_data", field: error.field, message: error.message };
    }

    throw error;
  }
}

/** Converts a PostgREST error into the shared failure shape. */
export function databaseFailure(error: SupabaseApiError): Failed {
  return {
    outcome: "failed",
    failure: {
      source: "database",
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    },
  };
}

/** Converts an Auth error into the shared failure shape. */
export function authFailure(error: { message: string; code?: string | null }): Failed {
  return {
    outcome: "failed",
    failure: {
      source: "auth",
      message: error.message,
      code: error.code ?? null,
      details: null,
      hint: null,
    },
  };
}

/** Converts a private Storage API failure into the shared failure shape. */
export function storageFailure(error: { message: string; statusCode?: string | number }): Failed {
  return {
    outcome: "failed",
    failure: {
      source: "storage",
      message: error.message,
      code: error.statusCode === undefined ? null : String(error.statusCode),
      details: null,
      hint: null,
    },
  };
}
