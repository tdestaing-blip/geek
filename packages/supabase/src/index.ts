/**
 * Supabase infrastructure types and conventions shared by every Geek client.
 *
 * These are infrastructure types, not canonical domain types. Per ADR 0001,
 * Geek's domain model stays conceptually independent from Supabase, so
 * `packages/domain` must not depend on the generated schema. Feature layers may
 * map these rows onto domain models later where that is worth doing.
 */
export type {
  CompositeTypes,
  Database,
  Enums,
  Json,
  Tables,
  TablesInsert,
  TablesUpdate,
} from "./database.types";

export type { GeekDatabase, GeekFunctionArgs, GeekFunctionReturns } from "./database";

export type { SupabaseEnvironment, SupabaseEnvironmentInput } from "./environment";
export { resolveSupabaseEnvironment } from "./environment";

export type { SupabaseApiError } from "./errors";
export { isSupabaseApiError, SupabaseConfigurationError } from "./errors";
