import type { GeekAuthState } from "@geek/supabase";
import {
  BOOTSTRAPPING_AUTH_STATE,
  resolveAuthState,
  UNAUTHENTICATED_AUTH_STATE,
} from "@geek/supabase";
import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

import { supabase } from "../supabase";
import { useAuthDeepLinks } from "./use-auth-deep-links";

type AuthContextValue = {
  readonly state: GeekAuthState;
  /**
   * Whether the current session came from a password-reset link.
   *
   * Kept beside `state` rather than inside it because it is not a different kind
   * of authentication: the user is genuinely signed in, and additionally owes the
   * app a new password. Navigation will use this to send them to the
   * password-update screen instead of into the application.
   *
   * Cleared by signing out, and by the user update that sets the new password.
   */
  readonly passwordRecoveryRequested: boolean;
  /** Whether an initial or foreground Auth callback is still being resolved. */
  readonly callbackResolutionPending: boolean;
  /**
   * Re-resolves Auth state.
   *
   * The recovery action for the `error` and `profile_missing` states, which no
   * Auth event would otherwise retry.
   */
  readonly reload: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const AUTH_RESOLUTION_TIMEOUT_MS = 10_000;

/**
 * Owns the app's Auth state.
 *
 * A single provider rather than a hook per consumer, so there is one Supabase
 * subscription and one bootstrap regardless of how many screens observe Auth.
 * React state is sufficient here; nothing about this needs a state-management
 * library.
 */
export function AuthProvider({ children }: { readonly children: ReactNode }) {
  const [state, setState] = useState<GeekAuthState>(BOOTSTRAPPING_AUTH_STATE);
  const [passwordRecoveryRequested, setPasswordRecoveryRequested] = useState(false);

  // Mirrors `state` for the subscription callback, which would otherwise close
  // over whatever value existed when the effect ran.
  const stateRef = useRef<GeekAuthState>(BOOTSTRAPPING_AUTH_STATE);

  /**
   * Invalidates in-flight resolution.
   *
   * Every Auth event bumps this, so a slow Profile fetch started before a
   * sign-out cannot land afterwards and restore authenticated state.
   */
  const generationRef = useRef(0);
  const mountedRef = useRef(true);

  const applyState = useCallback((next: GeekAuthState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const resolve = useCallback(async (): Promise<void> => {
    const generation = ++generationRef.current;
    let next: GeekAuthState;

    try {
      next = await withTimeout(resolveAuthState(supabase), AUTH_RESOLUTION_TIMEOUT_MS);
    } catch {
      // A native/network failure must not strand the app in bootstrapping. No
      // identity was verified, so signed out is the only truthful fallback.
      console.error("Auth state resolution failed.");
      next = UNAUTHENTICATED_AUTH_STATE;
    }

    // Discard if the component unmounted or a newer event superseded this run.
    if (!mountedRef.current || generation !== generationRef.current) {
      return;
    }

    applyState(next);
  }, [applyState]);

  useEffect(() => {
    mountedRef.current = true;
    const bootstrapGeneration = ++generationRef.current;

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (session === null) {
        generationRef.current += 1;
        setPasswordRecoveryRequested(false);
        applyState(UNAUTHENTICATED_AUTH_STATE);
        return;
      }

      // Recorded ahead of every early return below. This event is the only notice
      // that a session came from a reset link, and it arrives for a session that
      // may already be resolved — which the deduplication further down would
      // otherwise skip, losing the recovery entirely.
      if (event === "PASSWORD_RECOVERY") {
        setPasswordRecoveryRequested(true);
      }

      // Setting the new password is what the recovery was for.
      if (event === "USER_UPDATED") {
        setPasswordRecoveryRequested(false);
      }

      // A refreshed token is the same identity, so re-verifying and re-fetching
      // the Profile would only add churn.
      if (event === "TOKEN_REFRESHED") {
        return;
      }

      // Sign-in events repeat for a session that is already resolved, for
      // instance when the app returns to the foreground.
      if (event !== "USER_UPDATED" && isResolvedFor(stateRef.current, session.user.id)) {
        return;
      }

      void resolve();
    });

    // Read AsyncStorage-backed session state explicitly. The Auth subscription
    // remains authoritative for subsequent changes, but cold-start completion
    // must not depend on INITIAL_SESSION being delivered.
    void withTimeout(supabase.auth.getSession(), AUTH_RESOLUTION_TIMEOUT_MS)
      .then(({ data: sessionData, error }) => {
        if (!mountedRef.current || bootstrapGeneration !== generationRef.current) return;

        if (error !== null || sessionData.session === null) {
          setPasswordRecoveryRequested(false);
          applyState(UNAUTHENTICATED_AUTH_STATE);
          return;
        }

        void resolve();
      })
      .catch(() => {
        if (!mountedRef.current || bootstrapGeneration !== generationRef.current) return;

        // Session hydration could not establish a verified identity. Fall back
        // conservatively and leave the real error available to the Auth client.
        console.error("Auth session hydration failed.");
        setPasswordRecoveryRequested(false);
        applyState(UNAUTHENTICATED_AUTH_STATE);
      });

    return () => {
      mountedRef.current = false;
      // Bump once more so any pending resolution is discarded after teardown.
      generationRef.current += 1;
      data.subscription.unsubscribe();
    };
  }, [applyState, resolve]);

  const reload = useCallback(() => {
    void resolve();
  }, [resolve]);

  const callbackResolutionPending = useAuthDeepLinks(async (outcome) => {
    if (outcome?.outcome === "session_established") {
      setPasswordRecoveryRequested(outcome.intent === "password_recovery");
      await resolve();
    }
  });

  return (
    <AuthContext.Provider
      value={{ state, passwordRecoveryRequested, callbackResolutionPending, reload }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/** Reads Auth state. Throws if used outside `AuthProvider`, which is a wiring bug. */
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);

  if (value === null) {
    throw new Error("useAuth must be used within an AuthProvider.");
  }

  return value;
}

function isResolvedFor(state: GeekAuthState, userId: string): boolean {
  return state.status === "authenticated" && state.user.id === userId;
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      operation,
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error("Auth operation timed out.")), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}
