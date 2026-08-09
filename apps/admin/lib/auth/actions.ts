"use server";

import type { EmailPasswordCredentials } from "@geek/supabase";
import {
  requestPasswordReset as requestPasswordResetForClient,
  signInWithPassword as signInWithPasswordForClient,
  signOut as signOutForClient,
  signUpWithPassword as signUpWithPasswordForClient,
  updateCurrentUserPassword,
} from "@geek/supabase";
import { revalidatePath } from "next/cache";

import { createGeekServerClient } from "../supabase/server";
import { APP_ORIGIN } from "./app-origin";
import { AUTH_ROUTES } from "./routes";

/**
 * Server actions, so the session cookie is written on the server response and
 * the next server render already sees the new session.
 *
 * Supabase returns error class instances, which do not cross the server-action
 * boundary. This shape keeps the two fields a caller actually needs to
 * distinguish cases such as wrong password from unconfirmed email, instead of
 * flattening every failure into one message.
 */
export type AuthActionOutcome =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly message: string;
      readonly code: string | null;
    };

/**
 * Absolute callback URL for emailed links.
 *
 * Built from the configured application origin and never from the request, so
 * that someone requesting a password reset cannot use a spoofed `Host` header to
 * aim the victim's link at a host they control.
 */
const CALLBACK_URL = `${APP_ORIGIN}${AUTH_ROUTES.callback}`;

export async function signIn(credentials: EmailPasswordCredentials): Promise<AuthActionOutcome> {
  const client = await createGeekServerClient();
  const { error } = await signInWithPasswordForClient(client, credentials);

  if (error !== null) {
    return { ok: false, message: error.message, code: error.code ?? null };
  }

  // Cached renders were produced for a signed-out visitor.
  revalidatePath("/", "layout");

  return { ok: true };
}

export async function signUp(credentials: EmailPasswordCredentials): Promise<AuthActionOutcome> {
  const client = await createGeekServerClient();
  const { error } = await signUpWithPasswordForClient(client, {
    ...credentials,
    emailRedirectTo: CALLBACK_URL,
  });

  if (error !== null) {
    return { ok: false, message: error.message, code: error.code ?? null };
  }

  revalidatePath("/", "layout");

  return { ok: true };
}

export async function signOut(): Promise<AuthActionOutcome> {
  const client = await createGeekServerClient();
  const { error } = await signOutForClient(client);

  if (error !== null) {
    return { ok: false, message: error.message, code: error.code ?? null };
  }

  revalidatePath("/", "layout");

  return { ok: true };
}

export async function requestPasswordReset(email: string): Promise<AuthActionOutcome> {
  const client = await createGeekServerClient();
  const { error } = await requestPasswordResetForClient(client, {
    email,
    redirectTo: CALLBACK_URL,
  });

  if (error !== null) {
    return { ok: false, message: error.message, code: error.code ?? null };
  }

  return { ok: true };
}

/**
 * Sets a new password for the current session.
 *
 * Reachable only after the recovery callback has established a session, so the
 * proof of identity is that session rather than anything passed in here.
 */
export async function updatePassword(password: string): Promise<AuthActionOutcome> {
  const client = await createGeekServerClient();
  const { error } = await updateCurrentUserPassword(client, { password });

  if (error !== null) {
    return { ok: false, message: error.message, code: error.code ?? null };
  }

  return { ok: true };
}
