import { colors, radii, spacing, typography } from "@geek/design-tokens";
import type {
  AuctionBidHistoryEntry,
  AuctionLiveState,
  AuctionResult,
  Profile,
  PublicCopyComponentAssessment,
  PublicCopyDetail,
} from "@geek/domain";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useEffect, useState } from "react";
import {
  AppState,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "../lib/auth/auth-provider";
import { AboutGameCard } from "../ui/about-game-card";
import { CopyComponentCard, getCopyComponentLabel } from "../ui/copy-component-card";
import { DetailToolbar } from "../ui/detail-toolbar";
import { GeekIcon } from "../ui/geek-icon";
import { MetadataField } from "../ui/metadata-field";
import { StickyCommercialBar } from "../ui/sticky-commercial-bar";
import { getCatalogRegionPresentation, type CanonicalMarketCatalog } from "./canonical-catalog";
import {
  loadCanonicalAuctionLiveState,
  loadCanonicalAuctionResult,
  loadCanonicalPublicCopy,
  loadAuctionBidHistory,
} from "./marketplace-data";
import type { RootStackParamList } from "./types";

type Props = NativeStackScreenProps<RootStackParamList, "PublicCopy">;

type PublicCopyViewData = {
  readonly detail: PublicCopyDetail;
  readonly catalog: CanonicalMarketCatalog;
};

type HistoryState =
  | { readonly status: "idle" | "loading" }
  | { readonly status: "error" }
  | { readonly status: "ready"; readonly entries: readonly AuctionBidHistoryEntry[] };

export function PublicCopyDetailScreen(props: Props) {
  return (
    <SafeAreaProvider>
      <PublicCopyContent {...props} />
    </SafeAreaProvider>
  );
}

function PublicCopyContent({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { state: authState } = useAuth();
  const { width } = useWindowDimensions();
  const heroSize = width - spacing.page * 2;
  const [data, setData] = useState<PublicCopyViewData | null>(null);
  const [auctionLiveState, setAuctionLiveState] = useState<AuctionLiveState | null>(null);
  const [auctionResult, setAuctionResult] = useState<AuctionResult | null>(null);
  const [auctionDeadlineReached, setAuctionDeadlineReached] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [historyRetry, setHistoryRetry] = useState(0);
  const [historyState, setHistoryState] = useState<HistoryState>({ status: "idle" });
  const [state, setState] = useState<
    "error" | "loading" | "ready" | "resolving" | "resolved" | "unavailable"
  >("loading");
  const displayedAuctionId =
    auctionLiveState?.auctionId ??
    auctionResult?.auctionId ??
    (data?.detail.opportunity?.type === "auction" ? data.detail.opportunity.auctionId : null) ??
    route.params.auctionId ??
    null;
  const historyRefreshKey = auctionLiveState?.bidCount ?? auctionResult?.bidCount ?? 0;

  useEffect(() => {
    if (!historyExpanded || displayedAuctionId === null || historyRefreshKey === 0) return;

    let active = true;
    void loadAuctionBidHistory(displayedAuctionId).then(
      (result) => {
        if (!active) return;
        setHistoryState(
          result.outcome === "ok" ? { status: "ready", entries: result.data } : { status: "error" },
        );
      },
      () => {
        if (active) setHistoryState({ status: "error" });
      },
    );
    return () => {
      active = false;
    };
  }, [displayedAuctionId, historyExpanded, historyRefreshKey, historyRetry]);

  const toggleAuctionHistory = () => {
    const nextExpanded = !historyExpanded;
    if (nextExpanded && displayedAuctionId !== null && historyRefreshKey > 0) {
      setHistoryState({ status: "loading" });
    }
    setHistoryExpanded(nextExpanded);
  };

  const retryAuctionHistory = () => {
    setHistoryState({ status: "loading" });
    setHistoryRetry((value) => value + 1);
  };

  useFocusEffect(
    useCallback(() => {
      let active = true;
      let refreshTimer: ReturnType<typeof setTimeout> | null = null;
      let trackedAuctionId = route.params.auctionId ?? null;
      let currentData: PublicCopyViewData | null = null;
      let resolutionRefreshes = 0;
      let generation = 0;
      setData(null);
      setAuctionLiveState(null);
      setAuctionResult(null);
      setAuctionDeadlineReached(false);
      setState("loading");

      const scheduleRefresh = (delayMilliseconds: number, includeCopy = false) => {
        if (refreshTimer !== null) clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => {
          void refresh(includeCopy);
        }, delayMilliseconds);
      };

      const refresh = async (includeCopy: boolean) => {
        const requestGeneration = ++generation;
        let copyOutcome: "error" | "not_found" | "ok" | null = null;

        if (includeCopy) {
          const copyResult = await loadCanonicalPublicCopy(route.params.copyId);
          if (!active || requestGeneration !== generation) return;
          copyOutcome = copyResult.outcome;
          currentData = copyResult.outcome === "ok" ? copyResult.data : null;
          setData(currentData);
          const opportunity = currentData?.detail.opportunity;
          if (opportunity?.type === "auction") trackedAuctionId = opportunity.auctionId;
        }

        if (trackedAuctionId === null) {
          setAuctionLiveState(null);
          setAuctionResult(null);
          setAuctionDeadlineReached(false);
          setState(
            currentData !== null ? "ready" : copyOutcome === "error" ? "error" : "unavailable",
          );
          return;
        }

        const liveResult = await loadCanonicalAuctionLiveState(trackedAuctionId);
        if (!active || requestGeneration !== generation) return;

        if (liveResult.outcome === "ok") {
          const deadline = Date.parse(liveResult.data.endsAt);
          setAuctionLiveState(liveResult.data);
          setAuctionResult(null);
          if (Number.isFinite(deadline) && Date.now() < deadline) {
            resolutionRefreshes = 0;
            setAuctionDeadlineReached(false);
            setState(currentData === null ? "unavailable" : "ready");
            scheduleRefresh(Math.min(5_000, Math.max(50, deadline - Date.now() + 50)));
            return;
          }
          setAuctionDeadlineReached(true);
        } else if (liveResult.outcome === "error") {
          setState(currentData === null ? "error" : "ready");
          scheduleRefresh(5_000);
          return;
        } else {
          setAuctionLiveState(null);
          setAuctionDeadlineReached(true);
        }

        // At or after the canonical deadline, refresh Copy access as well as
        // the caller-relative result. Losing bidders must not keep stale Copy
        // detail merely because this screen was already open.
        const [copyResult, result] = await Promise.all([
          includeCopy ? Promise.resolve(null) : loadCanonicalPublicCopy(route.params.copyId),
          loadCanonicalAuctionResult(trackedAuctionId),
        ]);
        if (!active || requestGeneration !== generation) return;

        if (copyResult !== null) {
          currentData = copyResult.outcome === "ok" ? copyResult.data : null;
          setData(currentData);
        }

        if (result.outcome === "ok") {
          setAuctionLiveState(null);
          setAuctionResult(result.data);
          setState(currentData === null ? "resolved" : "ready");
          return;
        }

        setAuctionResult(null);
        if (result.outcome === "not_found" && resolutionRefreshes < 12) {
          resolutionRefreshes += 1;
          setState(currentData === null ? "resolving" : "ready");
          scheduleRefresh(10_000, true);
          return;
        }

        if (currentData !== null) {
          setState("ready");
        } else {
          setState(result.outcome === "error" ? "error" : "unavailable");
        }
      };

      const appStateSubscription = AppState.addEventListener("change", (nextState) => {
        if (nextState === "active" && active) void refresh(false);
      });

      void refresh(true);
      return () => {
        active = false;
        generation += 1;
        if (refreshTimer !== null) clearTimeout(refreshTimer);
        appStateSubscription.remove();
      };
    }, [route.params.auctionId, route.params.copyId]),
  );

  if ((state !== "ready" || data === null) && auctionResult === null) {
    return (
      <View style={[styles.page, { paddingTop: insets.top }]}>
        <DetailToolbar title="Copie" onClose={navigation.goBack} onMore={() => undefined} />
        <View style={styles.unavailable}>
          <Text style={styles.unavailableText}>
            {state === "loading"
              ? "Chargement de la copie…"
              : state === "resolving"
                ? "Résolution de l’enchère en cours…"
                : state === "error"
                  ? "Impossible de charger cette copie. Revenez en arrière pour réessayer."
                  : "Cette copie n’est plus disponible."}
          </Text>
        </View>
      </View>
    );
  }

  if (data === null && auctionResult !== null) {
    return (
      <View style={[styles.page, { paddingTop: insets.top }]}>
        <DetailToolbar title="Enchère" onClose={navigation.goBack} onMore={() => undefined} />
        <View style={[styles.unavailable, styles.resolvedCopy]}>
          <Text style={styles.unavailableText}>
            Le résultat est disponible. Les détails privés de la copie restent masqués.
          </Text>
        </View>
        <StickyCommercialBar
          auctionHistory={historyState}
          auctionHistoryExpanded={historyExpanded}
          auctionResult={auctionResult}
          onOpenBidder={(userId) => navigation.navigate("PublicProfile", { userId })}
          onRetryAuctionHistory={retryAuctionHistory}
          onToggleAuctionHistory={toggleAuctionHistory}
          opportunity={null}
        />
      </View>
    );
  }

  if (data === null) return null;

  const { catalog, detail } = data;
  const region = getCatalogRegionPresentation(catalog.edition.regionCode);
  const auctionId =
    auctionLiveState?.auctionId ??
    (detail.opportunity?.type === "auction" ? detail.opportunity.auctionId : null) ??
    route.params.auctionId ??
    null;
  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <DetailToolbar
        title={detail.game.canonicalTitle}
        onClose={navigation.goBack}
        onMore={() => undefined}
      />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          (detail.opportunity || auctionLiveState || auctionResult) && styles.contentWithBar,
          (detail.opportunity?.type === "auction" || auctionLiveState || auctionResult) &&
            styles.contentWithAuction,
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroGroup}>
          {catalog.artworkUrl ? (
            <Image
              resizeMode="cover"
              source={{ uri: catalog.artworkUrl }}
              style={[styles.hero, { height: heroSize, width: heroSize }]}
            />
          ) : (
            <View
              style={[styles.hero, styles.heroPlaceholder, { height: heroSize, width: heroSize }]}
            >
              <GeekIcon color={colors.textSecondary} name="gamepad" size={52} />
            </View>
          )}
          {detail.components.length > 0 ? (
            <View style={styles.components}>
              {detail.components.map((component) => (
                <CopyComponentCard
                  key={component.editionComponentId}
                  conditionLabel={formatCondition(component)}
                  label={getCopyComponentLabel(component.kind, component.name)}
                  state={component.presence ?? "unassessed"}
                />
              ))}
            </View>
          ) : null}
        </View>
        <View style={styles.heading}>
          <Text style={styles.title}>{detail.game.canonicalTitle}</Text>
          <View style={styles.platformRow}>
            <Text style={styles.flag}>{region.flag}</Text>
            <Text style={styles.platform}>{detail.platform?.name ?? catalog.platform.name}</Text>
          </View>
        </View>
        <OwnerCard owner={detail.owner} />
        {auctionResult?.winner ? (
          <AuctionWinnerCard
            onOpen={(userId) => navigation.navigate("PublicProfile", { userId })}
            winner={auctionResult.winner}
          />
        ) : null}
        {detail.opportunity?.type === "trade" ? <TradeCard /> : null}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Édition</Text>
          {detail.edition?.regionCode ? (
            <MetadataField label="Région" value={detail.edition.regionCode} />
          ) : null}
          {detail.edition?.releaseDate ? (
            <MetadataField label="Sortie" value={detail.edition.releaseDate} />
          ) : null}
          {detail.edition?.publisherName ? (
            <MetadataField label="Éditeur" value={detail.edition.publisherName} />
          ) : null}
        </View>
        <AboutGameCard
          description={detail.game.description}
          facts={[
            { label: "Plateforme", value: detail.platform?.name ?? catalog.platform.name },
            ...(detail.edition?.regionCode
              ? [{ label: "Région", value: detail.edition.regionCode }]
              : []),
          ]}
          image={catalog.aboutArtworkUrl ? { uri: catalog.aboutArtworkUrl } : null}
          title={detail.game.canonicalTitle}
        />
      </ScrollView>
      <StickyCommercialBar
        auctionHistory={historyState}
        auctionHistoryExpanded={historyExpanded}
        auctionLiveState={auctionLiveState}
        auctionResult={auctionResult}
        onBid={
          auctionId === null || auctionResult
            ? undefined
            : () => navigation.navigate("PlaceBid", { auctionId })
        }
        opportunity={auctionResult || auctionDeadlineReached ? null : detail.opportunity}
        onOpenBidder={(userId) => navigation.navigate("PublicProfile", { userId })}
        onRetryAuctionHistory={retryAuctionHistory}
        onToggleAuctionHistory={toggleAuctionHistory}
        ownerView={authState.status === "authenticated" && authState.user.id === detail.owner.id}
      />
    </View>
  );
}

