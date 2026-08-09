import type { Tables } from "./database.types";

/**
 * The identity Geek trusts, reduced to what the application actually needs.
 *
 * Built only from a server-verified Supabase user, never from a decoded token,
 * so that no caller can mistake an unverified claim for an identity.
 */
export type AuthenticatedUser = {
  readonly id: string;
  readonly email: string | null;
};

/**
 * Geek's application representation of the signed-in user.
 *
 * Supabase Auth owns identity; `profiles` is Geek's own record, created by a
 * database trigger when the Auth user is inserted. A freshly created Profile
 * legitimately has a null username until onboarding fills it in.
 */
export type AuthenticatedProfile = Tables<"profiles">;

/**
 * A failure encountered while establishing Auth state.
 *
 * Keeps the stage and the provider's diagnostic fields so callers can tell a
 * network failure apart from a rejected token instead of seeing one opaque
 * message.
 */
export type AuthStateFailure = {
  readonly stage: "verify_user" | "load_profile";
  readonly message: string;
  readonly code: string | null;
  readonly httpStatus: number | null;
};

/**
 * Every Auth state the application can be in.
 *
 * `bootstrapping` is deliberately distinct from `unauthenticated`: on a cold
 * start a persisted session may still be restoring, and treating that as
 * signed-out would flash the logged-out application at every launch.
 *
 * `profile_missing` is an integrity state, not a workflow. The database trigger
 * is the only thing that creates a Profile, so its absence means something is
 * wrong rather than that the client should create one.
 */
export type GeekAuthState =
  | { readonly status: "bootstrapping" }
  | { readonly status: "unauthenticated" }
  | {
      readonly status: "authenticated";
      readonly user: AuthenticatedUser;
      readonly profile: AuthenticatedProfile;
    }
  | { readonly status: "profile_missing"; readonly user: AuthenticatedUser }
  | { readonly status: "error"; readonly failure: AuthStateFailure };

export const BOOTSTRAPPING_AUTH_STATE: GeekAuthState = { status: "bootstrapping" };
export const UNAUTHENTICATED_AUTH_STATE: GeekAuthState = { status: "unauthenticated" };

/** True when the caller may act as a signed-in user. */
export function isAuthenticated(
  state: GeekAuthState,
): state is Extract<GeekAuthState, { status: "authenticated" }> {
  return state.status === "authenticated";
}

/**
 * True while persisted-session restoration is still in progress.
 *
 * Callers should render neither the signed-in nor the signed-out application
 * while this holds.
 */
export function isResolvingAuth(state: GeekAuthState): boolean {
  return state.status === "bootstrapping";
}
