import { getMyActivity } from "@geek/data";
import type { ActivityCursor, ActivityItem, ActivityPage, ActivitySegment } from "@geek/domain";
import { colors, radii, spacing, typography } from "@geek/design-tokens";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { supabase } from "../lib/supabase";
import { formatAuctionCountdown } from "../ui/auction-countdown";
import { formatMoney } from "../ui/format-money";
import { GeekIcon } from "../ui/geek-icon";
import { SegmentedControl } from "../ui/segmented-control";
import type { MainTabParamList, RootStackParamList } from "./types";

type Props = BottomTabScreenProps<MainTabParamList, "Activity">;
type ScreenState =
  | { readonly status: "loading"; readonly items: readonly ActivityItem[] }
  | { readonly status: "error"; readonly items: readonly ActivityItem[] }
  | {
      readonly status: "ready";
      readonly items: readonly ActivityItem[];
      readonly nextCursor: ActivityCursor | null;
    };

export function ActivityScreen({ navigation }: Props) {
  const rootNavigation = navigation.getParent<NativeStackNavigationProp<RootStackParamList>>();
  if (!rootNavigation) throw new Error("Activity must be mounted under the application stack.");

  const [segment, setSegment] = useState<ActivitySegment>("current");
  const [state, setState] = useState<ScreenState>({ status: "loading", items: [] });
  const [refreshGeneration, setRefreshGeneration] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const requestGeneration = useRef(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!state.items.some((item) => item.segment === "current" && item.endsAt !== null)) return;
    const interval = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, [state.items]);

  useFocusEffect(
    useCallback(() => {
      const generation = ++requestGeneration.current;
      let active = true;
      setLoadingMore(false);
      setState({ status: "loading", items: [] });
      void getMyActivity(supabase, { segment }).then(
        (result) => {
          if (!active || generation !== requestGeneration.current) return;
          setState(
            result.outcome === "ok"
              ? {
                  status: "ready",
                  items: result.data.items,
                  nextCursor: result.data.nextCursor,
                }
              : { status: "error", items: [] },
          );
        },
        () => {
          if (active && generation === requestGeneration.current) {
            setState({ status: "error", items: [] });
          }
        },
      );
      return () => {
        active = false;
        requestGeneration.current += 1;
      };
      // refreshGeneration intentionally invalidates the focused first-page request.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refreshGeneration, segment]),
  );

  async function loadMore() {
    if (state.status !== "ready" || state.nextCursor === null || loadingMore) return;
    const generation = requestGeneration.current;
    setLoadingMore(true);
    try {
      const result = await getMyActivity(supabase, {
        segment,
        cursor: state.nextCursor,
      });
      if (generation !== requestGeneration.current || result.outcome !== "ok") return;
      setState((current) =>
        current.status === "ready" ? appendPage(current, result.data) : current,
      );
    } finally {
      if (generation === requestGeneration.current) setLoadingMore(false);
    }
  }

  function openItem(item: ActivityItem) {
    if (item.navigationTarget.kind === "public_copy") {
      rootNavigation.navigate("PublicCopy", {
        copyId: item.navigationTarget.copyId,
        auctionId: item.navigationTarget.auctionId,
      });
      return;
    }
    rootNavigation.navigate("Copy", { copyId: item.navigationTarget.copyId });
  }

  return (
    <SafeAreaView edges={["top"]} style={styles.page}>
      <FlatList
        contentContainerStyle={styles.content}
        data={state.items}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <ActivityEmptyState
            loading={state.status === "loading"}
            message={
              state.status === "error"
                ? "Impossible de charger votre activité. Réessayez."
                : segment === "current"
                  ? "Aucune activité en cours"
                  : "Aucune activité terminée"
            }
            onRetry={
              state.status === "error"
                ? () => setRefreshGeneration((generation) => generation + 1)
                : undefined
            }
          />
        }
        ListFooterComponent={
          loadingMore ? <ActivityIndicator color={colors.text} style={styles.loadingMore} /> : null
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Activité</Text>
            <SegmentedControl
              onSelect={setSegment}
              options={[
                { id: "current", label: "En cours" },
                { id: "history", label: "Historique" },
              ]}
              selected={segment}
            />
          </View>
        }
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.4}
        refreshControl={
          <RefreshControl
            onRefresh={() => setRefreshGeneration((generation) => generation + 1)}
            refreshing={state.status === "loading" && state.items.length > 0}
            tintColor={colors.text}
          />
        }
        renderItem={({ item }) => (
          <ActivityRow item={item} now={now} onPress={() => openItem(item)} />
        )}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

function ActivityRow({
  item,
  now,
  onPress,
}: {
  readonly item: ActivityItem;
  readonly now: number;
  readonly onPress: () => void;
}) {
  const presentation = activityPresentation(item);
  const context = activityContext(item, now);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {item.thumbnailUrl ? (
        <Image source={{ uri: item.thumbnailUrl }} style={styles.thumbnail} />
      ) : (
        <View style={[styles.thumbnail, styles.thumbnailFallback]}>
          <GeekIcon color={colors.textSecondary} name="gamepad" size={24} />
        </View>
      )}
      <View style={styles.rowBody}>
        <View style={styles.titleRow}>
          <Text numberOfLines={1} style={styles.itemTitle}>
            {item.title}
          </Text>
          {item.amount ? <Text style={styles.amount}>{formatMoney(item.amount)}</Text> : null}
        </View>
        <View
          style={[
            styles.statePill,
            item.requiresAttention ? styles.attentionPill : styles.passivePill,
          ]}
        >
          <Text style={styles.stateLabel}>{presentation}</Text>
        </View>
        <Text numberOfLines={1} style={styles.context}>
          {context}
        </Text>
      </View>
    </Pressable>
  );
}