function AuctionWinnerCard({
  onOpen,
  winner,
}: {
  readonly onOpen: (publicProfileId: string) => void;
  readonly winner: NonNullable<AuctionResult["winner"]>;
}) {
  const name = winner.displayName ?? "Collectionneur Geek";
  const avatarUri = winner.avatarPath?.startsWith("http") === true ? winner.avatarPath : null;
  return (
    <View style={styles.winnerCard}>
      <Text style={styles.small}>Résultat de l’enchère</Text>
      <Pressable
        accessibilityRole="link"
        onPress={() => onOpen(winner.id)}
        style={({ pressed }) => [styles.winnerIdentity, pressed && styles.pressed]}
      >
        {avatarUri ? (
          <Image source={{ uri: avatarUri }} style={styles.winnerAvatar} />
        ) : (
          <View style={[styles.winnerAvatar, styles.winnerAvatarFallback]}>
            <Text style={styles.avatarText}>{name.slice(0, 1).toLocaleUpperCase()}</Text>
          </View>
        )}
        <View>
          <Text style={styles.winnerTitle}>Remportée par</Text>
          <Text style={styles.winnerName}>{name}</Text>
        </View>
      </Pressable>
      <Text style={styles.winnerNotice}>La copie appartient encore à son propriétaire actuel.</Text>
    </View>
  );
}

