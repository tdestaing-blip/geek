// Auth decisions must never be made in the browser, and this module reads
// request cookies.
import "server-only";

import type { AuthenticatedProfile, AuthenticatedUser, GeekAuthState } from "@geek/supabase";
import { resolveAuthState, resolveSafeRedirectPath } from "@geek/supabase";
import { redirect } from "next/navigation";

import { createGeekServerClient } from "../supabase/server";
import { AUTH_ROUTES } from "./routes";

/**
 * Admin is an ordinary authenticated Supabase client. It holds no elevated
 * credentials: the browser only ever has the public anon key, and every read is
 * still subject to row-level security.
 *
 * These primitives establish *authentication* only. Being signed in is not
 * grounds for administrative access, and Geek has no admin-role model yet, so
 * nothing here should be mistaken for authorization. Privileged admin
 * capabilities need an explicit role or policy plus a trusted server boundary,
 * and both are still to be designed.
 */
export async function getAuthState(): Promise<GeekAuthState> {
  const client = await createGeekServerClient();

  return resolveAuthState(client);
}

/** The verified user, or `null` when nobody is signed in. */
export async function getVerifiedUser(): Promise<AuthenticatedUser | null> {
  const state = await getAuthState();

  return state.status === "authenticated" || state.status === "profile_missing" ? state.user : null;
}

/**
 * Guarantees a verified user, redirecting to sign-in otherwise.
 *
 * Authentication only. It does not establish that the user may administer
 * anything.
 */
export async function requireAuthenticatedUser(options?: {
  readonly returnTo?: string;
}): Promise<AuthenticatedUser> {
  const user = await getVerifiedUser();

  if (user === null) {
    redirect(buildSignInPath(options?.returnTo));
  }

  return user;
}

/**
 * Guarantees a verified user whose Profile exists.
 *
 * A missing Profile is raised rather than repaired: the row is created by a
 * database trigger on the Auth user, so its absence is an integrity problem.
 */
export async function requireAuthenticatedProfile(options?: {
  readonly returnTo?: string;
}): Promise<{
  readonly user: AuthenticatedUser;
  readonly profile: AuthenticatedProfile;
}> {
  const state = await getAuthState();

  switch (state.status) {
    case "authenticated":
      return { user: state.user, profile: state.profile };

    case "profile_missing":
      throw new Error(
        `No profile row exists for authenticated user ${state.user.id}. ` +
          "Profiles are created by the create_profile_after_auth_user_insert trigger; " +
          "this indicates a database integrity problem.",
      );

    case "error":
      throw new Error(
        `Could not resolve Auth state (${state.failure.stage}): ${state.failure.message}`,
      );

    case "bootstrapping":
    case "unauthenticated":
      redirect(buildSignInPath(options?.returnTo));
  }
}

function buildSignInPath(returnTo: string | undefined): string {
  const safeReturnTo = resolveSafeRedirectPath(returnTo, AUTH_ROUTES.afterSignIn);

  if (safeReturnTo === AUTH_ROUTES.afterSignIn) {
    return AUTH_ROUTES.signIn;
  }

  return `${AUTH_ROUTES.signIn}?next=${encodeURIComponent(safeReturnTo)}`;
}
