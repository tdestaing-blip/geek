// Server-only: this is used to build the URLs Supabase puts in Auth emails, and
// nothing in the browser should be choosing that origin.
import "server-only";

import { resolveAppOrigin } from "@geek/supabase";

/**
 * The origin Geek's own Auth emails point back at.
 *
 * Configured rather than read from the request, because the request's host is
 * attacker-supplied; see `resolveAppOrigin`. Not a secret — it is the address
 * users already type — so it needs no protection beyond being trustworthy.
 *
 * Defaults to the local development origin, which is also what
 * `supabase/config.toml` allows. Hosted environments have to set the variable;
 * there is deliberately no guess for a domain that does not exist yet.
 */
export const APP_ORIGIN: string = resolveAppOrigin({
  value: process.env.APP_ORIGIN,
  variableName: "APP_ORIGIN",
  fallbackOrigin: "http://127.0.0.1:3000",
});
