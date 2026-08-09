/**
 * Auth route paths, in one place so the callback route, the redirect
 * configuration and the protection primitives cannot drift apart.
 *
 * The sign-in and password-update pages do not exist yet; they arrive with the
 * real Auth UI. Protection primitives already point at them so that adding the
 * pages needs no changes here.
 */
export const AUTH_ROUTES = {
  /** PKCE code exchange and emailed-link redemption. */
  callback: "/auth/callback",
  signIn: "/sign-in",
  updatePassword: "/account/password",
  /** Where a successful sign-in lands when no return path was supplied. */
  afterSignIn: "/",
  /** Where a failed or malformed callback lands. */
  authError: "/sign-in?error=auth_callback",
} as const;
