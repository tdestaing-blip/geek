/**
 * Auth route paths for the admin app.
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
  afterSignIn: "/",
  authError: "/sign-in?error=auth_callback",
} as const;
