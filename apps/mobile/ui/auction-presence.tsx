import { colors, radii, spacing, typography } from "@geek/design-tokens";
import type {
  ActiveAuctionParticipation,
  AuctionParticipation,
  ResolvedAuctionParticipation,
  ResolvingAuctionParticipation,
} from "@geek/domain";
import { useEffect, useMemo, useState } from "react";
import {
  Image,
  LayoutAnimation,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { useAuctionPresence } from "../lib/auction/auction-presence-provider";
import { AdaptiveGlassSurface } from "./adaptive-glass-surface";
import { formatAuctionCountdown } from "./auction-countdown";
import { formatMoney } from "./format-money";
import { GeekIcon } from "./geek-icon";

export function AuctionPresence({
  onOpenAuction,
}: {
  readonly onOpenAuction: (participation: AuctionParticipation) => void;
}) {
  const { participations } = useAuctionPresence();
  const { width } = useWindowDimensions();
  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const liveParticipations = useMemo(
    () =>
      participations.filter(
        (participation): participation is ActiveAuctionParticipation =>
          participation.phase === "live",
      ),
    [participations],
  );
  const resolvedParticipations = useMemo(
    () =>
      participations.filter(
        (participation): participation is ResolvedAuctionParticipation =>
          participation.phase === "resolved",
      ),
    [participations],
  );
  const resolvingParticipations = useMemo(
    () =>
      participations.filter(
        (participation): participation is ResolvingAuctionParticipation =>
          participation.phase === "resolving",
      ),
    [participations],
  );
  const currentParticipations = useMemo(
    () => [...liveParticipations, ...resolvingParticipations],
    [liveParticipations, resolvingParticipations],
  );
  const outbidCount = useMemo(
    () => liveParticipations.filter(({ callerBidState }) => callerBidState === "outbid").length,
    [liveParticipations],
  );

  useEffect(() => {
    if (!expanded || liveParticipations.length === 0) return;
    const interval = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(interval);
  }, [expanded, liveParticipations.length]);

  if (participations.length === 0) return null;

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (!expanded) setNow(Date.now());
    setExpanded(!expanded);
  };

  return (
    <AdaptiveGlassSurface
      style={[
        styles.surface,
        expanded && styles.expandedSurface,
        expanded && { width: Math.min(width - spacing.page * 2, 340) },
      ]}
    >
      {expanded ? (
        <View style={styles.expandedContent}>
          <Pressable accessibilityRole="button" onPress={toggle} style={styles.expandedHeader}>
            <View style={styles.summaryRow}>
              <GeekIcon color={colors.accent} name="radio" size={16} />
              <Text style={styles.headerTitle}>Mes enchères</Text>
              <Text style={styles.headerCount}>{participations.length}</Text>
            </View>
            <GeekIcon name="chevron-down" size={18} />
          </Pressable>
          <ScrollView
            contentContainerStyle={styles.listContent}
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
            style={styles.list}
          >
            {currentParticipations.length > 0 ? (
              <Text style={styles.sectionTitle}>En cours</Text>
            ) : null}
            {currentParticipations.map((participation) => (
              <AuctionParticipationRow
                key={participation.auctionId}
                now={now}
                onPress={() => onOpenAuction(participation)}
                participation={participation}
              />
            ))}
            {resolvedParticipations.length > 0 ? (
              <Text style={styles.sectionTitle}>Terminées</Text>
            ) : null}
            {resolvedParticipations.map((participation) => (
              <AuctionParticipationRow
                key={participation.auctionId}
                now={now}
                onPress={() => onOpenAuction(participation)}
                participation={participation}
              />
            ))}
          </ScrollView>
        </View>
      ) : (
        <Pressable accessibilityRole="button" onPress={toggle} style={styles.collapsedContent}>
          {currentParticipations.length > 0 ? (
            <>
              <View style={styles.summaryRow}>
                <GeekIcon color={colors.accent} name="radio" size={16} />
                <Text style={styles.count}>{currentParticipations.length}</Text>
              </View>
              {outbidCount > 0 ? (
                <View style={styles.summaryRow}>
                  <GeekIcon color={colors.accent} name="megaphone" size={16} />
                  <Text style={styles.count}>{outbidCount}</Text>
                </View>
              ) : null}
            </>
          ) : (
            <View style={styles.summaryRow}>
              <GeekIcon color={colors.textSecondary} name="activity" size={16} />
              <Text style={styles.count}>{resolvedParticipations.length}</Text>
            </View>
          )}
        </Pressable>
      )}
    </AdaptiveGlassSurface>
  );
}

