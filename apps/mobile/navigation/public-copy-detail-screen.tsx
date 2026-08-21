import { colors, radii, spacing, typography } from "@geek/design-tokens";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import FRANCE_FLAG from "../assets/collection/v2/icon-france.png";
import { AboutGameCard } from "../ui/about-game-card";
import { CopyComponentCard } from "../ui/copy-component-card";
import { DetailToolbar } from "../ui/detail-toolbar";
import { GeekIcon } from "../ui/geek-icon";
import { MetadataField } from "../ui/metadata-field";
import { StickyCommercialBar } from "../ui/sticky-commercial-bar";
import { resolvePublicCopyFixture } from "./marketplace-fixtures";
import type { RootStackParamList } from "./types";

type Props = NativeStackScreenProps<RootStackParamList, "PublicCopy">;

export function PublicCopyDetailScreen(props: Props) {
  return (
    <SafeAreaProvider>
      <PublicCopyContent {...props} />
    </SafeAreaProvider>
  );
}

function PublicCopyContent({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const heroSize = width - spacing.page * 2;
  const { copy, edition, game, opportunity } = resolvePublicCopyFixture(route.params.copyId);
  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <DetailToolbar title={game.title} onClose={navigation.goBack} onMore={() => undefined} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          opportunity && styles.contentWithBar,
          opportunity?.type === "auction" && styles.contentWithAuction,
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroGroup}>
          <View style={[styles.hero, { height: heroSize, width: heroSize }]}>
            <Image source={copy.photos[0]} style={styles.fill} />
            <View style={styles.dots}>
              <View style={styles.dotActive} />
              <View style={styles.dot} />
              <View style={styles.dot} />
              <View style={styles.dot} />
            </View>
          </View>
          <View style={styles.components}>
            {copy.components.map((component) => (
              <CopyComponentCard
                key={component.label}
                image={component.image}
                label={component.label}
                state={component.present ? "present" : "missing"}
              />
            ))}
          </View>
        </View>
        <View style={styles.heading}>
          <Text style={styles.title}>{game.title}</Text>
          <View style={styles.platformRow}>
            <Image source={FRANCE_FLAG} style={styles.flag} />
            <Text style={styles.platform}>{game.platform}</Text>
          </View>
        </View>
        <OwnerCard
          copy={copy}
          onPress={() => navigation.navigate("PublicProfile", { userId: copy.owner.id })}
        />
        <TradeCard opportunity={opportunity} />
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Édition</Text>
          <MetadataField label="Région / langue" value={edition.regionLanguage} />
          <MetadataField label="Sortie européenne" value={edition.releaseDate} />
          <MetadataField label="Code associé" value={edition.code} />
        </View>
        <AboutGameCard
          description={game.about.description}
          image={game.about.image}
          title={game.about.title}
        />
      </ScrollView>
      <StickyCommercialBar opportunity={opportunity} />
    </View>
  );
}