function ActivityEmptyState({
  loading,
  message,
  onRetry,
}: {
  readonly loading: boolean;
  readonly message: string;
  readonly onRetry?: () => void;
}) {
  return (
    <View style={styles.emptyState}>
      {loading ? <ActivityIndicator color={colors.text} /> : null}
      <Text style={styles.emptyText}>{message}</Text>
      {onRetry ? (
        <Pressable accessibilityRole="button" onPress={onRetry} style={styles.retryButton}>
          <Text style={styles.retryLabel}>Réessayer</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function appendPage(
  current: Extract<ScreenState, { readonly status: "ready" }>,
  page: ActivityPage,
): ScreenState {
  const known = new Set(current.items.map((item) => item.id));
  return {
    status: "ready",
    items: [...current.items, ...page.items.filter((item) => !known.has(item.id))],
    nextCursor: page.nextCursor,
  };
}

function activityPresentation(item: ActivityItem): string {
  switch (item.state) {
    case "auction_bidder_leading":
      return "Enchère · Meilleure";
    case "auction_bidder_outbid":
      return "Enchère · Dépassée";
    case "auction_bidder_resolving":
    case "auction_seller_resolving":
      return "Enchère · Résolution…";
    case "auction_bidder_won":
      return "Enchère · Gagnée";
    case "auction_bidder_lost":
      return "Enchère · Perdue";
    case "auction_bidder_ended":
      return "Enchère · Terminée";
    case "auction_seller_live":
      return "Enchère · En cours";
    case "auction_seller_won":
      return "Enchère · Remportée";
    case "auction_seller_ended":
      return "Enchère · Terminée sans vente";
    case "order_buyer_awaiting_payment":
      return "Achat · À régler";
    case "order_seller_awaiting_payment":
      return "Vente · Paiement en attente";
    case "listing_active":
      return "Vente · En ligne";
    case "listing_withdrawn":
      return "Vente · Retirée";
    case "listing_expired":
      return "Vente · Expirée";
    case "listing_sold":
      return "Vente · Vendue";
  }
}

function activityContext(item: ActivityItem, now: number): string {
  const parts: string[] = [];
  if (item.counterparty?.displayName) parts.push(item.counterparty.displayName);
  if (item.platformName) {
    parts.push(item.regionCode ? `${item.platformName} · ${item.regionCode}` : item.platformName);
  }
  if (
    item.endsAt &&
    (item.state === "auction_bidder_leading" ||
      item.state === "auction_bidder_outbid" ||
      item.state === "auction_seller_live")
  ) {
    parts.push(formatAuctionCountdown(item.endsAt, now));
  } else {
    parts.push(formatActivityDate(item.occurredAt));
  }
  return parts.join(" · ");
}

function formatActivityDate(value: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

const styles = StyleSheet.create({
  page: { backgroundColor: colors.background, flex: 1 },
  content: { flexGrow: 1, paddingBottom: 112, paddingHorizontal: spacing.page },
  header: { gap: spacing.page, paddingBottom: spacing.page },
  title: { ...typography.screenTitle, color: colors.text },
  row: {
    alignItems: "center",
    borderBottomColor: colors.divider,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: spacing.medium,
    minHeight: 96,
    paddingVertical: spacing.medium,
  },
  thumbnail: { borderRadius: radii.wishlistImage, height: 72, width: 56 },
  thumbnailFallback: {
    alignItems: "center",
    backgroundColor: colors.surfaceSubtle,
    justifyContent: "center",
  },
  rowBody: { flex: 1, gap: spacing.micro, minWidth: 0 },
  titleRow: { alignItems: "center", flexDirection: "row", gap: spacing.compact },
  itemTitle: { ...typography.body, color: colors.text, flex: 1, fontWeight: "600" },
  amount: { ...typography.body, color: colors.text, fontWeight: "600" },
  statePill: {
    alignSelf: "flex-start",
    borderRadius: radii.capsule,
    paddingHorizontal: spacing.compact,
    paddingVertical: spacing.hairline,
  },
  attentionPill: { backgroundColor: colors.warning },
  passivePill: { backgroundColor: colors.surfaceSubtle },
  stateLabel: { ...typography.metadata, color: colors.text, fontWeight: "600" },
  context: { ...typography.metadata, color: colors.textSecondary },
  pressed: { opacity: 0.65 },
  emptyState: { alignItems: "center", gap: spacing.medium, padding: 48 },
  emptyText: { ...typography.body, color: colors.textSecondary, textAlign: "center" },
  retryButton: {
    backgroundColor: colors.control,
    borderRadius: radii.capsule,
    paddingHorizontal: spacing.page,
    paddingVertical: spacing.compact,
  },
  retryLabel: { ...typography.body, color: colors.text, fontWeight: "600" },
  loadingMore: { padding: spacing.page },
});
