import type { AuctionParticipation } from "@geek/domain";
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState } from "react-native";

import { useAuth } from "../auth/auth-provider";
import { loadMyAuctionParticipations } from "../../navigation/marketplace-data";

type AuctionPresenceValue = {
  readonly participations: readonly AuctionParticipation[];
  readonly refresh: () => Promise<void>;
};

const EMPTY_VALUE: AuctionPresenceValue = {
  participations: [],
  refresh: async () => undefined,
};

const AuctionPresenceContext = createContext<AuctionPresenceValue>(EMPTY_VALUE);

export function AuctionPresenceProvider({ children }: PropsWithChildren) {
  const { state: authState } = useAuth();
  const [presence, setPresence] = useState<{
    readonly userId: string;
    readonly rows: readonly AuctionParticipation[];
  } | null>(null);
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  const mountedRef = useRef(false);
  const requestGenerationRef = useRef(0);
  const authenticatedUserId = authState.status === "authenticated" ? authState.user.id : null;
  const participations = presence?.userId === authenticatedUserId ? presence.rows : [];

  const refresh = useCallback(async () => {
    if (!mountedRef.current || authenticatedUserId === null || AppState.currentState !== "active") {
      return;
    }

    const requestGeneration = ++requestGenerationRef.current;
    const result = await loadMyAuctionParticipations().catch((): { readonly outcome: "error" } => ({
      outcome: "error",
    }));
    if (!mountedRef.current || requestGeneration !== requestGenerationRef.current) return;

    if (result.outcome === "ok") {
      setPresence({ userId: authenticatedUserId, rows: result.data });
    }
  }, [authenticatedUserId]);

  useEffect(() => {
    mountedRef.current = true;
    const subscription = AppState.addEventListener("change", (nextState) => {
      setForeground(nextState === "active");
      if (nextState === "active") {
        void refresh();
      } else {
        requestGenerationRef.current += 1;
      }
    });

    return () => {
      mountedRef.current = false;
      subscription.remove();
    };
  }, [refresh]);

  useEffect(() => {
    requestGenerationRef.current += 1;
    if (authenticatedUserId === null) return;
    const initialRefresh = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(initialRefresh);
  }, [authenticatedUserId, refresh]);

  const currentParticipationCount = participations.filter(
    ({ phase }) => phase !== "resolved",
  ).length;

  useEffect(() => {
    if (!foreground || authenticatedUserId === null || currentParticipationCount === 0) return;
    const interval = setInterval(() => void refresh(), 5_000);
    return () => clearInterval(interval);
  }, [authenticatedUserId, foreground, currentParticipationCount, refresh]);

  return (
    <AuctionPresenceContext.Provider value={{ participations, refresh }}>
      {children}
    </AuctionPresenceContext.Provider>
  );
}

export function useAuctionPresence(): AuctionPresenceValue {
  return useContext(AuctionPresenceContext);
}
