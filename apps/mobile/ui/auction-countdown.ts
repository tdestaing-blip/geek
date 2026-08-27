export function formatAuctionCountdown(endsAt: string, now = Date.now()): string {
  const remaining = Math.max(0, Date.parse(endsAt) - now);
  const minutes = Math.floor(remaining / 60_000);
  const days = Math.floor(minutes / (24 * 60));
  const hours = Math.floor((minutes % (24 * 60)) / 60);
  const minutePart = minutes % 60;
  return `Fin dans ${days}j : ${String(hours).padStart(2, "0")}h : ${String(minutePart).padStart(2, "0")}m`;
}
