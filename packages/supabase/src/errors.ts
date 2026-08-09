/**
 * Raised when required runtime configuration is missing or malformed.
 *
 * Configuration problems are developer or deployment problems, not Supabase
 * API problems, so they are distinguishable from `PostgrestError`.
 */
export class SupabaseConfigurationError extends Error {
  public readonly variableName: string;

  constructor(variableName: string, reason: string) {
    super(`${variableName} ${reason}`);
    this.name = "SupabaseConfigurationError";
    this.variableName = variableName;
  }
}

/**
 * The error shape PostgREST and RPC calls return.
 *
 * Declared structurally so callers can narrow a `SupabaseClient` error without
 * losing the diagnostic fields Supabase provides.
 */
export type SupabaseApiError = {
  message: string;
  code: string;
  details: string | null;
  hint: string | null;
};

export function isSupabaseApiError(value: unknown): value is SupabaseApiError {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.message === "string" &&
    typeof candidate.code === "string" &&
    (typeof candidate.details === "string" || candidate.details === null) &&
    (typeof candidate.hint === "string" || candidate.hint === null)
  );
}
