import { resolveSupabaseEnvironment } from "@geek/supabase";
import type { SupabaseEnvironment } from "@geek/supabase";

/**
 * Next.js inlines `process.env.NEXT_PUBLIC_*` into the browser bundle only when
 * it can see the property access literally, so these two reads must stay
 * written out exactly like this. Everything else about configuration is shared.
 */
export const supabaseEnvironment: SupabaseEnvironment = resolveSupabaseEnvironment({
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  urlVariableName: "NEXT_PUBLIC_SUPABASE_URL",
  anonKeyVariableName: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
});