function OwnerCard({ owner }: { readonly owner: Profile }) {
  const name = owner.displayName ?? owner.username ?? "Collectionneur Geek";
  return (
    <View style={styles.owner}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{name.slice(0, 1).toLocaleUpperCase()}</Text>
      </View>
      <View style={styles.ownerCopy}>
        <Text style={styles.small}>Propriétaire</Text>
        <Text style={styles.body}>{name}</Text>
        {owner.bio ? (
          <Text numberOfLines={2} style={styles.small}>
            {owner.bio}
          </Text>
        ) : (
          <Text style={styles.small}>Collectionneur Geek</Text>
        )}
      </View>
    </View>
  );
}

function TradeCard() {
  return (
    <View style={styles.trade}>
      <View style={styles.tradeSignal}>
        <GeekIcon color={colors.controlSelected} name="fire" size={14} />
        <Text style={styles.tradeText}>Vos Wishlist se correspondent</Text>
      </View>
      <Text style={styles.tradeCopy}>
        Cette copie fait partie d’une opportunité d’échange réciproque actuelle.
      </Text>
    </View>
  );
}

function formatCondition(component: PublicCopyComponentAssessment): string | undefined {
  if (component.presence !== "present" || component.conditionGrade === null) return undefined;
  const labels = {
    1: "État faible",
    2: "État correct",
    3: "Bon état",
    4: "Très bon état",
    5: "Excellent état",
  } as const;
  return labels[component.conditionGrade];
}

