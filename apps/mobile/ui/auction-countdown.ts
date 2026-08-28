export function formatAuctionCountdown(endsAt: string, now = Date.now()): string {
  const totalSeconds = Math.ceil(getAuctionRemainingMilliseconds(endsAt, now) / 1_000);
  if (totalSeconds < 60) return `00:${String(totalSeconds).padStart(2, "0")}`;

  const totalMinutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (totalSeconds < 60 * 60) {
    return `Fin dans ${totalMinutes}m : ${String(seconds).padStart(2, "0")}s`;
  }

  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  return `Fin dans ${days}j : ${String(hours).padStart(2, "0")}h : ${String(minutes).padStart(2, "0")}m`;
}

export function getAuctionRemainingMilliseconds(endsAt: string, now = Date.now()): number {
  const deadline = Date.parse(endsAt);
  return Number.isFinite(deadline) ? Math.max(0, deadline - now) : 0;
}