function OwnerCard({
  copy,
  onPress,
}: {
  readonly copy: ReturnType<typeof resolvePublicCopyFixture>["copy"];
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={`Voir le profil de ${copy.owner.name}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.owner, pressed && styles.ownerPressed]}
    >
      <View style={styles.ownerTop}>
        <View style={styles.identity}>
          <View>
            <Image source={copy.owner.avatar} style={styles.avatar} />
            <View style={styles.online} />
          </View>
          <View>
            <View style={styles.inline}>
              <Text style={styles.body}>À {copy.owner.name}</Text>
              <GeekIcon name="star" size={18} />
              <Text style={styles.small}>{copy.owner.rating}</Text>
              <GeekIcon name="map-pin" size={18} />
              <Text style={styles.small}>{copy.owner.distance}</Text>
            </View>
            <Text style={styles.small}>{copy.owner.collectionCount} jeux</Text>
          </View>
        </View>
        <Text style={styles.body}>{copy.story}</Text>
      </View>
      <View style={styles.wishlist}>
        <Text style={styles.body}>{copy.owner.wishlistTotal} jeux recherchés</Text>
        <View style={styles.coverStack}>
          {copy.owner.wishlistPreview.map((source, index) => (
            <Image
              key={index}
              source={source}
              style={[styles.cover, index > 0 && styles.coverOverlap]}
            />
          ))}
        </View>
      </View>
    </Pressable>
  );
}

function TradeCard({
  opportunity,
}: {
  readonly opportunity: ReturnType<typeof resolvePublicCopyFixture>["opportunity"];
}) {
  const reciprocalInterest =
    opportunity?.type === "listing" ? opportunity.reciprocalInterest : undefined;
  if (!reciprocalInterest) return null;

  return (
    <View style={styles.trade}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Svg height="100%" preserveAspectRatio="none" width="100%">
          <Defs>
            <LinearGradient id="trade" x1="0" x2="1" y1="0" y2="1">
              <Stop offset="0" stopColor="#92AEF4" />
              <Stop offset="1" stopColor="#8781DF" />
            </LinearGradient>
          </Defs>
          <Rect fill="url(#trade)" height="100%" width="100%" />
        </Svg>
      </View>
      <View style={styles.tradeTop}>
        <View>
          <View style={styles.tradeSignal}>
            <GeekIcon color={colors.controlSelected} name="fire" size={14} />
            <Text style={styles.tradeText}>
              {reciprocalInterest.gameCount} jeux l’intéresse chez toi
            </Text>
          </View>
          <Text style={styles.tradeValue}>Valeur estimé: {reciprocalInterest.estimatedValue}</Text>
        </View>
        <View style={styles.tradeCovers}>
          {reciprocalInterest.previewImages.map((source, index) => (
            <Image key={index} source={source} style={styles.tradeCover} />
          ))}
        </View>
      </View>
      <Pressable style={styles.tradeButton}>
        <GeekIcon name="chevrons-horizontal" size={20} />
        <Text style={styles.body}>Proposer un échange</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: colors.background, flex: 1 },
  content: { gap: 24, paddingBottom: 40 },
  contentWithBar: { paddingBottom: 136 },
  contentWithAuction: { paddingBottom: 168 },
  heroGroup: { gap: 16 },
  hero: { alignSelf: "center", borderRadius: radii.detailCard, overflow: "hidden" },
  fill: { height: "100%", width: "100%" },
  dots: {
    alignSelf: "center",
    backgroundColor: "rgba(255,255,255,.25)",
    borderRadius: 20,
    bottom: 12,
    flexDirection: "row",
    gap: 4,
    padding: 5,
    position: "absolute",
  },
  dot: { backgroundColor: "rgba(255,255,255,.45)", borderRadius: 4, height: 8, width: 8 },
  dotActive: { backgroundColor: colors.controlSelected, borderRadius: 4, height: 8, width: 8 },
  components: { flexDirection: "row", gap: 8, justifyContent: "center", paddingHorizontal: 16 },
  heading: { gap: 4, paddingHorizontal: 24 },
  title: { ...typography.screenTitle },
  platform: { ...typography.body },
  platformRow: { alignItems: "center", flexDirection: "row", gap: 4 },
  flag: { height: 16, width: 16 },
  owner: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: 16,
    marginHorizontal: 12,
    overflow: "hidden",
  },
  ownerPressed: { opacity: 0.72 },
  ownerTop: { gap: 16, padding: 12 },
  identity: { alignItems: "center", flexDirection: "row", gap: 12 },
  avatar: { borderRadius: 24, height: 48, width: 48 },
  online: {
    backgroundColor: colors.success,
    borderRadius: 8,
    bottom: 0,
    height: 12,
    position: "absolute",
    right: 0,
    width: 12,
  },
  inline: { alignItems: "center", flexDirection: "row", gap: 4 },
  body: { ...typography.body },
  small: { fontSize: 13 },
  wishlist: {
    alignItems: "center",
    borderTopColor: colors.background,
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 16,
  },
  coverStack: { flexDirection: "row" },
  cover: {
    borderColor: colors.controlSelected,
    borderRadius: 4,
    borderWidth: 1,
    height: 32,
    width: 43,
  },
  coverOverlap: { marginLeft: -8 },
  trade: { borderRadius: 16, gap: 16, marginHorizontal: 12, overflow: "hidden", padding: 16 },
  tradeTop: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  tradeText: { color: colors.controlSelected, fontSize: 15 },
  tradeSignal: { alignItems: "center", flexDirection: "row", gap: 4 },
  tradeValue: { color: colors.controlSelected, fontSize: 13, marginTop: 4 },
  tradeCovers: { flexDirection: "row" },
  tradeCover: { borderRadius: 4, height: 46, marginLeft: -4, width: 62 },
  tradeButton: {
    alignItems: "center",
    backgroundColor: colors.controlSelected,
    borderRadius: 999,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    padding: 12,
  },
  section: { gap: 16, paddingHorizontal: 24 },
  sectionTitle: { ...typography.sectionTitle },
});
