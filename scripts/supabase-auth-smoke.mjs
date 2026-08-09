/**
 * Auth and session smoke test for Geek's Supabase infrastructure.
 *
 * Exercises the flows the client foundations depend on, against the local stack:
 * signup and the Profile-creating trigger, sign-in, verified identity, own
 * Profile access, wrong-password rejection, sign-out, persisted-session
 * restoration, Profile row-level security, password reset end to end, and the
 * callback/redirect validation logic.
 *
 * The redirect and callback checks import `packages/supabase/src/auth-callback.ts`
 * directly, so they test the code the apps actually run rather than a copy of it.
 * That needs Node's type stripping, which is why the `db:smoke:auth` script
 * passes `--experimental-strip-types`; the flag is a no-op on newer Node.
 *
 * Configuration comes from the environment, or from `supabase status` when the
 * environment is empty, so no key is ever hardcoded here.
 *
 * Nothing secret is printed. The final check re-reads everything this script
 * emitted and fails if a password or token appears in it.
 *
 * Usage: pnpm db:smoke:auth
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import process from "node:process";

import { createClient } from "@supabase/supabase-js";

import {
  exchangeCodeForSession,
  isPasswordRecoveryExchange,
} from "../packages/supabase/src/auth-actions.ts";
import {
  classifyAuthCallback,
  matchesCallbackRoute,
  resolveAppOrigin,
  resolvePostAuthDestination,
  resolveSafeRedirectPath,
} from "../packages/supabase/src/auth-callback.ts";

// Taken from `globalThis` because the repository's lint setup does not declare
// Node's runtime globals, the same reason `process` is imported above.
const { fetch, URL } = globalThis;

const MAILPIT_URL = "http://127.0.0.1:54324";
// The web app's local origin, and the one callback route Supabase is configured to
// allow for it.
const APP_ORIGIN = "http://127.0.0.1:3000";
const WEB_CALLBACK_URL = `${APP_ORIGIN}/auth/callback`;

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
const emitted = [];

function emit(line) {
  emitted.push(line);
  process.stdout.write(line);
}

function record(name, passed, detail) {
  results.push({ name, passed, skipped: false });
  emit(`${passed ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}\n`);
}

function skip(name, reason) {
  results.push({ name, passed: true, skipped: true });
  emit(`SKIP  ${name} — ${reason}\n`);
}

/**
 * A client shaped like the mobile one: plain supabase-js, PKCE, and a storage
 * adapter standing in for AsyncStorage so persistence can be inspected.
 */
function createNativeLikeClient(environment, storage) {
  return createClient(environment.url, environment.anonKey, {
    auth: {
      storage: {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => void storage.set(key, value),
        removeItem: (key) => void storage.delete(key),
      },
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      flowType: "pkce",
    },
  });
}

const environment = readEnvironment();
emit(`Configuration source: ${environment.source}\n`);
emit(`Supabase URL: ${environment.url}\n\n`);

// Credentials exist only for this run and are never printed.
const runId = randomUUID();
const primaryEmail = `geek-auth-smoke-${runId}@example.com`;
const secondaryEmail = `geek-auth-smoke-other-${runId}@example.com`;
const password = `Pw-${randomUUID()}`;
const rotatedPassword = `Pw2-${randomUUID()}`;

// ---------------------------------------------------------------------------
// Callback and redirect validation (pure, no network)
// ---------------------------------------------------------------------------

// The origin `resolveSafeRedirectPath` validates against internally. Results are
// re-resolved against both this and a real app origin below, because the property
// that matters is about the returned string, not the argument.
const INTERNAL_ORIGIN = "http://redirect.invalid";
const REDIRECT_FALLBACK = "/";

