import { colors, spacing, typography } from "@geek/design-tokens";
import type { EditionMarketOpportunity } from "@geek/domain";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";

import { DetailToolbar } from "../ui/detail-toolbar";
import { MarketplaceOpportunityCard } from "../ui/marketplace-opportunity-card";
import type { CanonicalMarketCatalog } from "./canonical-catalog";
import { loadCanonicalMarket } from "./canonical-catalog-data";
import { loadEditionMarketOpportunities } from "./marketplace-data";
import type { RootStackParamList } from "./types";

type Props = NativeStackScreenProps<RootStackParamList, "MarketOffers">;

export function MarketplaceOffersScreen(props: Props) {
  return (
    <SafeAreaProvider>
      <MarketplaceOffersContent {...props} />
    </SafeAreaProvider>
  );
}

function MarketplaceOffersContent({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const [catalog, setCatalog] = useState<CanonicalMarketCatalog | null>(null);
  const [opportunities, setOpportunities] = useState<
    readonly EditionMarketOpportunity[] | "error" | null
  >(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setOpportunities(null);
      void Promise.all([
        loadCanonicalMarket(route.params.gameId, route.params.editionId),
        loadEditionMarketOpportunities(route.params.gameId, route.params.editionId),
      ]).then(([catalogResult, opportunityResult]) => {
        if (!active) return;
        setCatalog(catalogResult.outcome === "ok" ? catalogResult.data : null);
        setOpportunities(opportunityResult.outcome === "ok" ? opportunityResult.data : "error");
      });
      return () => {
        active = false;
      };
    }, [route.params.editionId, route.params.gameId]),
  );

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <DetailToolbar
        leadingIcon="chevron-left"
        title="Toutes les offres"
        onClose={navigation.goBack}
        onMore={() => undefined}
      />
      <FlatList
        contentContainerStyle={styles.content}
        data={Array.isArray(opportunities) ? opportunities : []}
        keyExtractor={(opportunity) => opportunityKey(opportunity)}
        ListHeaderComponent={
          catalog ? (
            <View style={styles.heading}>
              <Text style={styles.title}>{catalog.game.canonicalTitle}</Text>
              <Text style={styles.subtitle}>
                {catalog.platform.name} · {catalog.edition.regionCode ?? "Région non renseignée"}
              </Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <Text style={styles.empty}>
            {opportunities === null
              ? "Chargement des offres…"
              : opportunities === "error"
                ? "Impossible de charger les offres actuelles."
                : "Aucune offre active pour cette édition."}
          </Text>
        }
        renderItem={({ item }) => (
          <MarketplaceOpportunityCard
            artworkUrl={catalog?.artworkUrl ?? null}
            opportunity={item}
            onPress={() =>
              navigation.navigate("PublicCopy", {
                copyId: item.copyId,
                ...(item.type === "auction" ? { auctionId: item.auctionId } : {}),
              })
            }
          />
        )}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

function opportunityKey(opportunity: EditionMarketOpportunity): string {
  if (opportunity.type === "listing") return `listing:${opportunity.listingId}`;
  if (opportunity.type === "auction") return `auction:${opportunity.auctionId}`;
  return `trade:${opportunity.copyId}`;
}

const styles = StyleSheet.create({
  page: { backgroundColor: colors.background, flex: 1 },
  content: { gap: spacing.compact, padding: spacing.page, paddingBottom: 40 },
  heading: { gap: 4, paddingBottom: spacing.page },
  title: { ...typography.sectionTitle, color: colors.text },
  subtitle: { ...typography.body, color: colors.textSecondary },
  empty: {
    ...typography.body,
    color: colors.textSecondary,
    paddingVertical: 48,
    textAlign: "center",
  },
});
