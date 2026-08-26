import * as Linking from "expo-linking";
import { useEffect, useRef, useState } from "react";

import type { AuthCallbackOutcome } from "./callback";
import { handleAuthCallbackUrl } from "./callback";

const AUTH_CALLBACK_TIMEOUT_MS = 10_000;

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
export function useAuthDeepLinks(
  onComplete: (outcome: AuthCallbackOutcome | null) => Promise<void>,
): boolean {
  const [resolving, setResolving] = useState(true);
  // Callback parameters are single-use, so a cold URL later repeated as a warm
  // event must not be processed twice.
  const handledUrlsRef = useRef<Set<string>>(new Set());
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    let active = true;
    let pendingOperations = 1;
    let processingQueue = Promise.resolve();

    const finishOperation = (): void => {
      pendingOperations -= 1;
      if (active && pendingOperations === 0) setResolving(false);
    };

    const enqueue = (url: string | null, resolveWhenAbsent = false): void => {
      if (!active || (url !== null && handledUrlsRef.current.has(url))) return;

      if (url !== null) handledUrlsRef.current.add(url);
      pendingOperations += 1;
      setResolving(true);

      const process = async (): Promise<void> => {
        try {
          if (!active) return;

          if (url !== null) {
            const outcome = await withTimeout(handleAuthCallbackUrl(url), AUTH_CALLBACK_TIMEOUT_MS);
            if (!active) return;

            await withTimeout(onCompleteRef.current(outcome), AUTH_CALLBACK_TIMEOUT_MS);
          } else if (resolveWhenAbsent) {
            await withTimeout(onCompleteRef.current(null), AUTH_CALLBACK_TIMEOUT_MS);
          }
        } catch {
          // Expected provider failures are represented by AuthCallbackOutcome. This
          // reports only an unexpected native/callback failure without logging the
          // callback URL or its credentials.
          console.error("Auth callback resolution failed.");
        } finally {
          finishOperation();
        }
      };

      processingQueue = processingQueue.then(process);
    };

    const subscription = Linking.addEventListener("url", ({ url }) => {
      enqueue(url);
    });

    void withTimeout(Linking.getInitialURL(), AUTH_CALLBACK_TIMEOUT_MS)
      .then((url) => {
        enqueue(url, true);
      })
      .catch(() => {
        // Do not log the rejected URL or any callback credentials.
        console.error("Initial Auth callback URL resolution failed.");
      })
      .finally(() => {
        finishOperation();
      });

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return resolving;
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      operation,
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error("Auth callback operation timed out.")),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}