const redirectCases = [
  { input: "/collection", expected: "/collection", note: "internal path kept" },
  {
    input: "/collection?tab=owned#top",
    expected: "/collection?tab=owned#top",
    note: "query and hash kept",
  },
  { input: null, expected: REDIRECT_FALLBACK, note: "missing value falls back" },
  { input: "", expected: REDIRECT_FALLBACK, note: "empty value falls back" },
  {
    input: "https://evil.example/steal",
    expected: REDIRECT_FALLBACK,
    note: "absolute URL rejected",
  },
  {
    input: "//evil.example/steal",
    expected: REDIRECT_FALLBACK,
    note: "protocol-relative rejected",
  },
  { input: "///evil.example", expected: REDIRECT_FALLBACK, note: "three-slash form rejected" },
  { input: "/\\evil.example", expected: REDIRECT_FALLBACK, note: "backslash rejected" },
  { input: "/\\\\evil.example", expected: REDIRECT_FALLBACK, note: "double backslash rejected" },
  { input: "\\/evil.example", expected: REDIRECT_FALLBACK, note: "leading backslash rejected" },
  // These are the cases the previous version of this check missed: each one looks
  // internal, and URL normalisation turns it into `//evil.example`, which a
  // browser reads as another origin.
  { input: "/..//evil.example", expected: REDIRECT_FALLBACK, note: "traversal to authority" },
  { input: "/..///evil.example", expected: REDIRECT_FALLBACK, note: "traversal, three slashes" },
  { input: "/%2e%2e//evil.example", expected: REDIRECT_FALLBACK, note: "encoded traversal" },
  {
    input: "/a/b/../../..//evil.example",
    expected: REDIRECT_FALLBACK,
    note: "deep traversal to authority",
  },
  {
    input: "/..//evil.example?next=/ok#f",
    expected: REDIRECT_FALLBACK,
    note: "traversal with query and hash",
  },
  {
    input: "/path\nSet-Cookie: x=1",
    expected: REDIRECT_FALLBACK,
    note: "control characters rejected",
  },
  {
    input: "javascript:alert(1)",
    expected: REDIRECT_FALLBACK,
    note: "scheme without slash rejected",
  },
  {
    input: "/redirect?to=https://evil.example",
    expected: "/redirect?to=https://evil.example",
    note: "internal path with absolute query kept",
  },
];

const redirectFailures = redirectCases.filter(
  (testCase) => resolveSafeRedirectPath(testCase.input, REDIRECT_FALLBACK) !== testCase.expected,
);

record(
  "post-auth redirect targets are constrained to internal paths",
  redirectFailures.length === 0,
  redirectFailures.length === 0
    ? `${redirectCases.length} cases`
    : `failed: ${redirectFailures.map((testCase) => testCase.note).join(", ")}`,
);

/**
 * The invariant, rather than a list of payloads.
 *
 * Checking that specific hostile inputs fall back is not enough: the previous
 * version of this file did exactly that and still certified a boundary that
 * returned `//evil.example`. What has to hold is that *every* value the function
 * returns still resolves to the application's own origin. Inputs are generated by
 * combining the pieces an attacker actually uses, so a future rewrite cannot pass
 * by special-casing the cases listed above.
 */
const redirectFragments = [
  "/",
  "//",
  "\\",
  "..",
  ".",
  "%2e%2e",
  "%2f",
  "evil.example",
  "a",
  "?q",
  "#h",
  "%5c",
  ":",
  "@",
  "\t",
  "",
];

const generatedRedirectInputs = [];

for (const first of redirectFragments) {
  for (const second of redirectFragments) {
    for (const third of redirectFragments) {
      for (const fourth of redirectFragments) {
        generatedRedirectInputs.push(`${first}${second}${third}${fourth}`);
      }
    }
  }
}

const escapedOrigin = [];

for (const input of [...generatedRedirectInputs, ...redirectCases.map((each) => each.input)]) {
  for (const fallback of [REDIRECT_FALLBACK, "/collection", "/sign-in?error=auth_callback"]) {
    const result = resolveSafeRedirectPath(input, fallback);

    if (
      new URL(result, INTERNAL_ORIGIN).origin !== INTERNAL_ORIGIN ||
      new URL(result, APP_ORIGIN).origin !== APP_ORIGIN
    ) {
      escapedOrigin.push(input);
    }
  }
}

record(
  "every resolved redirect destination stays on the application origin",
  escapedOrigin.length === 0,
  escapedOrigin.length === 0
    ? `${generatedRedirectInputs.length + redirectCases.length} inputs re-resolved against both origins`
    : `${escapedOrigin.length} escaped, first: ${JSON.stringify(escapedOrigin[0])}`,
);

