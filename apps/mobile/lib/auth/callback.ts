import {
  classifyAuthCallback,
  exchangeCodeForSession,
  isPasswordRecoveryExchange,
  matchesCallbackRoute,
  verifyEmailToken,
} from "@geek/supabase";
import * as Linking from "expo-linking";

import { supabase } from "../supabase";

/** Route that Auth callbacks arrive on, relative to the app's URL scheme. */
export const AUTH_CALLBACK_ROUTE = "auth/callback";

/**
 * The native Auth callback URL.
 *
 * Built from the `scheme` in `app.json`, so it resolves to `geek://auth/callback`
 * in a real build and to the development client's own URL under Expo Go. Supabase
 * must allow the value produced here; see `additional_redirect_urls` in
 * `supabase/config.toml`.
 */
export const AUTH_CALLBACK_URL: string = Linking.createURL(AUTH_CALLBACK_ROUTE);

/**
 * Outcome of handling a deep link.
 *
 * `ignored` exists because the app receives every deep link, not just Auth ones,
 * and an unrelated link must not be reported as a failed sign-in.
 */
export type AuthCallbackOutcome =
  | {
      readonly outcome: "session_established";
      /**
       * What the session is for.
       *
       * A reset link establishes a real, fully authenticated session, so it is not
       * an unauthenticated state — but the user asked to change their password and
       * has to be taken there rather than into the app. `AuthProvider` reports the
       * same thing as durable state; this is the immediate signal for whoever
       * handled the link.
       */
      readonly intent: "sign_in" | "password_recovery";
    }
  | { readonly outcome: "ignored" }
  | {
      readonly outcome: "failed";
      readonly reason: "provider_error" | "exchange_failed" | "malformed";
      /** Geek's own wording, safe to show. */
      readonly message: string;
      /** The provider's wording, for diagnostics. Not for display. */
      readonly providerMessage: string | null;
      readonly code: string | null;
    };

/**
 * Establishes a session from an Auth callback deep link.
 *
 * Query parameters come from Expo's linking parser. The route match does not,
 * because React Native's `URL` polyfill reports no path at all for a custom
 * scheme; see `matchesCallbackRoute`.
 *
 * Nothing from the URL is logged: callback parameters are single-use
 * credentials, and a log line is the easiest place to leak one.
 */
export async function handleAuthCallbackUrl(url: string): Promise<AuthCallbackOutcome> {
  if (!matchesCallbackRoute(url, AUTH_CALLBACK_ROUTE)) {
    return { outcome: "ignored" };
  }

  const params = authCallbackParams(url);
  const intent = classifyAuthCallback(params);

  switch (intent.kind) {
    case "exchange_code": {
      const { data, error } = await exchangeCodeForSession(supabase, intent.code);

      if (error !== null) {
        return {
          outcome: "failed",
          reason: "exchange_failed",
          message: "This sign-in link could not be completed. Please try signing in again.",
          providerMessage: error.message,
          code: error.code ?? null,
        };
      }

      return {
        outcome: "session_established",
        // A reset email redeems as an ordinary code, so recovery is only visible
        // in the exchange's own result rather than in the URL.
        intent: isPasswordRecoveryExchange(data) ? "password_recovery" : "sign_in",
      };
    }

    case "verify_token": {
      const { error } = await verifyEmailToken(supabase, {
        tokenHash: intent.tokenHash,
        type: intent.type,
      });

      if (error !== null) {
        return {
          outcome: "failed",
          reason: "exchange_failed",
          message: "This link could not be completed. Please request a new one.",
          providerMessage: error.message,
          code: error.code ?? null,
        };
      }

      return {
        outcome: "session_established",
        intent: intent.type === "recovery" ? "password_recovery" : "sign_in",
      };
    }

    case "provider_error":
      // The provider's wording is kept for diagnostics but not presented, since
      // it is written for developers and can leak flow details.
      return {
        outcome: "failed",
        reason: "provider_error",
        message: "This link is no longer valid. Please request a new one.",
        providerMessage: intent.description,
        code: intent.code,
      };

    case "unrecognized": {
      const accessToken = params["access_token"];
      const refreshToken = params["refresh_token"];

      if (accessToken !== undefined && refreshToken !== undefined) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (error !== null) {
          return {
            outcome: "failed",
            reason: "exchange_failed",
            message: "This sign-in link could not be completed. Please try signing in again.",
            providerMessage: error.message,
            code: error.code ?? null,
          };
        }

        return {
          outcome: "session_established",
          intent: params["type"] === "recovery" ? "password_recovery" : "sign_in",
        };
      }

      // A callback carrying nothing usable, typically a link that was already
      // consumed or truncated in transit.
      return {
        outcome: "failed",
        reason: "malformed",
        message: "This link is no longer valid. Please request a new one.",
        providerMessage: null,
        code: null,
      };
    }
  }
}

/**
 * Reads callback parameters from both query and fragment components.
 *
 * PKCE callbacks use `?code=`, while GoTrue's implicit email callback carries
 * the issued session in the fragment. Expo's parser intentionally exposes only
 * query parameters, so native fragment parameters have to be merged explicitly.
 */
function authCallbackParams(url: string): Record<string, string | undefined> {
  const params = normalizeQueryParams(Linking.parse(url).queryParams);
  const fragment = url.split("#", 2)[1];

  if (fragment === undefined || fragment === "") {
    return params;
  }

  for (const [key, value] of new URLSearchParams(fragment)) {
    // A parameter repeated between query and fragment is ambiguous. Drop it
    // rather than choosing whichever credential happened to be parsed last.
    params[key] = params[key] === undefined ? value : undefined;
  }

  return params;
}

/**
 * Reduces Expo's parsed query parameters to plain strings.
 *
 * Repeated parameters arrive as arrays; a duplicated `code` is ambiguous rather
 * than something to guess at, so those are dropped instead of taking the first
 * value.
 */
function normalizeQueryParams(
  queryParams: Linking.ParsedURL["queryParams"],
): Record<string, string | undefined> {
  const normalized: Record<string, string | undefined> = {};

  if (queryParams === null || queryParams === undefined) {
    return normalized;
  }

  for (const [key, value] of Object.entries(queryParams)) {
    if (typeof value === "string") {
      normalized[key] = value;
    }
  }

  return normalized;
}
