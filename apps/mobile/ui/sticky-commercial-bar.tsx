import { colors, typography } from "@geek/design-tokens";
import type { AuctionLiveState, AuctionResult, PublicCopyDetail } from "@geek/domain";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AdaptiveGlassSurface } from "./adaptive-glass-surface";
import { getAuctionLiveBidderPresentation } from "./auction-live-presentation";
import { getAuctionResultPresentation } from "./auction-result-presentation";
import { GeekIcon } from "./geek-icon";
import { formatMoney } from "./format-money";
import { useAuctionCountdown } from "./use-auction-countdown";

export function StickyCommercialBar({
  auctionLiveState = null,
  auctionResult = null,
  onBid,
  opportunity,
  ownerView = false,
}: {
  readonly auctionLiveState?: AuctionLiveState | null;
  readonly auctionResult?: AuctionResult | null;
  readonly onBid?: () => void;
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
      {auctionResult ? (
        <View style={styles.auctionSignal}>
          <Text style={styles.signalText}>
            {auctionResult.bidCount} {auctionResult.bidCount === 1 ? "enchère" : "enchères"}
          </Text>
          <Text style={styles.signalText}>Auction terminée</Text>
        </View>
      ) : auction ? (
        <View style={styles.auctionSignal}>
          <Text style={styles.signalText}>
            {auctionBidCount} {auctionBidCount === 1 ? "enchère" : "enchères"}
          </Text>
          <View style={styles.signalRight}>
            <GeekIcon name="radio" size={14} />
            <Text style={styles.signalText}>{countdown.label}</Text>
          </View>
        </View>
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
