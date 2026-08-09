import { resolveSupabaseEnvironment } from "@geek/supabase";
import type { SupabaseEnvironment } from "@geek/supabase";

/**
 * Expo inlines `process.env.EXPO_PUBLIC_*` at build time only when it can see
 * the property access literally, so these two reads must stay written out
 * exactly like this. Everything else about configuration is shared.
 */
export const supabaseEnvironment: SupabaseEnvironment = resolveSupabaseEnvironment({
  url: process.env.EXPO_PUBLIC_SUPABASE_URL,
  anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  urlVariableName: "EXPO_PUBLIC_SUPABASE_URL",
  anonKeyVariableName: "EXPO_PUBLIC_SUPABASE_ANON_KEY",
});
