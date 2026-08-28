import { colors, typography } from "@geek/design-tokens";
import type {
  AuctionBidHistoryEntry,
  AuctionLiveState,
  AuctionResult,
  PublicCopyDetail,
} from "@geek/domain";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  LayoutAnimation,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AdaptiveGlassSurface } from "./adaptive-glass-surface";
import { getAuctionLiveBidderPresentation } from "./auction-live-presentation";
import { getAuctionResultPresentation } from "./auction-result-presentation";
import { GeekIcon } from "./geek-icon";
import { formatMoney } from "./format-money";
import { useAuctionCountdown } from "./use-auction-countdown";

export function StickyCommercialBar({
  auctionHistory = { status: "idle" },
  auctionHistoryExpanded = false,
  auctionLiveState = null,
  auctionResult = null,
  onBid,
  onOpenBidder,
  onRetryAuctionHistory,
  onToggleAuctionHistory,
  opportunity,
  ownerView = false,
}: {
  readonly auctionHistory?:
    | { readonly status: "idle" | "loading" }
    | { readonly status: "error" }
    | { readonly status: "ready"; readonly entries: readonly AuctionBidHistoryEntry[] };
  readonly auctionHistoryExpanded?: boolean;
  readonly auctionLiveState?: AuctionLiveState | null;
  readonly auctionResult?: AuctionResult | null;
  readonly onBid?: () => void;
  readonly onOpenBidder?: (publicProfileId: string) => void;
  readonly onRetryAuctionHistory?: () => void;
  readonly onToggleAuctionHistory?: () => void;
  readonly opportunity: PublicCopyDetail["opportunity"];
  readonly ownerView?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const opportunityAuction = opportunity?.type === "auction" ? opportunity : null;
  const auctionEndsAt = auctionLiveState?.endsAt ?? opportunityAuction?.endsAt ?? null;
  const countdown = useAuctionCountdown(auctionEndsAt, auctionResult === null);
  if (!opportunity && !auctionLiveState && !auctionResult) return null;
  const resultPresentation =
    auctionResult === null ? null : getAuctionResultPresentation(auctionResult.callerOutcome);
  const resultValue =
    auctionResult === null || auctionResult.finalPrice === null
      ? null
      : formatMoney(auctionResult.finalPrice);
  const auction = auctionLiveState !== null || opportunityAuction !== null;
  const trade = opportunity?.type === "trade";
  const auctionPrice = auctionLiveState?.currentPrice ?? opportunityAuction?.currentPrice ?? null;
  const auctionBidCount = auctionLiveState?.bidCount ?? opportunityAuction?.bidCount ?? 0;
  const displayedBidCount = auctionResult?.bidCount ?? auctionBidCount;
  const historyInteractive = displayedBidCount > 0 && onToggleAuctionHistory !== undefined;
  const callerBidState = ownerView ? null : auctionLiveState?.callerBidState;
  const bidderPresentation = getAuctionLiveBidderPresentation(callerBidState ?? null);
  const value =
    auctionPrice !== null
      ? formatMoney(auctionPrice)
      : opportunity?.type === "listing"
        ? formatMoney(opportunity.askingPrice)
        : null;
  return (
    <View pointerEvents="box-none" style={styles.position}>
      {auctionHistoryExpanded && historyInteractive ? (
        <AuctionBidHistoryPanel
          history={auctionHistory}
          onOpenBidder={onOpenBidder}
          onRetry={onRetryAuctionHistory}
        />
      ) : null}
      {auctionResult ? (
        <Pressable
          accessibilityRole={historyInteractive ? "button" : undefined}
          onPress={historyInteractive ? toggleHistory : undefined}
          style={styles.auctionSignal}
        >
          <Text style={styles.signalText}>
            {auctionResult.bidCount} {auctionResult.bidCount === 1 ? "enchère" : "enchères"}
          </Text>
          <Text style={styles.signalText}>Auction terminée</Text>
        </Pressable>
      ) : auction ? (
        <Pressable
          accessibilityRole={historyInteractive ? "button" : undefined}
          onPress={historyInteractive ? toggleHistory : undefined}
          style={styles.auctionSignal}
        >
          <Text style={styles.signalText}>
            {auctionBidCount} {auctionBidCount === 1 ? "enchère" : "enchères"}
          </Text>
          <View style={styles.signalRight}>
            <GeekIcon name="radio" size={14} />
            <Text style={styles.signalText}>{countdown.label}</Text>
          </View>
        </Pressable>
      ) : null}
      <AdaptiveGlassSurface
        style={[styles.surface, { paddingBottom: Math.max(insets.bottom, 16) }]}
      >
        {auctionResult && resultPresentation ? (
          <View style={styles.tradeCopy}>
            <Text style={styles.label}>{resultPresentation.heading}</Text>
            <Text style={styles.price}>{resultValue ?? "Aucune enchère"}</Text>
          </View>
        ) : trade ? (
          <View style={styles.tradeCopy}>
            <Text style={styles.label}>Échange réciproque</Text>
            <Text style={styles.tradeLabel}>Vos Wishlist se correspondent</Text>
          </View>
        ) : (
          <View>
            <Text style={styles.label}>{auction ? "Mise actuelle" : "Prix"}</Text>
            <View style={styles.priceRow}>
              <Text style={styles.price}>{value}</Text>
              {bidderPresentation.pillLabel === "Meilleure" ? (
                <View style={[styles.bidderPill, styles.leadingPill]}>
                  <Text style={styles.leadingPillText}>{bidderPresentation.pillLabel}</Text>
                </View>
              ) : bidderPresentation.pillLabel === "Dépassée" ? (
                <View style={[styles.bidderPill, styles.outbidPill]}>
                  <Text style={styles.outbidPillText}>{bidderPresentation.pillLabel}</Text>
                </View>
              ) : null}
            </View>
          </View>
        )}
        <View style={styles.actions}>
          {resultPresentation ? (
            <View style={styles.ownerState}>
              <Text style={styles.buttonText}>{resultPresentation.stateLabel}</Text>
            </View>
          ) : ownerView ? (
            <View style={styles.ownerState}>
              <Text style={styles.buttonText}>Votre annonce</Text>
            </View>
          ) : !auction && !trade ? (
            <Pressable style={styles.secondary}>
              <Text style={styles.buttonText}>Faire une offre</Text>
            </Pressable>
          ) : null}
          {!ownerView && !resultPresentation && !countdown.expired ? (
            <Pressable
              accessibilityRole="button"
              onPress={auction ? onBid : undefined}
              style={styles.primary}
            >
              <Text style={styles.primaryText}>
                {trade
                  ? "Proposer un échange"
                  : auction
                    ? bidderPresentation.actionLabel
                    : `Acheter ${value}`}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </AdaptiveGlassSurface>
    </View>
  );

  function toggleHistory() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    onToggleAuctionHistory?.();
  }
}

function AuctionBidHistoryPanel({
  history,
  onOpenBidder,
  onRetry,
}: {
  readonly history:
    | { readonly status: "idle" | "loading" }
    | { readonly status: "error" }
    | { readonly status: "ready"; readonly entries: readonly AuctionBidHistoryEntry[] };
  readonly onOpenBidder?: (publicProfileId: string) => void;
  readonly onRetry?: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <View style={styles.historyPanel}>
      <Text style={styles.historyTitle}>Historique des enchères</Text>
      {history.status === "ready" ? (
        <ScrollView
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
          style={styles.historyList}
        >
          {history.entries.map((entry) => (
            <AuctionBidHistoryRow
              entry={entry}
              key={`${entry.bidder.id}-${entry.acceptedAt}-${entry.amount.amountMinor}`}
              now={now}
              onOpen={() => onOpenBidder?.(entry.bidder.id)}
            />
          ))}
        </ScrollView>
      ) : history.status === "error" ? (
        <View style={styles.historyState}>
          <Text style={styles.historyError}>Impossible de charger l’historique.</Text>
          <Pressable accessibilityRole="button" onPress={onRetry}>
            <Text style={styles.retry}>Réessayer</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.historyState}>
          <ActivityIndicator color={colors.textSecondary} />
        </View>
      )}
    </View>
  );
}

function AuctionBidHistoryRow({
  entry,
  now,
  onOpen,
}: {
  readonly entry: AuctionBidHistoryEntry;
  readonly now: number;
  readonly onOpen: () => void;
}) {
  const name = entry.bidder.displayName ?? "Collectionneur Geek";
  const avatarPath = entry.bidder.avatarPath;
  const avatarUri = avatarPath?.startsWith("http") === true ? avatarPath : null;
  return (
    <View style={styles.historyRow}>
      <Pressable accessibilityRole="link" onPress={onOpen}>
        {avatarUri ? (
          <Image source={{ uri: avatarUri }} style={styles.historyAvatar} />
        ) : (
          <View style={[styles.historyAvatar, styles.historyAvatarFallback]}>
            <Text style={styles.historyAvatarText}>{name.slice(0, 1).toLocaleUpperCase()}</Text>
          </View>
        )}
      </Pressable>
      <View style={styles.historyCopy}>
        <View style={styles.historyNameRow}>
          <Text numberOfLines={1} onPress={onOpen} style={styles.historyName}>
            {name}
          </Text>
          {entry.isCaller ? <Text style={styles.youPill}>Vous</Text> : null}
          {entry.isWinning ? (
            <Text style={styles.winningPill}>Gagnante</Text>
          ) : entry.isLeading ? (
            <Text style={styles.leadingHistoryPill}>Meilleure</Text>
          ) : null}
        </View>
        <Text style={styles.historyTime}>{formatAcceptedAt(entry.acceptedAt, now)}</Text>
      </View>
      <Text style={styles.historyAmount}>{formatMoney(entry.amount)}</Text>
    </View>
  );
}

function formatAcceptedAt(acceptedAt: string, now: number): string {
  const accepted = Date.parse(acceptedAt);
  const elapsedSeconds = Number.isFinite(accepted)
    ? Math.max(0, Math.floor((now - accepted) / 1_000))
    : 0;
  if (elapsedSeconds < 60) return `il y a ${elapsedSeconds} s`;
  if (elapsedSeconds < 3_600) return `il y a ${Math.floor(elapsedSeconds / 60)} min`;
  return new Date(acceptedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

const styles = StyleSheet.create({
  position: { bottom: 0, left: 0, position: "absolute", right: 0 },
  auctionSignal: {
    alignItems: "center",
    backgroundColor: "#F4F1FA",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingVertical: 8,
  },
  historyPanel: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: 286,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  historyTitle: { ...typography.body, fontWeight: "600", paddingBottom: 8 },
  historyList: { maxHeight: 238 },
  historyState: { alignItems: "center", gap: 8, minHeight: 96, justifyContent: "center" },
  historyError: { ...typography.metadata, color: colors.textSecondary },
  retry: { color: colors.accent, fontSize: 13, fontWeight: "600" },
  historyRow: {
    alignItems: "center",
    borderTopColor: colors.divider,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 10,
    minHeight: 58,
    paddingVertical: 8,
  },
  historyAvatar: { borderRadius: 18, height: 36, width: 36 },
  historyAvatarFallback: {
    alignItems: "center",
    backgroundColor: colors.surfaceSelected,
    justifyContent: "center",
  },
  historyAvatarText: { fontSize: 14, fontWeight: "600" },
  historyCopy: { flex: 1, minWidth: 0 },
  historyNameRow: { alignItems: "center", flexDirection: "row", gap: 5 },
  historyName: { fontSize: 13, fontWeight: "600", maxWidth: 130 },
  historyTime: { ...typography.metadata, color: colors.textSecondary },
  youPill: { color: colors.textSecondary, fontSize: 10, fontWeight: "600" },
  winningPill: { color: colors.accent, fontSize: 10, fontWeight: "600" },
  leadingHistoryPill: { color: colors.success, fontSize: 10, fontWeight: "600" },
  historyAmount: { fontSize: 14, fontWeight: "600" },
  signalRight: { alignItems: "center", flexDirection: "row", gap: 4 },
  signalText: { fontSize: 13, fontWeight: "500" },
  surface: {
    alignItems: "center",
    borderRadius: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 95,
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  label: { ...typography.metadata, color: colors.textSecondary },
  price: { fontSize: 24, fontWeight: "600", lineHeight: 29 },
  priceRow: { alignItems: "center", flexDirection: "row", gap: 8 },
  bidderPill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  leadingPill: { backgroundColor: colors.success },
  leadingPillText: { color: colors.controlSelected, fontSize: 11, fontWeight: "600" },
  outbidPill: { backgroundColor: colors.accent },
  outbidPillText: { color: colors.controlSelected, fontSize: 11, fontWeight: "600" },
  tradeCopy: { flex: 1, paddingRight: 12 },
  tradeLabel: { ...typography.body, fontWeight: "600" },
  actions: { flexDirection: "row", gap: 8 },
  secondary: {
    backgroundColor: colors.controlSelected,
    borderColor: colors.divider,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  ownerState: {
    backgroundColor: colors.controlSelected,
    borderColor: colors.divider,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  primary: {
    backgroundColor: colors.text,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  buttonText: { fontSize: 14, fontWeight: "600" },
  primaryText: { color: colors.controlSelected, fontSize: 14, fontWeight: "600" },
});
