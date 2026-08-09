import type { Database } from "./database.types";

/**
 * The schema every Geek Supabase client is parameterised with.
 *
 * Clients should be typed through this alias rather than importing the
 * generated `Database` directly, so a future schema-scoping change stays in one
 * place.
 */
export type GeekDatabase = Database;

type PublicFunctions = Database["public"]["Functions"];

/** Argument type of a database function, by name. */
export type GeekFunctionArgs<Name extends keyof PublicFunctions> = PublicFunctions[Name]["Args"];

/** Return type of a database function, by name. */
export type GeekFunctionReturns<Name extends keyof PublicFunctions> =
  PublicFunctions[Name]["Returns"];