// ---------------------------------------------------------------------------
// Configured application origin
// ---------------------------------------------------------------------------

const originCases = [
  { value: undefined, expected: APP_ORIGIN, note: "unset falls back to the local origin" },
  { value: "", expected: APP_ORIGIN, note: "empty falls back" },
  { value: "http://127.0.0.1:3001", expected: "http://127.0.0.1:3001", note: "admin origin" },
  { value: "https://geek.example/", expected: "https://geek.example", note: "trailing slash" },
];

const originAccepted = originCases.filter(
  (testCase) =>
    resolveAppOrigin({
      value: testCase.value,
      variableName: "APP_ORIGIN",
      fallbackOrigin: APP_ORIGIN,
    }) !== testCase.expected,
);

record(
  "a configured application origin is normalised to an origin",
  originAccepted.length === 0,
  originAccepted.length === 0
    ? `${originCases.length} cases`
    : `failed: ${originAccepted.map((testCase) => testCase.note).join(", ")}`,
);

// A spoofed `Host` header reaches the application as any of these shapes. None of
// them may be accepted as the origin that Auth emails are built from.
const hostileOrigins = [
  "evil.example",
  "127.0.0.1:3000.evil.example/",
  "//evil.example",
  "javascript:alert(1)",
  "http://127.0.0.1:3000/path",
  "http://127.0.0.1:3000?next=x",
  "http://127.0.0.1:3000#f",
  "http://evil.example@127.0.0.1:3000",
  "ftp://evil.example",
  " ",
];

const acceptedHostileOrigins = hostileOrigins.filter((value) => {
  try {
    const resolved = resolveAppOrigin({
      value,
      variableName: "APP_ORIGIN",
      fallbackOrigin: APP_ORIGIN,
    });

    // A rejected value must not resolve to anything other than the known origin.
    return resolved !== APP_ORIGIN;
  } catch {
    return false;
  }
});

record(
  "a hostile origin value cannot become the Auth email origin",
  acceptedHostileOrigins.length === 0,
  acceptedHostileOrigins.length === 0
    ? `${hostileOrigins.length} values rejected or ignored`
    : `accepted: ${acceptedHostileOrigins.join(", ")}`,
);

const callbackCases = [
  { params: { code: "abc" }, expected: "exchange_code" },
  { params: { token_hash: "abc", type: "recovery" }, expected: "verify_token" },
  { params: { token_hash: "abc", type: "not_a_type" }, expected: "unrecognized" },
  { params: { error: "access_denied", error_description: "nope" }, expected: "provider_error" },
  { params: { error_code: "otp_expired", code: "abc" }, expected: "provider_error" },
  { params: {}, expected: "unrecognized" },
  { params: { access_token: "abc", refresh_token: "def" }, expected: "unrecognized" },
];

const callbackFailures = callbackCases.filter(
  (testCase) => classifyAuthCallback(testCase.params).kind !== testCase.expected,
);

record(
  "callback parameters classify explicitly, including errors and malformed links",
  callbackFailures.length === 0,
  callbackFailures.length === 0
    ? `${callbackCases.length} cases`
    : `failed: ${callbackFailures.map((testCase) => testCase.expected).join(", ")}`,
);

// Deep-link route matching. The `geek://auth/callback` form is what
// `Linking.createURL("auth/callback")` produces in a real build, and the `exp://`
// form is what a development client produces.
const routeCases = [
  { url: "geek://auth/callback", expected: true },
  { url: "geek://auth/callback?code=abc", expected: true },
  { url: "geek:///auth/callback?code=abc", expected: true },
  { url: "geek://auth/callback/?code=abc", expected: true },
  { url: "exp://192.168.1.5:8081/--/auth/callback?code=abc", expected: true },
  { url: "http://127.0.0.1:3000/auth/callback?code=abc", expected: true },
  { url: "geek://listing/123", expected: false },
  { url: "geek://xauth/callback", expected: false },
  { url: "geek://callback", expected: false },
  { url: "geek://auth", expected: false },
];

