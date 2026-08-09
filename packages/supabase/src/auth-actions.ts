import type { EmailOtpType } from "@supabase/supabase-js";

import type { GeekSupabaseClient } from "./auth-session";

/**
 * Results are Supabase's own response shapes rather than a Geek wrapper.
 *
 * Auth failures are the one place where the provider's `message`, `code` and
 * `status` all matter to the caller — "email not confirmed" and "invalid
 * credentials" need different handling — and re-wrapping them tends to lose
 * exactly the field that was needed.
 */
export type SignUpResult = Awaited<ReturnType<GeekSupabaseClient["auth"]["signUp"]>>;
export type SignInResult = Awaited<ReturnType<GeekSupabaseClient["auth"]["signInWithPassword"]>>;
export type SignOutResult = Awaited<ReturnType<GeekSupabaseClient["auth"]["signOut"]>>;
export type PasswordResetRequestResult = Awaited<
  ReturnType<GeekSupabaseClient["auth"]["resetPasswordForEmail"]>
>;
export type UpdateUserResult = Awaited<ReturnType<GeekSupabaseClient["auth"]["updateUser"]>>;
export type VerifyOtpResult = Awaited<ReturnType<GeekSupabaseClient["auth"]["verifyOtp"]>>;
export type ExchangeCodeResult = Awaited<
  ReturnType<GeekSupabaseClient["auth"]["exchangeCodeForSession"]>
>;

export type EmailPasswordCredentials = {
  readonly email: string;
  readonly password: string;
};

/**
 * Registers a new Auth user.
 *
 * A `profiles` row is created by a database trigger on the resulting
 * `auth.users` insert, so no client-side Profile creation belongs here.
 *
 * `emailRedirectTo` must be an absolute URL that local Supabase allows; see
 * `additional_redirect_urls` in `supabase/config.toml`.
 */
export function signUpWithPassword(
  client: GeekSupabaseClient,
  credentials: EmailPasswordCredentials & { readonly emailRedirectTo?: string },
): Promise<SignUpResult> {
  return client.auth.signUp({
    email: credentials.email,
    password: credentials.password,
    options:
      credentials.emailRedirectTo === undefined
        ? undefined
        : { emailRedirectTo: credentials.emailRedirectTo },
  });
}

export function signInWithPassword(
  client: GeekSupabaseClient,
  credentials: EmailPasswordCredentials,
): Promise<SignInResult> {
  return client.auth.signInWithPassword({
    email: credentials.email,
    password: credentials.password,
  });
}

/**
 * Ends the session.
 *
 * Defaults to the local scope so signing out on one device does not revoke the
 * user's other devices, which is rarely what someone means by "sign out".
 */
export function signOut(
  client: GeekSupabaseClient,
  options?: { readonly scope?: "global" | "local" | "others" },
): Promise<SignOutResult> {
  return client.auth.signOut({ scope: options?.scope ?? "local" });
}

/**
 * Sends a password-reset email.
 *
 * `redirectTo` is where the emailed link lands, so it must be an allowed
 * redirect URL; Supabase rejects anything else and falls back to `site_url`.
 */
export function requestPasswordReset(
  client: GeekSupabaseClient,
  input: { readonly email: string; readonly redirectTo?: string },
): Promise<PasswordResetRequestResult> {
  return client.auth.resetPasswordForEmail(
    input.email,
    input.redirectTo === undefined ? undefined : { redirectTo: input.redirectTo },
  );
}

/**
 * Sets a new password for the user of the current session.
 *
 * Completing a reset therefore requires the recovery callback to have
 * established a session first; there is no separate token-carrying path.
 */
export function updateCurrentUserPassword(
  client: GeekSupabaseClient,
  input: { readonly password: string },
): Promise<UpdateUserResult> {
  return client.auth.updateUser({ password: input.password });
}

/**
 * Trades a PKCE authorization code for a session.
 *
 * Only succeeds on the client that started the flow, since the code verifier
 * lives in that client's storage.
 */
export function exchangeCodeForSession(
  client: GeekSupabaseClient,
  code: string,
): Promise<ExchangeCodeResult> {
  return client.auth.exchangeCodeForSession(code);
}

/**
 * Whether an exchanged code came from a password-reset email.
 *
 * A reset link built from the default email template arrives as an ordinary
 * `?code=`, indistinguishable from a sign-in callback by its parameters alone.
 * Supabase records the distinction when it stores the code verifier and reports
 * it back here, which is the only signal available at the callback: without it a
 * visitor who asked to reset their password is silently signed in instead.
 *
 * Read defensively because `redirectType` is part of Supabase's documented
 * response but missing from its published types.
 */
export function isPasswordRecoveryExchange(data: ExchangeCodeResult["data"]): boolean {
  return "redirectType" in data && data.redirectType === "recovery";
}

/** Redeems an emailed link's token hash (confirmation, recovery, email change). */
export function verifyEmailToken(
  client: GeekSupabaseClient,
  input: { readonly tokenHash: string; readonly type: EmailOtpType },
): Promise<VerifyOtpResult> {
  return client.auth.verifyOtp({
    token_hash: input.tokenHash,
    type: input.type,
  });
}
