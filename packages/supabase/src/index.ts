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

export type {
  AuthenticatedProfile,
  AuthenticatedUser,
  AuthStateFailure,
  GeekAuthState,
} from "./auth-state";
export {
  BOOTSTRAPPING_AUTH_STATE,
  isAuthenticated,
  isResolvingAuth,
  UNAUTHENTICATED_AUTH_STATE,
} from "./auth-state";

export type { GeekSupabaseClient, OwnProfileResult } from "./auth-session";
export { loadOwnProfile, resolveAuthState } from "./auth-session";

export type {
  EmailPasswordCredentials,
  ExchangeCodeResult,
  PasswordResetRequestResult,
  SignInResult,
  SignOutResult,
  SignUpResult,
  UpdateUserResult,
  VerifyOtpResult,
} from "./auth-actions";
export {
  exchangeCodeForSession,
  isPasswordRecoveryExchange,
  requestPasswordReset,
  signInWithPassword,
  signOut,
  signUpWithPassword,
  updateCurrentUserPassword,
  verifyEmailToken,
} from "./auth-actions";

export type { AuthCallbackIntent, AuthCallbackParams } from "./auth-callback";
export {
  classifyAuthCallback,
  matchesCallbackRoute,
  resolveAppOrigin,
  resolvePostAuthDestination,
  resolveSafeRedirectPath,
} from "./auth-callback";
