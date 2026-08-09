import {
  classifyAuthCallback,
  exchangeCodeForSession,
  isPasswordRecoveryExchange,
  resolvePostAuthDestination,
  resolveSafeRedirectPath,
  verifyEmailToken,
} from "@geek/supabase";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { AUTH_ROUTES } from "../../../lib/auth/routes";
import { createGeekServerClient } from "../../../lib/supabase/server";

/**
 * Auth callback for the web app.
 *
 * Every entry point that establishes a session lands here: PKCE code exchange
 * after sign-in, and emailed links for confirmation, recovery and email change.
 *
 * Redirects are always to a path resolved against this request's own origin, and
 * the caller-supplied `next` is validated to be an internal path first. Together
 * those stop the callback from being usable as an open redirect, which would
 * otherwise let an attacker authenticate a visitor on Geek and land them on a
 * site they control.
 *
 * Callback parameters are single-use credentials and are never logged, echoed
 * into a redirect, or included in an error message.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const params = Object.fromEntries(request.nextUrl.searchParams);
  const intent = classifyAuthCallback(params);

  const destination = resolveSafeRedirectPath(
    request.nextUrl.searchParams.get("next"),
    AUTH_ROUTES.afterSignIn,
  );

  switch (intent.kind) {
    case "exchange_code": {
      const client = await createGeekServerClient();
      const { data, error } = await exchangeCodeForSession(client, intent.code);

      if (error !== null) {
        return redirectTo(request, AUTH_ROUTES.authError);
      }

      // A reset email redeems as an ordinary code, so the recovery case is only
      // visible in the exchange's own result rather than in the URL.
      return redirectTo(
        request,
        resolvePostAuthDestination({
          isPasswordRecovery: isPasswordRecoveryExchange(data),
          signedInPath: destination,
          updatePasswordPath: AUTH_ROUTES.updatePassword,
        }),
      );
    }

    case "verify_token": {
      const client = await createGeekServerClient();
      const { error } = await verifyEmailToken(client, {
        tokenHash: intent.tokenHash,
        type: intent.type,
      });

      if (error !== null) {
        return redirectTo(request, AUTH_ROUTES.authError);
      }

      // Retained for templates customised to send a token hash; the default
      // template goes through the code exchange above.
      return redirectTo(
        request,
        resolvePostAuthDestination({
          isPasswordRecovery: intent.type === "recovery",
          signedInPath: destination,
          updatePasswordPath: AUTH_ROUTES.updatePassword,
        }),
      );
    }

    case "provider_error":
    case "unrecognized":
      // Expired, already-consumed and malformed links are all dead ends; the
      // sign-in page explains the situation without repeating the provider's
      // wording back to the visitor.
      return redirectTo(request, AUTH_ROUTES.authError);
  }
}

/**
 * Redirects to an internal path.
 *
 * Resolved against the incoming request's origin so the destination cannot leave
 * this deployment.
 */
function redirectTo(request: NextRequest, path: string): NextResponse {
  return NextResponse.redirect(new URL(path, request.nextUrl.origin));
}
