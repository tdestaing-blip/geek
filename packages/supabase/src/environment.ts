import { SupabaseConfigurationError } from "./errors";

/**
 * The public configuration every Geek client needs to reach Supabase.
 *
 * Both values are public by design. The anon key is safe to ship in a client
 * bundle; access control comes from Auth and row-level security, never from
 * keeping this key hidden.
 */
export type SupabaseEnvironment = {
  readonly url: string;
  readonly anonKey: string;
};

export type SupabaseEnvironmentInput = {
  readonly url: string | undefined;
  readonly anonKey: string | undefined;
  /** Platform-specific variable names, used to make failures actionable. */
  readonly urlVariableName: string;
  readonly anonKeyVariableName: string;
};

/**
 * Validates public Supabase configuration and fails loudly when it is unusable.
 *
 * Each platform reads its own environment variables so bundlers can inline them
 * statically, then hands the raw values here for one shared set of rules. A
 * missing variable therefore surfaces as a named configuration error at startup
 * instead of an opaque network failure on the first query.
 */
export function resolveSupabaseEnvironment(input: SupabaseEnvironmentInput): SupabaseEnvironment {
  const url = requireValue(input.url, input.urlVariableName);
  const anonKey = requireValue(input.anonKey, input.anonKeyVariableName);

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(url);
  } catch {
    throw new SupabaseConfigurationError(
      input.urlVariableName,
      `must be an absolute URL, received "${url}".`,
    );
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new SupabaseConfigurationError(
      input.urlVariableName,
      `must use http or https, received "${parsedUrl.protocol}".`,
    );
  }

  return { url, anonKey };
}

function requireValue(value: string | undefined, variableName: string): string {
  if (value === undefined || value.trim() === "") {
    throw new SupabaseConfigurationError(
      variableName,
      "is required but was not set. Copy .env.example to .env.local and fill in the values printed by `pnpm db:status`.",
    );
  }

  return value.trim();
}
