import { colors, typography } from "@geek/design-tokens";
import type { PublicCopyDetail } from "@geek/domain";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AdaptiveGlassSurface } from "./adaptive-glass-surface";
import { formatAuctionCountdown } from "./auction-countdown";
import { GeekIcon } from "./geek-icon";
import { formatMoney } from "./format-money";

export function StickyCommercialBar({
  opportunity,
  ownerView = false,
}: {
  readonly opportunity: PublicCopyDetail["opportunity"];
  readonly ownerView?: boolean;
}) {
  const insets = useSafeAreaInsets();
  if (!opportunity) return null;
  const auction = opportunity.type === "auction";
  const trade = opportunity.type === "trade";
  const value = trade
    ? null
    : formatMoney(auction ? opportunity.currentPrice : opportunity.askingPrice);
  return (
    <View pointerEvents="box-none" style={styles.position}>
      {auction ? (
        <View style={styles.auctionSignal}>
          <Text style={styles.signalText}>{opportunity.bidCount} enchères</Text>
          <View style={styles.signalRight}>
            <GeekIcon name="radio" size={14} />
            <Text style={styles.signalText}>{formatAuctionCountdown(opportunity.endsAt)}</Text>
          </View>
        </View>
      ) : null}
      <AdaptiveGlassSurface
        style={[styles.surface, { paddingBottom: Math.max(insets.bottom, 16) }]}
      >
        {trade ? (
          <View style={styles.tradeCopy}>
            <Text style={styles.label}>Échange réciproque</Text>
            <Text style={styles.tradeLabel}>Vos Wishlist se correspondent</Text>
          </View>
        ) : (
          <View>
            <Text style={styles.label}>{auction ? "Mise actuelle" : "Prix"}</Text>
            <Text style={styles.price}>{value}</Text>
          </View>
        )}
        <View style={styles.actions}>
          {ownerView ? (
            <View style={styles.ownerState}>
              <Text style={styles.buttonText}>Votre annonce</Text>
            </View>
          ) : !auction && !trade ? (
            <Pressable style={styles.secondary}>
              <Text style={styles.buttonText}>Faire une offre</Text>
            </Pressable>
          ) : null}
          {!ownerView ? (
            <Pressable style={styles.primary}>
              <Text style={styles.primaryText}>
                {trade ? "Proposer un échange" : auction ? "Enchérir" : `Acheter ${value}`}
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
