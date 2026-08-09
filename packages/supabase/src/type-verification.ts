/**
 * Compile-time proof that the generated schema flows through a typed client.
 *
 * This file has no runtime purpose: `pnpm typecheck` failing here means the
 * generated types drifted from the client surface, which is exactly the failure
 * we want to catch before any feature code depends on it. Delete or replace it
 * once real feature layers exercise these paths.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { GeekDatabase, GeekFunctionArgs, GeekFunctionReturns } from "./database";
import type { Tables } from "./database.types";

declare const client: SupabaseClient<GeekDatabase>;

/** Table selects resolve to the real row shape, with no `any` anywhere. */
export async function readCatalog(): Promise<
  Array<Pick<Tables<"games">, "id" | "canonical_title">>
> {
  const { data, error } = await client.from("games").select("id, canonical_title").limit(10);

  if (error !== null) {
    // Diagnostic fields stay available; nothing is flattened into a generic message.
    throw new Error(`${error.code}: ${error.message}`, { cause: error });
  }

  return data;
}

/** RPC arguments and return values resolve from the generated function signatures. */
export async function searchCatalog(query: string): Promise<GeekFunctionReturns<"search_catalog">> {
  const args: GeekFunctionArgs<"search_catalog"> = {
    search_query: query,
    result_limit: 20,
    result_offset: 0,
  };

  const { data, error } = await client.rpc("search_catalog", args);

  if (error !== null) {
    throw new Error(`${error.code}: ${error.message}`, { cause: error });
  }

  return data;
}

/** Mutating RPCs are equally typed; this one returns the new TradeOffer id. */
export async function createTradeOffer(
  args: GeekFunctionArgs<"create_trade_offer">,
): Promise<GeekFunctionReturns<"create_trade_offer">> {
  const { data, error } = await client.rpc("create_trade_offer", args);

  if (error !== null) {
    throw new Error(`${error.code}: ${error.message}`, { cause: error });
  }

  return data;
}