const routeFailures = routeCases.filter(
  (testCase) => matchesCallbackRoute(testCase.url, "auth/callback") !== testCase.expected,
);

record(
  "deep-link callback route is recognised across schemes and rejects other links",
  routeFailures.length === 0,
  routeFailures.length === 0
    ? `${routeCases.length} cases`
    : `failed: ${routeFailures.map((testCase) => testCase.url).join(", ")}`,
);

// ---------------------------------------------------------------------------
// Signup and the Profile-creating trigger
// ---------------------------------------------------------------------------

const primaryStorage = new Map();
const primaryClient = createNativeLikeClient(environment, primaryStorage);

const signUp = await primaryClient.auth.signUp({ email: primaryEmail, password });

record(
  "signup creates an Auth user",
  signUp.error === null && signUp.data.user !== null,
  signUp.error?.message ?? `user id ${signUp.data?.user?.id ? "assigned" : "missing"}`,
);

const signedUpUserId = signUp.data?.user?.id ?? null;

const triggeredProfile =
  signedUpUserId === null
    ? null
    : await primaryClient.from("profiles").select("*").eq("id", signedUpUserId).maybeSingle();

record(
  "database trigger created the matching Profile",
  triggeredProfile !== null &&
    triggeredProfile.error === null &&
    triggeredProfile.data !== null &&
    triggeredProfile.data.id === signedUpUserId,
  triggeredProfile?.error?.message ??
    (triggeredProfile?.data === null ? "no profile row" : "profile id matches auth user id"),
);

record(
  "new Profile starts without a username, as the trigger inserts id only",
  triggeredProfile?.data?.username === null,
  `username is ${JSON.stringify(triggeredProfile?.data?.username ?? null)}`,
);

// ---------------------------------------------------------------------------
// Sign-out clears the session
// ---------------------------------------------------------------------------

await primaryClient.auth.signOut({ scope: "local" });
const afterSignOut = await primaryClient.auth.getSession();

record(
  "sign-out clears the session",
  afterSignOut.data.session === null,
  afterSignOut.data.session === null ? "no session" : "session still present",
);

record(
  "sign-out clears persisted session storage",
  [...primaryStorage.keys()].every((key) => !key.includes("auth-token")),
  `${primaryStorage.size} key(s) remaining`,
);

// ---------------------------------------------------------------------------
// Wrong password
// ---------------------------------------------------------------------------

const wrongPassword = await primaryClient.auth.signInWithPassword({
  email: primaryEmail,
  password: `${password}-wrong`,
});

record(
  "wrong password is rejected",
  wrongPassword.error !== null && wrongPassword.data.session === null,
  wrongPassword.error?.code ?? "unexpectedly signed in",
);

const afterWrongPassword = await primaryClient.auth.getUser();

record(
  "a rejected sign-in leaves no authenticated state",
  afterWrongPassword.data.user === null,
  afterWrongPassword.data.user === null ? "still anonymous" : "unexpectedly authenticated",
);

// ---------------------------------------------------------------------------
// Valid sign-in, verified identity, own Profile
// ---------------------------------------------------------------------------

const signIn = await primaryClient.auth.signInWithPassword({ email: primaryEmail, password });

record(
  "valid sign-in creates a session",
  signIn.error === null && signIn.data.session !== null,
  signIn.error?.message ?? "session established",
);

const verifiedUser = await primaryClient.auth.getUser();

record(
  "verified user resolves against the Auth server",
  verifiedUser.error === null && verifiedUser.data.user?.id === signedUpUserId,
  verifiedUser.error?.message ?? "verified id matches the signed-up user",
);

const ownProfile = await primaryClient
  .from("profiles")
  .select("*")
  .eq("id", verifiedUser.data.user?.id ?? "")
  .maybeSingle();

record(
  "authenticated user can read their own Profile",
  ownProfile.error === null && ownProfile.data?.id === signedUpUserId,
  ownProfile.error?.message ?? "own profile loaded",
);

// ---------------------------------------------------------------------------
// Persisted session restoration
// ---------------------------------------------------------------------------

