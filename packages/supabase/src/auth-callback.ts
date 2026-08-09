/**
 * Callback, redirect and origin rules, shared by all three clients.
 *
 * Deliberately free of runtime imports from this package. Until the repository
 * has a test runner, `scripts/supabase-auth-smoke.mjs` loads this file directly
 * through Node's type stripping, which cannot resolve extensionless relative
 * specifiers — so adding one here would quietly stop the redirect and callback
 * rules from being tested against the code the apps run.
 */
import type { EmailOtpType } from "@supabase/supabase-js";

/**
 * Base used only to resolve relative paths. Never navigated to; the hostname is
 * in the reserved `.invalid` TLD so a leak could not reach a real origin.
 */
const INTERNAL_ORIGIN = "http://redirect.invalid";

/** Email link types Geek accepts on an Auth callback. */
const SUPPORTED_EMAIL_OTP_TYPES = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
] as const;

type SupportedEmailOtpType = (typeof SUPPORTED_EMAIL_OTP_TYPES)[number];

/** Last-resort destination, used when even the caller's fallback is not internal. */
const ROOT_PATH = "/";

/**
 * Constrains a post-authentication destination to an internal application path.
 *
 * Auth callbacks carry an attacker-influenceable return destination, so an
 * unchecked value here is an open redirect: a link that authenticates on Geek
 * and lands on a lookalike site. Anything that is not plainly an internal path
 * falls back rather than being repaired, because a partially sanitised URL is
 * the usual source of bypasses.
 *
 * The guarantee is about the returned value, not the argument: every string this
 * returns resolves back to `INTERNAL_ORIGIN`. The fallback is held to the same
 * rule, so the guarantee holds for every possible result.
 */
export function resolveSafeRedirectPath(
  candidate: string | null | undefined,
  fallbackPath: string,
): string {
  return toInternalPath(candidate) ?? toInternalPath(fallbackPath) ?? ROOT_PATH;
}

/**
 * Returns `value` as an internal path, or `null` if it cannot be one.
 *
 * Checking the input is not sufficient, because URL resolution rewrites it:
 * `/..//host` normalises to the pathname `//host`, which passes every
 * input-shaped check and every check on the parsed URL — whose origin is still
 * internal — yet is read as another origin once serialised back into a string
 * and resolved by a browser. So the decisive test is applied to the output.
 */
function toInternalPath(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  // Must be site-root-relative. Backslashes, control characters and whitespace
  // are the standard tools for smuggling an authority past a prefix check.
  if (!value.startsWith("/")) {
    return null;
  }

  if (/[\\\s]/.test(value) || containsControlCharacter(value)) {
    return null;
  }

  let resolved: URL;

  try {
    resolved = new URL(value, INTERNAL_ORIGIN);
  } catch {
    return null;
  }

  // Rejected rather than reduced to its path, so that `//host` falls back to the
  // caller's destination instead of silently becoming the site root.
  if (resolved.origin !== INTERNAL_ORIGIN) {
    return null;
  }

  const path = `${resolved.pathname}${resolved.search}${resolved.hash}`;

  return isInternalPath(path) ? path : null;
}

/**
 * The invariant every returned destination has to satisfy: resolving it against
 * the application's own origin must stay on that origin.
 */
function isInternalPath(path: string): boolean {
  if (!path.startsWith("/") || path.startsWith("//")) {
    return false;
  }

  try {
    return new URL(path, INTERNAL_ORIGIN).origin === INTERNAL_ORIGIN;
  } catch {
    return false;
  }
}

/**
 * Validates the application's own origin, used to build the absolute URLs that
 * go into Auth emails.
 *
 * Those URLs must not be derived from the request: `Host` and its forwarded
 * variants are supplied by whoever made the request, so a reset link built from
 * them can be pointed at another host by the person requesting it. Supabase's
 * redirect allow-list refuses such a target today, but that is one config change
 * away from being the only thing standing between a spoofed header and an
 * account takeover, so the origin comes from configuration instead.
 *
 * Required to be a bare origin. A value carrying a path, query or fragment would
 * silently produce a callback URL that no longer matches the allow-list, and
 * misconfiguration is worth a clear failure at startup rather than links that
 * quietly stop working.
 */
