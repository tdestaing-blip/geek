import { colors, radii, typography } from "@geek/design-tokens";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";

import FRANCE_FLAG from "../assets/collection/v2/icon-france.png";
import { AboutGameCard } from "../ui/about-game-card";
import { DetailToolbar } from "../ui/detail-toolbar";
import { GeekIcon } from "../ui/geek-icon";
import {
  isMajoraMarketIdentity,
  MAJORA_GAME_FIXTURE,
  MAJORA_MARKET_OPPORTUNITIES,
  type MarketOpportunityFixture,
  resolveCopyFixture,
  WISHLIST_MARKET_TARGETS,
} from "./marketplace-fixtures";
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
  const target = WISHLIST_MARKET_TARGETS.find(
    ({ editionId, gameId }) =>
      editionId === route.params.editionId && gameId === route.params.gameId,
  );

  if (!target) {
    throw new Error("No local Market fixture matches the requested Game and Edition identity");
  }

  if (!isMajoraMarketIdentity(route.params.gameId, route.params.editionId)) {
    return (
      <View style={[styles.page, { paddingTop: insets.top }]}>
        <DetailToolbar
          leadingIcon="chevron-left"
          title={target.title}
          onClose={navigation.goBack}
          onMore={() => undefined}
        />
        <View style={styles.unsupported}>
          <Text style={styles.unsupportedText}>
            Ce marché détaillé n’est pas encore disponible.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <DetailToolbar
        leadingIcon="chevron-left"
        title={MAJORA_GAME_FIXTURE.title}
        onClose={navigation.goBack}
        onMore={() => undefined}
      />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Image source={MAJORA_GAME_FIXTURE.image} style={styles.hero} />
        <View style={styles.heading}>
          <Text style={styles.title}>{MAJORA_GAME_FIXTURE.title}</Text>
          <View style={styles.platformRow}>
            <Image source={FRANCE_FLAG} style={styles.flag} />
            <Text style={styles.platform}>{MAJORA_GAME_FIXTURE.platform}</Text>
          </View>
          <Text style={styles.demand}>
            <Text style={styles.strong}>261 collectionneurs</Text> cherchent cette édition du jeu
          </Text>
        </View>
        <View style={styles.actions}>
          <ActionPill icon="bell-ring" label="Wishlist" />
          <ActionPill dark icon="folder-plus" label="Collection" />
        </View>
        <View style={styles.offers}>
          {MAJORA_MARKET_OPPORTUNITIES.map((opportunity) => {
            const resolvedCopy = resolveCopyFixture(opportunity.copyId);
            return (
              <OfferCard
                key={opportunity.id}
                copy={resolvedCopy.copy}
                opportunity={opportunity}
                onPress={() => navigation.navigate("PublicCopy", { copyId: opportunity.copyId })}
              />
            );
          })}
        </View>
        <AboutGameCard
          description={MAJORA_GAME_FIXTURE.about.description}
          image={MAJORA_GAME_FIXTURE.about.image}
          title={MAJORA_GAME_FIXTURE.about.title}
        />
      </ScrollView>
    </View>
  );
}

function ActionPill({
  dark = false,
  icon,
  label,
}: {
  readonly dark?: boolean;
  readonly icon: "bell-ring" | "folder-plus";
  readonly label: string;
}) {
  return (
    <Pressable style={[styles.action, dark && styles.actionDark]}>
      <GeekIcon color={dark ? colors.controlSelected : colors.text} name={icon} size={18} />
      <Text style={[styles.actionText, dark && styles.actionTextDark]}>{label}</Text>
    </Pressable>
  );
}