const styles = StyleSheet.create({
  page: { backgroundColor: colors.background, flex: 1 },
  unavailable: { alignItems: "center", flex: 1, justifyContent: "center", padding: 24 },
  unavailableText: { ...typography.body, color: colors.textSecondary, textAlign: "center" },
  resolvedCopy: { paddingBottom: 160 },
  content: { gap: 24, paddingBottom: 40 },
  contentWithBar: { paddingBottom: 136 },
  contentWithAuction: { paddingBottom: 168 },
  heroGroup: { gap: 16 },
  hero: { alignSelf: "center", borderRadius: radii.detailCard, overflow: "hidden" },
  heroPlaceholder: {
    alignItems: "center",
    backgroundColor: colors.surfaceSubtle,
    justifyContent: "center",
  },
  components: { flexDirection: "row", gap: 8, justifyContent: "center", paddingHorizontal: 16 },
  heading: { gap: 4, paddingHorizontal: 24 },
  title: { ...typography.screenTitle },
  platform: { ...typography.body },
  platformRow: { alignItems: "center", flexDirection: "row", gap: 4 },
  flag: { fontSize: 16, lineHeight: 18 },
  owner: {
    alignItems: "center",
    backgroundColor: colors.surfaceSubtle,
    borderRadius: 16,
    flexDirection: "row",
    gap: 12,
    marginHorizontal: 12,
    padding: 12,
  },
  avatar: {
    alignItems: "center",
    backgroundColor: colors.surfaceSelected,
    borderRadius: 24,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  avatarText: { fontSize: 20, fontWeight: "700" },
  ownerCopy: { flex: 1, gap: 2 },
  body: { ...typography.body },
  small: { ...typography.metadata, color: colors.textSecondary },
  trade: {
    backgroundColor: "#8781DF",
    borderRadius: 16,
    gap: 8,
    marginHorizontal: 12,
    padding: 16,
  },
  tradeSignal: { alignItems: "center", flexDirection: "row", gap: 4 },
  tradeText: { color: colors.controlSelected, fontSize: 15, fontWeight: "600" },
  tradeCopy: { ...typography.metadata, color: colors.controlSelected },
  winnerCard: {
    backgroundColor: colors.availabilityNotice,
    borderRadius: radii.detailCard,
    gap: spacing.micro,
    marginHorizontal: spacing.medium,
    padding: spacing.page,
  },
  winnerTitle: { ...typography.body, fontWeight: "600" },
  winnerIdentity: { alignItems: "center", flexDirection: "row", gap: spacing.medium },
  winnerAvatar: { borderRadius: 22, height: 44, width: 44 },
  winnerAvatarFallback: {
    alignItems: "center",
    backgroundColor: colors.surfaceSelected,
    justifyContent: "center",
  },
  winnerName: { ...typography.sectionTitle },
  winnerNotice: { ...typography.metadata, color: colors.textSecondary },
  pressed: { opacity: 0.7 },
  section: { gap: 16, paddingHorizontal: 24 },
  sectionTitle: { ...typography.sectionTitle },
});
