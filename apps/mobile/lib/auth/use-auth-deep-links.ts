import * as Linking from "expo-linking";
import { useEffect, useRef } from "react";

import type { AuthCallbackOutcome } from "./callback";
import { handleAuthCallbackUrl } from "./callback";

/**
 * Completes Auth callbacks that arrive as deep links.
 *
 * `Linking.useURL` covers both delivery cases with one subscription: the URL that
 * launched a cold app, and URLs delivered while it is already running.
 *
 * A successful callback establishes a session, which `AuthProvider` picks up
 * through its own Auth subscription. Nothing here writes Auth state directly, so
 * the two cannot disagree.
 */
export function useAuthDeepLinks(onOutcome?: (outcome: AuthCallbackOutcome) => void): void {
  const url = Linking.useURL();

  // `useURL` keeps returning the last URL. Callback parameters are single-use, so
  // re-processing one would fail and report a spurious error.
  const handledUrlRef = useRef<string | null>(null);
  // Holds the latest callback so a caller passing an inline function does not
  // cause the link-handling effect below to re-run on every render.
  const onOutcomeRef = useRef(onOutcome);

  useEffect(() => {
    onOutcomeRef.current = onOutcome;
  }, [onOutcome]);

  useEffect(() => {
    if (url === null || url === undefined || handledUrlRef.current === url) {
      return;
    }

    handledUrlRef.current = url;

    let active = true;

    void handleAuthCallbackUrl(url).then((outcome) => {
      if (!active || outcome.outcome === "ignored") {
        return;
      }

      onOutcomeRef.current?.(outcome);
    });

    return () => {
      active = false;
    };
  }, [url]);
}
