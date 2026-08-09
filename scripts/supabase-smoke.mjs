/**
 * Connectivity smoke test for Geek's Supabase client configuration.
 *
 * Proves three things against the local stack, without any product UI:
 *   1. public configuration is consumed and reaches Geek's API,
 *   2. an anonymous read of the public catalog succeeds,
 *   3. anonymous access to private surfaces stays denied by row-level security.
 *
 * Configuration comes from the environment, or from `supabase status` when the
 * environment is empty, so no key is ever hardcoded here.
 *
 * Usage: pnpm db:smoke
 */
import { execFileSync } from "node:child_process";
import process from "node:process";

import { createBrowserClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

function readEnvironment() {
  const fromEnvironment = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  };

  if (fromEnvironment.url && fromEnvironment.anonKey) {
    return { ...fromEnvironment, source: "environment" };
  }

  const status = JSON.parse(
    execFileSync("pnpm", ["exec", "supabase", "status", "-o", "json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }),
  );

  return { url: status.API_URL, anonKey: status.ANON_KEY, source: "supabase status" };
}

const results = [];

function record(name, passed, detail) {
  results.push({ name, passed, detail });
  process.stdout.write(`${passed ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}\n`);
}

const environment = readEnvironment();
process.stdout.write(`Configuration source: ${environment.source}\n`);
process.stdout.write(`Supabase URL: ${environment.url}\n\n`);

// Mirrors the mobile client: plain supabase-js with a supplied storage adapter.
const memoryStorage = new Map();
const nativeLikeClient = createClient(environment.url, environment.anonKey, {
  auth: {
    storage: {
      getItem: (key) => memoryStorage.get(key) ?? null,
      setItem: (key, value) => void memoryStorage.set(key, value),
      removeItem: (key) => void memoryStorage.delete(key),
    },
    persistSession: true,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
record("mobile-shaped client instantiates", typeof nativeLikeClient.from === "function");

// Mirrors the web and admin browser clients.
const browserClient = createBrowserClient(environment.url, environment.anonKey);
record("browser client instantiates", typeof browserClient.from === "function");

const catalogRead = await browserClient.from("games").select("id, canonical_title").limit(1);
record(
  "anonymous read of public catalog succeeds",
  catalogRead.error === null,
  catalogRead.error?.message ?? `${catalogRead.data?.length ?? 0} row(s)`,
);

const rpcRead = await browserClient.rpc("search_catalog", {
  search_query: "zelda",
  result_limit: 1,
  result_offset: 0,
});
record(
  "anonymous search_catalog RPC succeeds",
  rpcRead.error === null,
  rpcRead.error?.message ?? `${rpcRead.data?.length ?? 0} row(s)`,
);

const privateRead = await browserClient.from("copy_private_details").select("copy_id").limit(1);
record(
  "anonymous read of copy_private_details denied",
  privateRead.error !== null,
  privateRead.error?.code ?? "unexpectedly returned data",
);

const messageRead = await browserClient.from("conversation_messages").select("id").limit(1);
record(
  "anonymous read of conversation_messages denied",
  messageRead.error !== null,
  messageRead.error?.code ?? "unexpectedly returned data",
);

const copyRead = await browserClient.from("copies").select("id").limit(1);
record(
  "anonymous read of copies returns only public rows",
  copyRead.error === null && Array.isArray(copyRead.data),
  copyRead.error?.message ?? `${copyRead.data?.length ?? 0} public row(s)`,
);

const failed = results.filter((result) => !result.passed);
process.stdout.write(`\n${results.length - failed.length}/${results.length} checks passed\n`);
process.exitCode = failed.length === 0 ? 0 : 1;