function AuctionParticipationRow({
  now,
  onPress,
  participation,
}: {
  readonly now: number;
  readonly onPress: () => void;
  readonly participation: AuctionParticipation;
}) {
  const stateLabel =
    participation.phase === "live"
      ? participation.callerBidState === "leading"
        ? "Meilleure"
        : "Dépassée"
      : participation.phase === "resolving"
        ? "Résolution…"
        : participation.callerOutcome === "won"
          ? "Gagnée"
          : participation.callerOutcome === "lost"
            ? "Perdue"
            : "Terminée";
  const neutralOutcome =
    participation.phase === "resolving" ||
    (participation.phase === "resolved" && participation.callerOutcome === "ended");

  return (
    <Pressable
      accessibilityRole="button"
      disabled={participation.phase === "resolving"}
      onPress={onPress}
      style={({ pressed }) => [styles.auctionRow, pressed && styles.pressed]}
    >
      {participation.coverAssetUrl ? (
        <Image source={{ uri: participation.coverAssetUrl }} style={styles.thumbnail} />
      ) : (
        <View style={[styles.thumbnail, styles.thumbnailFallback]}>
          <GeekIcon color={colors.textSecondary} name="gamepad" size={20} />
        </View>
      )}
      <View style={styles.rowCopy}>
        <Text numberOfLines={1} style={styles.gameTitle}>
          {participation.gameTitle}
        </Text>
        <Text numberOfLines={1} style={styles.metadata}>
          {participation.platformName}
          {participation.regionCode ? ` · ${participation.regionCode}` : ""}
        </Text>
        {participation.phase === "live" ? (
          <Text style={styles.countdown}>{formatAuctionCountdown(participation.endsAt, now)}</Text>
        ) : null}
      </View>
      <View style={styles.rowState}>
        <Text style={styles.price}>{formatMoney(participation.currentPrice)}</Text>
        <View
          style={[
            styles.statePill,
            participation.phase === "live"
              ? participation.callerBidState === "leading"
                ? styles.leadingPill
                : styles.outbidPill
              : participation.phase === "resolving"
                ? styles.endedPill
                : participation.callerOutcome === "won"
                  ? styles.leadingPill
                  : participation.callerOutcome === "lost"
                    ? styles.outbidPill
                    : styles.endedPill,
          ]}
        >
          <Text style={[styles.stateText, neutralOutcome && styles.endedStateText]}>
            {stateLabel}
          </Text>
        </View>
        {participation.phase === "resolved" &&
        participation.callerOutcome === "won" &&
        participation.orderStatus === "awaiting_payment" ? (
          <Text style={styles.orderState}>À régler</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  surface: { alignSelf: "flex-end", minWidth: 62 },
  expandedSurface: { borderRadius: radii.detailCard },
  collapsedContent: { gap: spacing.medium, paddingHorizontal: 16, paddingVertical: 14 },
  summaryRow: { alignItems: "center", flexDirection: "row", gap: spacing.compact },
  count: { ...typography.body, fontWeight: "600" },
  expandedContent: { overflow: "hidden" },
  expandedHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing.page,
    paddingVertical: spacing.medium,
  },
  headerTitle: { ...typography.body, fontWeight: "600" },
  headerCount: { ...typography.metadata, color: colors.textSecondary },
  list: { maxHeight: 252 },
  listContent: { paddingBottom: spacing.compact, paddingHorizontal: spacing.compact },
  sectionTitle: {
    ...typography.metadata,
    color: colors.textSecondary,
    paddingHorizontal: spacing.compact,
    paddingTop: spacing.compact,
    textTransform: "uppercase",
  },
  auctionRow: {
    alignItems: "center",
    borderTopColor: colors.divider,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: spacing.compact,
    minHeight: 76,
    paddingHorizontal: spacing.compact,
    paddingVertical: spacing.compact,
  },
  thumbnail: { borderRadius: 8, height: 52, width: 52 },
  thumbnailFallback: {
    alignItems: "center",
    backgroundColor: colors.surfaceSubtle,
    justifyContent: "center",
  },
  rowCopy: { flex: 1, minWidth: 0 },
  gameTitle: { ...typography.itemTitle },
  metadata: { ...typography.metadata, color: colors.textSecondary },
  countdown: { color: colors.textSecondary, fontSize: 11, lineHeight: 14 },
  rowState: { alignItems: "flex-end", gap: spacing.micro },
  price: { fontSize: 14, fontWeight: "600" },
  statePill: { borderRadius: radii.capsule, paddingHorizontal: 7, paddingVertical: 3 },
  leadingPill: { backgroundColor: colors.success },
  outbidPill: { backgroundColor: colors.accent },
  endedPill: { backgroundColor: colors.surfaceSelected },
  stateText: { color: colors.controlSelected, fontSize: 10, fontWeight: "600" },
  orderState: { color: colors.textSecondary, fontSize: 10, fontWeight: "600" },
  endedStateText: { color: colors.textSecondary },
  pressed: { opacity: 0.7 },
});
