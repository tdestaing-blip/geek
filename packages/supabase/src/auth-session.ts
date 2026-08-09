import type { SupabaseClient } from "@supabase/supabase-js";

import type { GeekDatabase } from "./database";
import type { AuthenticatedProfile, AuthenticatedUser, GeekAuthState } from "./auth-state";
import { UNAUTHENTICATED_AUTH_STATE } from "./auth-state";

export type GeekSupabaseClient = SupabaseClient<GeekDatabase>;

/**
 * Result of looking up the signed-in user's own Profile.
 *
 * `missing` is separate from `failed` because they demand different responses:
 * a missing row is a data-integrity problem to surface, while a failure is
 * usually transient and worth retrying.
 */
export type OwnProfileResult =
  | { readonly outcome: "loaded"; readonly profile: AuthenticatedProfile }
  | { readonly outcome: "missing" }
  | {
      readonly outcome: "failed";
      readonly message: string;
      readonly code: string | null;
    };

/**
 * Loads exactly the signed-in user's own Profile.
 *
 * Filtered by the caller's own id rather than fetching broadly, even though
 * `profiles` is intentionally world-readable, so this cannot become a way to
 * read someone else's row. Row-level security still applies; nothing here
 * bypasses it.
 *
 * Uses `maybeSingle` so an absent row arrives as `missing` rather than as an
 * error that would be indistinguishable from a real failure.
 */
export async function loadOwnProfile(
  client: GeekSupabaseClient,
  userId: string,
): Promise<OwnProfileResult> {
  const { data, error } = await client.from("profiles").select("*").eq("id", userId).maybeSingle();

  if (error !== null) {
    return { outcome: "failed", message: error.message, code: error.code };
  }

  if (data === null) {
    return { outcome: "missing" };
  }

  return { outcome: "loaded", profile: data };
}

/**
 * Resolves the full Auth state from whatever session the client currently holds.
 *
 * Identity always comes from `getUser()`, which validates against the Auth
 * server, rather than from the session's own user field. On a server that
 * distinction is the difference between an identity and an unverified cookie;
 * doing it the same way everywhere keeps one code path.
 *
 * Returns `unauthenticated` for a missing session rather than an error, since
 * "nobody is signed in" is a normal state and not a failure.
 */
export async function resolveAuthState(client: GeekSupabaseClient): Promise<GeekAuthState> {
  const { data, error } = await client.auth.getUser();

  if (error !== null) {
    // A missing or expired session is the ordinary signed-out case.
    if (isMissingSessionError(error)) {
      return UNAUTHENTICATED_AUTH_STATE;
    }

    return {
      status: "error",
      failure: {
        stage: "verify_user",
        message: error.message,
        code: error.code ?? null,
        httpStatus: error.status ?? null,
      },
    };
  }

  if (data.user === null) {
    return UNAUTHENTICATED_AUTH_STATE;
  }

  const user: AuthenticatedUser = {
    id: data.user.id,
    email: data.user.email ?? null,
  };

  const profileResult = await loadOwnProfile(client, user.id);

  switch (profileResult.outcome) {
    case "loaded":
      return { status: "authenticated", user, profile: profileResult.profile };
    case "missing":
      return { status: "profile_missing", user };
    case "failed":
      return {
        status: "error",
        failure: {
          stage: "load_profile",
          message: profileResult.message,
          code: profileResult.code,
          httpStatus: null,
        },
      };
  }
}

/**
 * Distinguishes "no session" from a genuine verification failure.
 *
 * Supabase reports the absent-session case as an ordinary error, so without
 * this check every signed-out visitor would surface as an Auth error.
 */
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
