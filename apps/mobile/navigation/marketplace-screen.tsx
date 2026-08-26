import { colors, radii, typography } from "@geek/design-tokens";
import type { EditionMarketOpportunity } from "@geek/domain";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useEffect, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";

import { DetailToolbar } from "../ui/detail-toolbar";
import { AboutGameCard } from "../ui/about-game-card";
import { GeekIcon } from "../ui/geek-icon";
import { MarketplaceOpportunityCard } from "../ui/marketplace-opportunity-card";
import {
  getCatalogRegionPresentation,
  getEditionVariantLabel,
  type CanonicalMarketCatalog,
} from "./canonical-catalog";
import { loadCanonicalMarket } from "./canonical-catalog-data";
import { loadExactEditionOwnership } from "./add-copy-data";
import { findActiveWishlistIntent, toggleWishlistIntent } from "./collection-surfaces-data";
import { loadEditionMarketOpportunities } from "./marketplace-data";
import type { RootStackParamList } from "./types";

type Props = NativeStackScreenProps<RootStackParamList, "Market">;

export function MarketplaceScreen(props: Props) {
  return (
    <SafeAreaProvider>
      <MarketplaceContent {...props} />
    </SafeAreaProvider>
  );
}

function MarketplaceContent({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const [catalog, setCatalog] = useState<CanonicalMarketCatalog | null>(null);
  const [state, setState] = useState<"error" | "loading" | "ready" | "unavailable">("loading");
  const [ownedCopyCount, setOwnedCopyCount] = useState<number | null>(null);
  const [wishlistIntentId, setWishlistIntentId] = useState<string | null | undefined>(undefined);
  const [wishlistBusy, setWishlistBusy] = useState(false);
  const [opportunities, setOpportunities] = useState<
    readonly EditionMarketOpportunity[] | "error" | null
  >(null);

  useEffect(() => {
    let active = true;
    void loadCanonicalMarket(route.params.gameId, route.params.editionId).then((result) => {
      if (!active) return;
      if (result.outcome === "ok") {
        setCatalog(result.data);
        setState("ready");
      } else {
        setCatalog(null);
        setState(result.outcome === "not_found" ? "unavailable" : "error");
      }
    });
    return () => {
      active = false;
    };
  }, [route.params.editionId, route.params.gameId]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void loadExactEditionOwnership(route.params.editionId).then(
        (copies) => {
          if (active) setOwnedCopyCount(copies?.length ?? null);
        },
        () => {
          if (active) setOwnedCopyCount(null);
        },
      );
      return () => {
        active = false;
      };
    }, [route.params.editionId]),
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setOpportunities(null);
      void loadEditionMarketOpportunities(route.params.gameId, route.params.editionId).then(
        (result) => {
          if (active) setOpportunities(result.outcome === "ok" ? result.data : "error");
        },
      );
      return () => {
        active = false;
      };
    }, [route.params.editionId, route.params.gameId]),
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void findActiveWishlistIntent(route.params.gameId, route.params.editionId).then(
        (intentId) => {
          if (active) setWishlistIntentId(intentId);
        },
      );
      return () => {
        active = false;
      };
    }, [route.params.editionId, route.params.gameId]),
  );

  if (state !== "ready" || !catalog) {
    return (
      <View style={[styles.page, { paddingTop: insets.top }]}>
        <DetailToolbar
          leadingIcon="chevron-left"
          title="Marché"
          onClose={navigation.goBack}
          onMore={() => undefined}
        />
        <View style={styles.unavailable}>
          <Text style={styles.unavailableText}>
            {state === "loading"
              ? "Chargement du marché…"
              : state === "error"
                ? "Impossible de charger ce marché. Revenez en arrière pour réessayer."
                : "Cette édition est indisponible. Revenez en arrière pour réessayer."}
          </Text>
        </View>
      </View>
    );
  }

  const region = getCatalogRegionPresentation(catalog.edition.regionCode);
  const variant = getEditionVariantLabel(catalog.edition.editionName);
  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <DetailToolbar
        leadingIcon="chevron-left"
        title={catalog.game.canonicalTitle}
        onClose={navigation.goBack}
        onMore={() => undefined}
      />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {catalog.artworkUrl ? (
          <Image source={{ uri: catalog.artworkUrl }} style={styles.hero} />
        ) : (
          <View style={[styles.hero, styles.heroPlaceholder]}>
            <GeekIcon color={colors.textSecondary} name="gamepad" size={52} />
          </View>
        )}
        <View style={styles.heading}>
          <Text style={styles.title}>{catalog.game.canonicalTitle}</Text>
          <View style={styles.platformRow}>
            <Text style={styles.flag}>{region.flag}</Text>
            <Text style={styles.platform}>
              {region.label} · {variant} · {catalog.platform.name}
            </Text>
          </View>
        </View>
        <View style={styles.actions}>
          <ActionPill
            disabled={wishlistBusy || wishlistIntentId === undefined}
            icon={wishlistIntentId ? "checkbox" : "bell-ring"}
            label={wishlistIntentId ? "Dans la Wishlist" : "Wishlist"}
            onPress={() => {
              const previous = wishlistIntentId;
              setWishlistBusy(true);
              setWishlistIntentId(previous ? null : "pending");
              void toggleWishlistIntent({
                gameId: catalog.game.id,
                editionId: catalog.edition.id,
                ...(previous ? { intentId: previous } : {}),
              })
                .then(() => findActiveWishlistIntent(catalog.game.id, catalog.edition.id))
                .then(setWishlistIntentId)
                .catch(() => setWishlistIntentId(previous))
                .finally(() => setWishlistBusy(false));
            }}
          />
          <ActionPill
            dark
            disabled={ownedCopyCount !== null && ownedCopyCount > 0}
            icon={ownedCopyCount && ownedCopyCount > 0 ? "checkbox" : "folder-plus"}
            label={ownedCopyCount && ownedCopyCount > 0 ? "Dans ma collection" : "Collection"}
            onPress={() =>
              navigation.navigate("AddCopy", {
                gameId: catalog.game.id,
                editionId: catalog.edition.id,
              })
            }
          />
        </View>
        {opportunities === null ? (
          <Text style={styles.offersLoading}>Chargement des offres…</Text>
        ) : opportunities === "error" ? (
          <Text style={styles.offersError}>
            Impossible de charger les offres actuelles. Revenez sur cet écran pour réessayer.
          </Text>
        ) : opportunities.length === 0 ? (
          <View style={styles.noOffers}>
            <GeekIcon color={colors.textSecondary} name="shopping-cart" size={24} />
            <Text style={styles.noOffersTitle}>Aucune offre pour cette édition</Text>
            <Text style={styles.noOffersCopy}>
              Les ventes, enchères et échanges apparaîtront ici lorsqu’ils seront disponibles.
            </Text>
            <Pressable
              accessibilityHint="Cette alerte sera disponible dans une prochaine version"
              accessibilityRole="button"
              accessibilityState={{ disabled: true }}
              disabled
              style={styles.dibs}
            >
              <GeekIcon name="bell-ring" size={18} />
              <Text style={styles.dibsText}>Me prévenir</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.offers}>
            {opportunities.slice(0, 3).map((opportunity) => (
              <MarketplaceOpportunityCard
                key={`${opportunity.type}:${opportunity.copyId}`}
                artworkUrl={catalog.artworkUrl}
                opportunity={opportunity}
                onPress={() => navigation.navigate("PublicCopy", { copyId: opportunity.copyId })}
              />
            ))}
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                navigation.navigate("MarketOffers", {
                  gameId: catalog.game.id,
                  editionId: catalog.edition.id,
                })
              }
              style={styles.allOffers}
            >
              <Text style={styles.allOffersText}>Voir toutes les offres</Text>
              <Text style={styles.allOffersCount}>{opportunities.length}</Text>
            </Pressable>
          </View>
        )}
        {catalog.game.description || catalog.aboutArtworkUrl ? (
          <AboutGameCard
            description={catalog.game.description}
            facts={[
              { label: "Plateforme", value: catalog.platform.name },
              ...(catalog.edition.regionCode
                ? [{ label: "Région", value: catalog.edition.regionCode }]
                : []),
              ...(catalog.edition.releaseDate
                ? [{ label: "Sortie", value: catalog.edition.releaseDate }]
                : []),
              ...(catalog.edition.publisherName
                ? [{ label: "Éditeur", value: catalog.edition.publisherName }]
                : []),
            ]}
            image={catalog.aboutArtworkUrl ? { uri: catalog.aboutArtworkUrl } : null}
            title={catalog.game.canonicalTitle}
          />
        ) : null}
      </ScrollView>
    </View>
  );
}

