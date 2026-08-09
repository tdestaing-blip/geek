import type { GeekDatabase } from "@geek/supabase";
import { createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { supabaseEnvironment } from "./lib/environment";

/**
 * Keeps Supabase Auth cookies fresh.
 *
 * Named `proxy` rather than `middleware` because Next.js 16 deprecated the
 * middleware file convention in favour of this one.
 *
 * Server components cannot write cookies, so without this a refreshed session
 * would be discarded on every page render and the user would be signed out as
 * soon as the access token expired.
 *
 * This is deliberately *only* session maintenance. It makes no authorization
 * decision: requests can reach route handlers and server components in ways that
 * do not pass through here, so anything protected verifies the user itself via
 * `lib/auth/server.ts`.
 */
export default async function proxy(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const client = createServerClient<GeekDatabase>(
    supabaseEnvironment.url,
    supabaseEnvironment.anonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Refreshed cookies have to land on both the forwarded request (so the
          // rest of this request sees the new session) and the outgoing response
          // (so the browser keeps it).
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }

          response = NextResponse.next({ request });

          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // The call itself is the point: validating the user is what triggers a refresh
  // and the resulting `setAll`. The result is intentionally unused here, because
  // authorization belongs at the boundary that serves the data.
  await client.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    /**
     * Everything except static assets, images and the Auth callback.
     *
     * Refreshing a session while serving a bundle file wastes a request to the
     * Auth server on something that has no session to maintain.
     *
     * The Auth callback is excluded because refreshing there is actively harmful:
     * a visitor arriving with a new authorization code may still be carrying a
     * dead session, and failing to refresh it makes Supabase discard that
     * session's stored state — including the PKCE code verifier the callback is
     * about to need. The callback would then fail with a missing verifier on a
     * perfectly good code. It has no session to maintain either way, since
     * redeeming the code is what creates one.
     */
    "/((?!_next/static|_next/image|favicon.ico|auth/callback|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)",
  ],
};
