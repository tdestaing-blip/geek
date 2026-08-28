import { useIsFocused } from "@react-navigation/native";
import { useEffect, useState } from "react";

import { formatAuctionCountdown, getAuctionRemainingMilliseconds } from "./auction-countdown";

/** Ticks presentation time only while the owning screen is focused and live. */
export function useAuctionCountdown(endsAt: string | null, enabled = true) {
  const focused = useIsFocused();
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const initialTick = setTimeout(tick, 0);
    if (!enabled || !focused || endsAt === null) {
      return () => clearTimeout(initialTick);
    }

    const deadline = Date.parse(endsAt);
    if (!Number.isFinite(deadline) || deadline <= Date.now()) {
      return () => clearTimeout(initialTick);
    }

    const interval = setInterval(() => {
      const nextNow = Date.now();
      setNow(nextNow);
      if (nextNow >= deadline) clearInterval(interval);
    }, 1_000);
    return () => {
      clearTimeout(initialTick);
      clearInterval(interval);
    };
  }, [enabled, endsAt, focused]);

  const remainingMilliseconds =
    endsAt === null || now === null ? null : getAuctionRemainingMilliseconds(endsAt, now);
  return {
    label: endsAt === null || now === null ? null : formatAuctionCountdown(endsAt, now),
    expired: now === null || (remainingMilliseconds !== null && remainingMilliseconds === 0),
  } as const;
}
