"use client";

import type { GeekDatabase } from "@geek/supabase";
import { createBrowserClient } from "@supabase/ssr";

import { supabaseEnvironment } from "../environment";

/**
 * Supabase client for client components.
 *
 * `createBrowserClient` stores the session in cookies rather than local storage
 * so the server client can read the same session. It memoises internally, so
 * calling this per component is safe.
 */
export function createGeekBrowserClient() {
  return createBrowserClient<GeekDatabase>(supabaseEnvironment.url, supabaseEnvironment.anonKey);
}