// A second client over the same storage stands in for a cold app launch reading
// AsyncStorage.
const restoredClient = createNativeLikeClient(environment, primaryStorage);
const restoredSession = await restoredClient.auth.getSession();

record(
  "a new client restores the persisted session from storage",
  restoredSession.data.session !== null,
  restoredSession.data.session === null ? "no session restored" : "session restored",
);

const restoredUser = await restoredClient.auth.getUser();

record(
  "restored session yields the same verified user",
  restoredUser.error === null && restoredUser.data.user?.id === signedUpUserId,
  restoredUser.error?.message ?? "verified id matches",
);

// ---------------------------------------------------------------------------
// Profile row-level security
// ---------------------------------------------------------------------------

const secondaryStorage = new Map();
const secondaryClient = createNativeLikeClient(environment, secondaryStorage);
const secondarySignUp = await secondaryClient.auth.signUp({
  email: secondaryEmail,
  password,
});
const secondaryUserId = secondarySignUp.data?.user?.id ?? null;

record(
  "a second user can be created for isolation checks",
  secondarySignUp.error === null && secondaryUserId !== null,
  secondarySignUp.error?.message ?? "created",
);

const crossUserUpdate = await primaryClient
  .from("profiles")
  .update({ display_name: "not allowed" })
  .eq("id", secondaryUserId ?? "")
  .select();

record(
  "a user cannot modify another user's Profile",
  crossUserUpdate.error !== null || (crossUserUpdate.data?.length ?? 0) === 0,
  crossUserUpdate.error?.code ?? `${crossUserUpdate.data?.length ?? 0} row(s) changed`,
);

const ownUpdate = await primaryClient
  .from("profiles")
  .update({ display_name: "Smoke Test" })
  .eq("id", signedUpUserId ?? "")
  .select();

record(
  "a user can modify their own Profile",
  ownUpdate.error === null && (ownUpdate.data?.length ?? 0) === 1,
  ownUpdate.error?.message ?? "1 row changed",
);

const anonymousClient = createNativeLikeClient(environment, new Map());
const anonymousProfileUpdate = await anonymousClient
  .from("profiles")
  .update({ display_name: "anonymous" })
  .eq("id", signedUpUserId ?? "")
  .select();

record(
  "anonymous requests cannot modify a Profile",
  anonymousProfileUpdate.error !== null || (anonymousProfileUpdate.data?.length ?? 0) === 0,
  anonymousProfileUpdate.error?.code ??
    `${anonymousProfileUpdate.data?.length ?? 0} row(s) changed`,
);

const anonymousPrivateRead = await anonymousClient
  .from("copy_private_details")
  .select("copy_id")
  .limit(1);

record(
  "anonymous access to a private surface stays denied",
  anonymousPrivateRead.error !== null,
  anonymousPrivateRead.error?.code ?? "unexpectedly returned data",
);

// ---------------------------------------------------------------------------
// Password reset, end to end through the local mail server
// ---------------------------------------------------------------------------

// The reset is requested by a client of its own, standing in for a signed-out
// visitor on the sign-in page. This matters for more than realism: PKCE stores the
// code verifier in the requesting client's storage, so only that client can redeem
// the emailed code.
const recoveryStorage = new Map();
const recoveryClient = createNativeLikeClient(environment, recoveryStorage);

// Auth events observed during the exchange. The mobile provider learns that a
// session came from a reset link from this event and nothing else, so the flow is
// only wired correctly if Supabase really emits it here.
const recoveryEvents = [];
const recoveryEventSubscription = recoveryClient.auth.onAuthStateChange((event) => {
  recoveryEvents.push(event);
});

// Single-use credentials, kept so the final scan can prove they were not printed.
let deliveredRecoveryToken = null;
let deliveredAuthCode = null;

const resetRequest = await recoveryClient.auth.resetPasswordForEmail(primaryEmail, {
  redirectTo: WEB_CALLBACK_URL,
});

