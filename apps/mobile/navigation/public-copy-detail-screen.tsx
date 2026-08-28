import { colors, radii, spacing, typography } from "@geek/design-tokens";
import type {
  AuctionResult,
  Profile,
  PublicCopyComponentAssessment,
  PublicCopyDetail,
} from "@geek/domain";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useState } from "react";
import { Image, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "../lib/auth/auth-provider";
import { AboutGameCard } from "../ui/about-game-card";
import { CopyComponentCard, getCopyComponentLabel } from "../ui/copy-component-card";
import { DetailToolbar } from "../ui/detail-toolbar";
import { GeekIcon } from "../ui/geek-icon";
import { MetadataField } from "../ui/metadata-field";
import { StickyCommercialBar } from "../ui/sticky-commercial-bar";
import { getCatalogRegionPresentation, type CanonicalMarketCatalog } from "./canonical-catalog";
import { loadCanonicalAuctionResult, loadCanonicalPublicCopy } from "./marketplace-data";
import type { RootStackParamList } from "./types";

type Props = NativeStackScreenProps<RootStackParamList, "PublicCopy">;

type PublicCopyViewData = {
  readonly detail: PublicCopyDetail;
  readonly catalog: CanonicalMarketCatalog;
};

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
  const [auctionResult, setAuctionResult] = useState<AuctionResult | null>(null);
  const [auctionDeadlineReached, setAuctionDeadlineReached] = useState(false);
  const [state, setState] = useState<
    "error" | "loading" | "ready" | "resolving" | "resolved" | "unavailable"
  >("loading");

  useFocusEffect(
    useCallback(() => {
      let active = true;
      let refreshTimer: ReturnType<typeof setTimeout> | null = null;
      let trackedAuctionId = route.params.auctionId ?? null;
      let knownEndsAt: number | null = null;
      let resolutionRefreshes = 0;
      setData(null);
      setAuctionResult(null);
      setAuctionDeadlineReached(false);
      setState("loading");

      const scheduleRefresh = (delayMilliseconds: number) => {
        if (refreshTimer !== null) clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => {
          setAuctionDeadlineReached(true);
          void refresh();
        }, delayMilliseconds);
      };

      const refresh = async () => {
        const [copyResult, result] = await Promise.all([
          loadCanonicalPublicCopy(route.params.copyId),
          trackedAuctionId === null
            ? Promise.resolve({ outcome: "not_found" } as const)
            : loadCanonicalAuctionResult(trackedAuctionId),
        ]);
        if (!active) return;

        const nextData = copyResult.outcome === "ok" ? copyResult.data : null;
        const opportunity = nextData?.detail.opportunity;
        if (opportunity?.type === "auction") {
          trackedAuctionId = opportunity.auctionId;
          knownEndsAt = Date.parse(opportunity.endsAt);
        }

        if (result.outcome === "ok") {
          setData(nextData);
          setAuctionResult(result.data);
          setState(nextData === null ? "resolved" : "ready");
          return;
        }

        setData(nextData);
        setAuctionResult(null);

        const now = Date.now();
        if (knownEndsAt !== null && Number.isFinite(knownEndsAt) && now < knownEndsAt) {
          setAuctionDeadlineReached(false);
          setState(nextData === null ? "unavailable" : "ready");
          scheduleRefresh(Math.max(50, knownEndsAt - now + 50));
          return;
        }

        // Once a screen-observed Auction crosses its deadline, refresh only
        // around the one-minute cron boundary. Postgres remains the finalizer.
        if (
          trackedAuctionId !== null &&
          knownEndsAt !== null &&
          result.outcome === "not_found" &&
          resolutionRefreshes < 12
        ) {
          resolutionRefreshes += 1;
          setState(nextData === null ? "resolving" : "ready");
          scheduleRefresh(10_000);
          return;
        }

        if (copyResult.outcome === "ok") {
          setState("ready");
        } else {
          setState(copyResult.outcome === "not_found" ? "unavailable" : "error");
        }
      };

      void refresh();
      return () => {
        active = false;
        if (refreshTimer !== null) clearTimeout(refreshTimer);
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
        <StickyCommercialBar auctionResult={auctionResult} opportunity={null} />
      </View>
    );
  }

  if (data === null) return null;

  const { catalog, detail } = data;
  const region = getCatalogRegionPresentation(catalog.edition.regionCode);
  const auctionId = detail.opportunity?.type === "auction" ? detail.opportunity.auctionId : null;
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
          (detail.opportunity || auctionResult) && styles.contentWithBar,
          (detail.opportunity?.type === "auction" || auctionResult) && styles.contentWithAuction,
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
        auctionResult={auctionResult}
        onBid={
          auctionId === null || auctionResult
            ? undefined
            : () => navigation.navigate("PlaceBid", { auctionId })
        }
        opportunity={auctionResult || auctionDeadlineReached ? null : detail.opportunity}
        ownerView={authState.status === "authenticated" && authState.user.id === detail.owner.id}
      />
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
        <Text style={styles.body}>À {name}</Text>
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
  section: { gap: 16, paddingHorizontal: 24 },
  sectionTitle: { ...typography.sectionTitle },
});