function ActionPill({
  dark = false,
  disabled = false,
  icon,
  label,
  onPress,
}: {
  readonly dark?: boolean;
  readonly disabled?: boolean;
  readonly icon: "bell-ring" | "checkbox" | "folder-plus";
  readonly label: string;
  readonly onPress?: () => void;
}) {
  return (
    <Pressable
      disabled={disabled || !onPress}
      onPress={onPress}
      style={[styles.action, dark && styles.actionDark]}
    >
      <GeekIcon color={dark ? colors.controlSelected : colors.text} name={icon} size={18} />
      <Text style={[styles.actionText, dark && styles.actionTextDark]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: colors.background, flex: 1 },
  unavailable: { alignItems: "center", flex: 1, justifyContent: "center", padding: 24 },
  unavailableText: { ...typography.body, color: colors.textSecondary, textAlign: "center" },
  content: { gap: 24, paddingBottom: 40 },
  hero: { borderRadius: radii.detailCard, height: 249, marginHorizontal: 16, width: "auto" },
  heroPlaceholder: {
    alignItems: "center",
    backgroundColor: colors.surfaceSubtle,
    justifyContent: "center",
  },
  heading: { gap: 4, paddingHorizontal: 24 },
  title: { ...typography.screenTitle, color: colors.text },
  platform: { ...typography.body, color: colors.text, flex: 1 },
  platformRow: { alignItems: "center", flexDirection: "row", gap: 4 },
  flag: { fontSize: 16, lineHeight: 18 },
  actions: { flexDirection: "row", gap: 8, paddingHorizontal: 16 },
  action: {
    alignItems: "center",
    borderColor: colors.divider,
    borderRadius: 999,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    padding: 12,
  },
  actionDark: { backgroundColor: colors.text, borderColor: colors.text },
  actionText: { ...typography.body },
  actionTextDark: { color: colors.controlSelected },
  noOffers: {
    alignItems: "center",
    backgroundColor: colors.surfaceSubtle,
    borderRadius: 16,
    gap: 6,
    marginHorizontal: 16,
    paddingHorizontal: 24,
    paddingVertical: 28,
  },
  noOffersTitle: { ...typography.body, color: colors.text, fontWeight: "600" },
  noOffersCopy: { ...typography.metadata, color: colors.textSecondary, textAlign: "center" },
  offersLoading: { ...typography.body, color: colors.textSecondary, textAlign: "center" },
  offersError: {
    ...typography.body,
    color: colors.textSecondary,
    paddingHorizontal: 24,
    textAlign: "center",
  },
  offers: { gap: 8, paddingHorizontal: 8 },
  dibs: {
    alignItems: "center",
    backgroundColor: colors.controlSelected,
    borderColor: colors.divider,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  dibsText: { ...typography.body, fontWeight: "600" },
  allOffers: {
    alignItems: "center",
    borderColor: colors.divider,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "center",
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  allOffersText: { ...typography.body, fontWeight: "600" },
  allOffersCount: { ...typography.metadata, color: colors.textSecondary, marginLeft: 6 },
});