function OfferCard({
  copy,
  opportunity,
  onPress,
}: {
  readonly copy: ReturnType<typeof resolveCopyFixture>["copy"];
  readonly opportunity: MarketOpportunityFixture;
  readonly onPress?: () => void;
}) {
  const auction = opportunity.type === "auction";
  const price = auction ? opportunity.currentBid : opportunity.price;
  return (
    <Pressable onPress={onPress} style={[styles.offer, auction && styles.auction]}>
      <View style={styles.offerMain}>
        <Image source={copy.photos[0]} style={styles.offerImage} />
        <View style={styles.offerDetails}>
          <View style={styles.offerTop}>
            {auction ? (
              <View style={styles.offerKindRow}>
                <View style={styles.countdown}>
                  <GeekIcon color={colors.controlSelected} name="radio" size={14} />
                  <Text style={styles.countdownText}>{opportunity.countdown}</Text>
                </View>
                <Text style={styles.offerKind}>· {opportunity.bidCount} enchères</Text>
              </View>
            ) : (
              <Text style={styles.offerKind}>Achat direct · Échange</Text>
            )}
            <Text style={styles.price}>{price}</Text>
          </View>
          {copy.components.map((component, index) => {
            return (
              <View
                key={component.label}
                style={[styles.componentLine, !component.present && styles.muted]}
              >
                <View style={styles.componentIdentity}>
                  <GeekIcon name={component.present ? "checkbox" : "square"} size={16} />
                  <Text style={styles.component}>{component.label}</Text>
                  {index === 0 ? <Image source={FRANCE_FLAG} style={styles.flag} /> : null}
                </View>
                <Text style={styles.component}>
                  {component.present ? component.condition : "–"}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
      <View style={styles.seller}>
        <Text style={styles.sellerName}>{copy.owner.name}</Text>
        <GeekIcon name="star" size={18} />
        <Text style={styles.small}>{copy.owner.rating}</Text>
        <GeekIcon name="map-pin" size={18} />
        <Text style={styles.small}>{copy.owner.distance}</Text>
        {opportunity.type === "listing" && opportunity.reciprocalInterest ? (
          <View style={styles.match}>
            <GeekIcon color={colors.controlSelected} name="fire" size={14} />
            <Text style={styles.matchText}>{opportunity.reciprocalInterest.gameCount} jeux</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: colors.background, flex: 1 },
  unsupported: { alignItems: "center", flex: 1, justifyContent: "center", padding: 24 },
  unsupportedText: { ...typography.body, color: colors.textSecondary, textAlign: "center" },
  content: { gap: 24, paddingBottom: 40 },
  hero: { borderRadius: radii.detailCard, height: 249, marginHorizontal: 16, width: "auto" },
  heading: { gap: 4, paddingHorizontal: 24 },
  title: { ...typography.screenTitle, color: colors.text },
  platform: { ...typography.body },
  platformRow: { alignItems: "center", flexDirection: "row", gap: 4 },
  flag: { height: 16, width: 16 },
  demand: { ...typography.body, marginTop: 4 },
  strong: { fontWeight: "600" },
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
  offers: { gap: 8, paddingHorizontal: 12 },
  offer: { backgroundColor: colors.surfaceSubtle, borderRadius: 16, overflow: "hidden" },
  auction: { borderColor: colors.accent, borderWidth: 1 },
  offerMain: { flexDirection: "row", gap: 12, padding: 12 },
  offerImage: { borderRadius: 8, height: 88, width: 88 },
  offerDetails: { flex: 1, gap: 2 },
  offerTop: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  offerKind: { color: colors.textSecondary, fontSize: 13 },
  offerKindRow: { alignItems: "center", flexDirection: "row", gap: 4 },
  countdown: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 20,
    flexDirection: "row",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  countdownText: { color: colors.controlSelected, fontSize: 13 },
  price: { fontSize: 24, fontWeight: "600" },
  componentLine: { flexDirection: "row", justifyContent: "space-between" },
  component: { fontSize: 13 },
  componentIdentity: { alignItems: "center", flexDirection: "row", gap: 4 },
  muted: { opacity: 0.35 },
  seller: {
    borderTopColor: colors.background,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 4,
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  sellerName: { ...typography.body, marginRight: 4 },
  small: { fontSize: 13 },
  match: {
    backgroundColor: "#938EE8",
    borderRadius: 20,
    flexDirection: "row",
    gap: 4,
    alignItems: "center",
    marginLeft: 2,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  matchText: { color: colors.controlSelected, fontSize: 12 },
});