if (resetRequest.error !== null) {
  // The local Auth server allows two emails per hour, so repeated runs within
  // the hour cannot send another.
  skip("password reset request accepted", `Auth server declined: ${resetRequest.error.code}`);
  skip("emailed reset link redirects to the app callback", "no reset email was sent");
  skip("the delivered reset link arrives as a PKCE code exchange", "no reset email was sent");
  skip("the delivered reset code exchanges into a session", "no reset email was sent");
  skip("the exchange reports password recovery", "no reset email was sent");
  skip("Supabase emits PASSWORD_RECOVERY for the exchange", "no reset email was sent");
  skip("recovery callbacks route to the password-update page", "no reset email was sent");
  skip("the recovery session is authenticated as the requesting user", "no reset email was sent");
  skip("password can be changed after reset", "no reset email was sent");
  skip("sign-in works with the new password", "no reset email was sent");
} else {
  record("password reset request accepted", true, `redirect ${WEB_CALLBACK_URL}`);

  deliveredRecoveryToken = await findDeliveredResetLink(primaryEmail);

  if (deliveredRecoveryToken === null) {
    const reason = "reset email not found in local mail server";
    skip("emailed reset link redirects to the app callback", reason);
    skip("the delivered reset link arrives as a PKCE code exchange", reason);
    skip("the delivered reset code exchanges into a session", reason);
    skip("the exchange reports password recovery", reason);
    skip("Supabase emits PASSWORD_RECOVERY for the exchange", reason);
    skip("recovery callbacks route to the password-update page", reason);
    skip("the recovery session is authenticated as the requesting user", reason);
    skip("password can be changed after reset", reason);
    skip("sign-in works with the new password", reason);
  } else {
    // Follow the emailed link the way a browser would, but stop at the redirect so
    // the callback URL the Auth server produces can be inspected. This is the step
    // that was previously skipped by calling verifyOtp directly, which hid the fact
    // that the default email template arrives as a code rather than a token hash.
    const callbackUrl = await followVerifyRedirect(deliveredRecoveryToken);

    record(
      "emailed reset link redirects to the app callback",
      callbackUrl !== null && callbackUrl.startsWith(`${WEB_CALLBACK_URL}?`),
      callbackUrl === null
        ? "no redirect from the verify endpoint"
        : `redirected to ${new URL(callbackUrl).pathname}`,
    );

    // Classified by the same function the web, admin and mobile callbacks use.
    const deliveredIntent =
      callbackUrl === null
        ? { kind: "unrecognized" }
        : classifyAuthCallback(Object.fromEntries(new URL(callbackUrl).searchParams.entries()));

    record(
      "the delivered reset link arrives as a PKCE code exchange",
      deliveredIntent.kind === "exchange_code",
      `classified as ${deliveredIntent.kind}`,
    );

    if (deliveredIntent.kind !== "exchange_code") {
      const reason = `delivered callback classified as ${deliveredIntent.kind}`;
      skip("the delivered reset code exchanges into a session", reason);
      skip("the exchange reports password recovery", reason);
      skip("Supabase emits PASSWORD_RECOVERY for the exchange", reason);
      skip("recovery callbacks route to the password-update page", reason);
      skip("the recovery session is authenticated as the requesting user", reason);
      skip("password can be changed after reset", reason);
      skip("sign-in works with the new password", reason);
    } else {
      deliveredAuthCode = deliveredIntent.code;

      const exchange = await exchangeCodeForSession(recoveryClient, deliveredIntent.code);

      record(
        "the delivered reset code exchanges into a session",
        exchange.error === null && exchange.data.session !== null,
        exchange.error?.message ?? "recovery session established",
      );

      const isRecovery = isPasswordRecoveryExchange(exchange.data);

      record(
        "the exchange reports password recovery",
        isRecovery,
        isRecovery
          ? "recovery intent survives the exchange"
          : "recovery intent lost; the visitor would be silently signed in",
      );

      record(
        "Supabase emits PASSWORD_RECOVERY for the exchange",
        recoveryEvents.includes("PASSWORD_RECOVERY"),
        `events: ${recoveryEvents.join(", ")}`,
      );

      // The decision both the web and admin callback routes make, exercised with
      // the value a real delivered reset link produced.
      const recoveryDestination = resolvePostAuthDestination({
        isPasswordRecovery: isRecovery,
        signedInPath: "/collection",
        updatePasswordPath: "/account/password",
      });
      const normalDestination = resolvePostAuthDestination({
        isPasswordRecovery: false,
        signedInPath: "/collection",
        updatePasswordPath: "/account/password",
      });

      record(
        "recovery callbacks route to the password-update page",
        recoveryDestination === "/account/password" && normalDestination === "/collection",
        `recovery -> ${recoveryDestination}, normal -> ${normalDestination}`,
      );

      const recoveredUser = await recoveryClient.auth.getUser();

      record(
        "the recovery session is authenticated as the requesting user",
        recoveredUser.error === null && recoveredUser.data.user?.id === signedUpUserId,
        recoveredUser.error?.message ?? "verified id matches, and is not unauthenticated",
      );

      const passwordUpdate = await recoveryClient.auth.updateUser({ password: rotatedPassword });

      record(
        "password can be changed after reset",
        passwordUpdate.error === null,
        passwordUpdate.error?.message ?? "password updated",
      );

      const rotatedSignIn = await createNativeLikeClient(
        environment,
        new Map(),
      ).auth.signInWithPassword({ email: primaryEmail, password: rotatedPassword });

      record(
        "sign-in works with the new password",
        rotatedSignIn.error === null && rotatedSignIn.data.session !== null,
        rotatedSignIn.error?.message ?? "signed in",
      );
    }
  }
}

