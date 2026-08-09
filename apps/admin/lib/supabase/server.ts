import type { GeekDatabase } from "@geek/supabase";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { supabaseEnvironment } from "../environment";

/**
 * Supabase client for server components, route handlers and server actions.
 *
 * A new client is created per request because it is bound to that request's
 * cookies; it must never be hoisted into a module-level singleton. Server
 * components cannot set cookies, so writes are ignored there and the refreshed
 * session is persisted by whichever route handler or action runs next.
 *
 * Admin uses the same anon-key boundary as every other client and relies on the
 * signed-in operator's own privileges. Privileged operations must go through a
 * trusted server boundary when they are designed; a service-role key must never
 * reach this app.
 */
export async function createGeekServerClient() {
  const cookieStore = await cookies();

  return createServerClient<GeekDatabase>(supabaseEnvironment.url, supabaseEnvironment.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a server component, where cookies are read-only.
        }
      },
    },
  });
}
