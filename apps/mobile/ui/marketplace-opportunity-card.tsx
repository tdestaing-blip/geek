import { colors, radii, spacing, typography } from "@geek/design-tokens";
import type { EditionMarketOpportunity } from "@geek/domain";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import { GeekIcon } from "./geek-icon";
import { formatMoney } from "./format-money";

export function MarketplaceOpportunityCard({
  artworkUrl,
  opportunity,
  onPress,
}: {
  readonly artworkUrl: string | null;
  readonly opportunity: EditionMarketOpportunity;
  readonly onPress: () => void;
}) {
  const seller = opportunity.type === "trade" ? opportunity.collector : opportunity.seller;
  const sellerName = seller.displayName ?? seller.username ?? "Collectionneur Geek";
  return (
    <Pressable
      accessibilityLabel={`${getOpportunityLabel(opportunity)} de ${sellerName}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        opportunity.type === "auction" && styles.auctionCard,
        opportunity.type === "trade" && styles.tradeCard,
        pressed && styles.pressed,
      ]}
    >
      {artworkUrl ? (
        <Image source={{ uri: artworkUrl }} style={styles.image} />
      ) : (
        <View style={[styles.image, styles.placeholder]}>
          <GeekIcon color={colors.textSecondary} name="gamepad" size={28} />
        </View>
      )}
      <View style={styles.content}>
        <View style={styles.topRow}>
          <Text style={styles.kind}>{getOpportunityLabel(opportunity)}</Text>
          <Text style={styles.value}>{getOpportunityValue(opportunity)}</Text>
        </View>
        <Text numberOfLines={1} style={styles.seller}>
          {sellerName}
        </Text>
        <View style={styles.signalRow}>{getOpportunitySignal(opportunity)}</View>
      </View>
    </Pressable>
  );
}

function getOpportunityLabel(opportunity: EditionMarketOpportunity): string {
  if (opportunity.type === "listing") return "Achat direct";
  if (opportunity.type === "auction")
    return opportunity.phase === "live" ? "Enchère en cours" : "Enchère à venir";
  return "Échange réciproque";
}

function getOpportunityValue(opportunity: EditionMarketOpportunity): string {
  if (opportunity.type === "listing") return formatMoney(opportunity.askingPrice);
  if (opportunity.type === "auction") return formatMoney(opportunity.currentPrice);
  return "Échanger";
}

function getOpportunitySignal(opportunity: EditionMarketOpportunity) {
  if (opportunity.type === "listing") {
    const modes = [
      opportunity.localPickup ? "Main propre" : null,
      opportunity.shippingAvailable ? "Expédition" : null,
    ].filter((mode): mode is string => mode !== null);
    return <Text style={styles.signal}>{modes.join(" · ") || "Vente directe"}</Text>;
  }
  if (opportunity.type === "auction") {
    return (
      <>
        <GeekIcon color={colors.accent} name="radio" size={13} />
        <Text style={styles.signal}>
          {opportunity.bidCount} enchères · {formatCountdown(opportunity.endsAt)}
        </Text>
      </>
    );
  }
  return (
    <>
      <GeekIcon color={colors.controlSelected} name="fire" size={13} />
      <Text style={[styles.signal, styles.tradeSignal]}>Vous recherchez vos jeux</Text>
    </>
  );
}

export function formatCountdown(endsAt: string): string {
  const remaining = Math.max(0, Date.parse(endsAt) - Date.now());
  const minutes = Math.floor(remaining / 60_000);
  const days = Math.floor(minutes / (24 * 60));
  const hours = Math.floor((minutes % (24 * 60)) / 60);
  const minutePart = minutes % 60;
  return `Fin dans ${days}j : ${String(hours).padStart(2, "0")}h : ${String(minutePart).padStart(2, "0")}m`;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceSubtle,
    borderColor: "transparent",
    borderRadius: radii.detailCard,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.compact,
    minHeight: 92,
    overflow: "hidden",
    padding: spacing.compact,
  },
  auctionCard: { borderColor: colors.accent },
  tradeCard: { backgroundColor: "#8781DF" },
  pressed: { opacity: 0.72 },
  image: { borderRadius: radii.copyImage, height: 76, width: 76 },
  placeholder: {
    alignItems: "center",
    backgroundColor: colors.background,
    justifyContent: "center",
  },
  content: { flex: 1, gap: 4, justifyContent: "center", minWidth: 0 },
  topRow: { alignItems: "center", flexDirection: "row", gap: 8, justifyContent: "space-between" },
  kind: { ...typography.metadata, color: colors.textSecondary, flex: 1 },
  value: { fontSize: 20, fontWeight: "600" },
  seller: { ...typography.body, fontWeight: "500" },
  signalRow: { alignItems: "center", flexDirection: "row", gap: 4 },
  signal: { ...typography.metadata, color: colors.textSecondary, flex: 1 },
  tradeSignal: { color: colors.controlSelected },
});