export function resolveAppOrigin(input: {
  /** Configured value, typically from the environment. */
  readonly value: string | undefined;
  /** Reported when the value is rejected. */
  readonly variableName: string;
  /** Used when nothing is configured; the app's known local development origin. */
  readonly fallbackOrigin: string;
}): string {
  const configured = input.value?.trim();
  const candidate =
    configured === undefined || configured === "" ? input.fallbackOrigin : configured;

  const reject = (reason: string): never => {
    throw new Error(`${input.variableName} ${reason}`);
  };

  let url: URL;

  try {
    url = new URL(candidate);
  } catch {
    return reject("must be an absolute URL, such as https://geek.example.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return reject("must use http or https.");
  }

  if (url.pathname !== "/" || url.search !== "" || url.hash !== "") {
    return reject("must be an origin only, without a path, query or fragment.");
  }

  if (url.username !== "" || url.password !== "") {
    return reject("must not contain credentials.");
  }

  return url.origin;
}

/**
 * Chooses where a callback lands once a session exists.
 *
 * Shared so the web and admin callbacks cannot drift on the one decision that
 * distinguishes finishing a password reset from an ordinary sign-in. A recovery
 * link only proves control of the mailbox, so it has to lead to setting a new
 * password rather than into the application, whatever `next` asked for.
 */
export function resolvePostAuthDestination(input: {
  readonly isPasswordRecovery: boolean;
  readonly signedInPath: string;
  readonly updatePasswordPath: string;
}): string {
  return input.isPasswordRecovery ? input.updatePasswordPath : input.signedInPath;
}

/**
 * Tests whether a URL addresses a callback route, by comparing path segments
 * from the end.
 *
 * Deliberately string-based rather than parser-based. React Native's `URL`
 * polyfill only recognises `http`/`https` authorities, so for a custom scheme
 * such as `geek://auth/callback` it reports an empty path, while WHATWG parsers
 * read `auth` as the host and `/callback` as the path. Neither view is usable on
 * its own, and comparing trailing segments gives the same answer everywhere.
 *
 * Matching from the end also tolerates the prefixes development tooling inserts,
 * such as Expo's `exp://host:8081/--/auth/callback`.
 */
export function matchesCallbackRoute(url: string, routePath: string): boolean {
  const beforeQueryOrFragment = url.split(/[?#]/)[0] ?? "";
  const expected = toSegments(routePath);
  const actual = toSegments(beforeQueryOrFragment);

  if (expected.length === 0 || actual.length < expected.length) {
    return false;
  }

  const offset = actual.length - expected.length;

  return expected.every((segment, index) => actual[offset + index] === segment);
}

function toSegments(value: string): string[] {
  return value.split("/").filter((segment) => segment.length > 0);
}

/** Callback query parameters, already extracted by the platform's URL parser. */
export type AuthCallbackParams = Readonly<Record<string, string | undefined>>;

/**
 * What an Auth callback is asking the application to do.
 *
 * Explicit rather than inferred at each call site so that an unrecognised or
 * failed callback is handled deliberately instead of silently redirecting a
 * visitor who was never signed in.
 */
export type AuthCallbackIntent =
  | { readonly kind: "exchange_code"; readonly code: string }
  | {
      readonly kind: "verify_token";
      readonly tokenHash: string;
      readonly type: EmailOtpType;
    }
  | {
      readonly kind: "provider_error";
      readonly code: string | null;
      readonly description: string | null;
    }
  | { readonly kind: "unrecognized" };

/**
 * Classifies an Auth callback's parameters into a single intended action.
 *
 * Errors are checked first: Supabase reports an expired or already-consumed
 * link alongside the original parameters, and acting on those would turn a
 * failed callback into a silent no-op.
 *
 * Only the code and token-hash flows are accepted. Geek's clients all use PKCE,
 * so tokens should never arrive in a callback URL, and accepting them here
 * would mean trusting a session handed over in a link.
 */
export function classifyAuthCallback(params: AuthCallbackParams): AuthCallbackIntent {
  const errorCode = params["error_code"] ?? params["error"] ?? null;

  if (errorCode !== null && errorCode !== "") {
    return {
      kind: "provider_error",
      code: errorCode,
      description: params["error_description"] ?? null,
    };
  }

  const code = params["code"];

  if (code !== undefined && code !== "") {
    return { kind: "exchange_code", code };
  }

  const tokenHash = params["token_hash"];
  const type = params["type"];

  if (
    tokenHash !== undefined &&
    tokenHash !== "" &&
    type !== undefined &&
    isSupportedEmailOtpType(type)
  ) {
    return { kind: "verify_token", tokenHash, type };
  }

  return { kind: "unrecognized" };
}

/**
 * Detects C0 controls and DEL.
 *
 * Written as a scan rather than a character class because a regular expression
 * containing literal control characters is itself easy to get wrong.
 */
function containsControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codePoint = value.charCodeAt(index);

    if (codePoint <= 0x1f || codePoint === 0x7f) {
      return true;
    }
  }

  return false;
}

function isSupportedEmailOtpType(value: string): value is SupportedEmailOtpType {
  return SUPPORTED_EMAIL_OTP_TYPES.some((supported) => supported === value);
}