recoveryEventSubscription.data.subscription.unsubscribe();

/**
 * Returns the reset link exactly as delivered, from the local mail server.
 *
 * The link carries a single-use credential, so it is returned to the caller and
 * never printed.
 */
async function findDeliveredResetLink(email) {
  try {
    const listResponse = await fetch(`${MAILPIT_URL}/api/v1/messages?limit=30`);

    if (!listResponse.ok) {
      return null;
    }

    const list = await listResponse.json();
    const message = (list.messages ?? []).find((candidate) =>
      (candidate.To ?? []).some((recipient) => recipient.Address === email),
    );

    if (message === undefined) {
      return null;
    }

    const detailResponse = await fetch(`${MAILPIT_URL}/api/v1/message/${message.ID}`);

    if (!detailResponse.ok) {
      return null;
    }

    const detail = await detailResponse.json();
    const body = `${detail.Text ?? ""}\n${detail.HTML ?? ""}`.replaceAll("&amp;", "&");
    const match = /https?:\/\/[^\s"'<>]*[?&]token=[^\s"'<>]+/.exec(body);

    return match?.[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Follows the emailed link one hop, as a browser would, and returns where the
 * Auth server sends the visitor next.
 *
 * Stopping at the redirect is the point: this is where the default email template
 * turns a recovery token into whatever the application callback actually receives.
 */
async function followVerifyRedirect(verifyUrl) {
  try {
    const response = await fetch(verifyUrl, { redirect: "manual" });
    const location = response.headers.get("location");

    return location === null || location === "" ? null : location;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Nothing secret was logged
// ---------------------------------------------------------------------------

const transcript = emitted.join("");
const secrets = [
  ["password", password],
  ["rotated password", rotatedPassword],
  ["access token", signIn.data?.session?.access_token],
  ["refresh token", signIn.data?.session?.refresh_token],
  ["recovery link", deliveredRecoveryToken],
  ["authorization code", deliveredAuthCode],
].filter(([, value]) => typeof value === "string" && value.length > 0);

const leaked = secrets.filter(([, value]) => transcript.includes(value));

record(
  "no password or token appears in this script's output",
  leaked.length === 0,
  leaked.length === 0
    ? `${secrets.length} value(s) checked`
    : `leaked: ${leaked.map(([name]) => name).join(", ")}`,
);

const failed = results.filter((result) => !result.passed);
const skipped = results.filter((result) => result.skipped);

emit(
  `\n${results.length - failed.length - skipped.length}/${results.length} checks passed` +
    `${skipped.length > 0 ? `, ${skipped.length} skipped` : ""}\n`,
);

process.exitCode = failed.length === 0 ? 0 : 1;
