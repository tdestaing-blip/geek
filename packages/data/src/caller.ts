import type { GeekSupabaseClient } from "@geek/supabase";

import type { Failed, Unauthenticated } from "./result";
import { authFailure } from "./result";

/** Who the request is being made as. */
export type Caller = { readonly outcome: "ok"; readonly userId: string };

/**
 * Resolves the caller's own identity.
 *
 * Owner-scoped reads establish whose data to fetch here rather than accepting
 * an owner id from their caller. That is a deliberate constraint on the API:
 * `getMyCollection(client)` cannot be pointed at another collector, so no
 * screen, however careless, can turn it into a way to browse someone else's
 * shelf. Row-level security enforces the same rule in the database, but an API
 * that cannot express the wrong request is a better boundary than one that can
 * and is refused.
 *
 * Identity comes from `getUser()`, which validates the token against the Auth
 * server, matching how the Auth layer establishes identity everywhere else.
 * That costs one round trip per call; verifying claims locally is a worthwhile
 * optimisation later, but not at the price of two different notions of who the
 * caller is.
 */
export async function resolveCaller(
  client: GeekSupabaseClient,
): Promise<Caller | Unauthenticated | Failed> {
  const { data, error } = await client.auth.getUser();

  if (error !== null) {
    // No session, an expired one, or a token the Auth server rejected: all of
    // them mean the same thing to a data read.
    if (isMissingSessionError(error)) {
      return { outcome: "unauthenticated" };
    }

    return authFailure(error);
  }

  if (data.user === null) {
    return { outcome: "unauthenticated" };
  }

  return { outcome: "ok", userId: data.user.id };
}

function isMissingSessionError(error: {
  name?: string;
  code?: string | null;
  status?: number;
}): boolean {
  return (
    error.name === "AuthSessionMissingError" ||
    error.code === "session_not_found" ||
    error.status === 401
  );
}
