import type { GeekAuthState } from "@geek/supabase";

/** The one navigation branch made available by the current Auth state. */
export type NavigationBranch =
  "bootstrap" | "auth_entry" | "profile_missing" | "auth_error" | "password_update" | "application";

/**
 * Projects the existing Auth state onto navigation without creating another
 * state machine. Auth remains authoritative; navigation only decides which
 * screens are available for that state.
 */
export function resolveNavigationBranch(
  state: GeekAuthState,
  passwordRecoveryRequested: boolean,
): NavigationBranch {
  switch (state.status) {
    case "bootstrapping":
      return "bootstrap";

    case "unauthenticated":
      return "auth_entry";

    case "profile_missing":
      return "profile_missing";

    case "error":
      return "auth_error";

    case "authenticated":
      return passwordRecoveryRequested ? "password_update" : "application";
  }
}
