/**
 * Mobile Auth actions.
 *
 * Screens call these instead of touching Supabase, so the callback URL and the
 * client instance are decided in one place rather than at each call site.
 */
import type {
  EmailPasswordCredentials,
  PasswordResetRequestResult,
  SignInResult,
  SignOutResult,
  SignUpResult,
  UpdateUserResult,
} from "@geek/supabase";
import {
  requestPasswordReset as requestPasswordResetForClient,
  signInWithPassword as signInWithPasswordForClient,
  signOut as signOutForClient,
  signUpWithPassword as signUpWithPasswordForClient,
  updateCurrentUserPassword as updateCurrentUserPasswordForClient,
} from "@geek/supabase";

import { supabase } from "../supabase";
import { AUTH_CALLBACK_URL } from "./callback";

export function signUpWithPassword(credentials: EmailPasswordCredentials): Promise<SignUpResult> {
  return signUpWithPasswordForClient(supabase, {
    ...credentials,
    emailRedirectTo: AUTH_CALLBACK_URL,
  });
}

export function signInWithPassword(credentials: EmailPasswordCredentials): Promise<SignInResult> {
  return signInWithPasswordForClient(supabase, credentials);
}

export function signOut(): Promise<SignOutResult> {
  return signOutForClient(supabase);
}

export function requestPasswordReset(email: string): Promise<PasswordResetRequestResult> {
  return requestPasswordResetForClient(supabase, {
    email,
    redirectTo: AUTH_CALLBACK_URL,
  });
}

/**
 * Sets a new password.
 *
 * Requires the recovery deep link to have established a session first, which is
 * what `PASSWORD_RECOVERY` in the Auth subscription indicates.
 */
export function updatePassword(password: string): Promise<UpdateUserResult> {
  return updateCurrentUserPasswordForClient(supabase, { password });
}
