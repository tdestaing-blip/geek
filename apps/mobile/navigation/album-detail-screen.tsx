import { colors, spacing, typography } from "@geek/design-tokens";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import SNES_LOGO from "../assets/game-detail/owned/album-mark.png";
import { AdaptiveGlassSurface } from "../ui/adaptive-glass-surface";
import { GameGridItem, type GameGridItemContent } from "../ui/game-grid-item";
import { GeekIcon } from "../ui/geek-icon";
import { SegmentedControl } from "../ui/segmented-control";
import { SNES_ESSENTIAL_ENTRIES, getAlbumFixture } from "./album-fixtures";
import type { RootStackParamList } from "./types";

type Props = NativeStackScreenProps<RootStackParamList, "AlbumDetail">;
type Filter = "owned" | "missing" | "wanted";

export function AlbumDetailScreen({ navigation, route }: Props) {
  const album = getAlbumFixture(route.params.albumId);
  const [filter, setFilter] = useState<Filter>("owned");
  const { width } = useWindowDimensions();
  const tileWidth = (width - spacing.page * 2 - spacing.compact) / 2;
  const counts = {
    owned: SNES_ESSENTIAL_ENTRIES.filter(({ owned }) => owned).length,
    missing: SNES_ESSENTIAL_ENTRIES.filter(({ owned, wanted }) => !owned && !wanted).length,
    wanted: SNES_ESSENTIAL_ENTRIES.filter(({ owned, wanted }) => wanted && !owned).length,
  };

  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <Svg height="100%" width="100%">
              <Defs>
                <LinearGradient id="detail" x1="0" x2="1" y1="0" y2="1">
                  <Stop offset="0" stopColor={album.colors[0]} />
                  <Stop offset="1" stopColor={album.colors[1]} />
                </LinearGradient>
              </Defs>
              <Rect fill="url(#detail)" height="100%" width="100%" />
            </Svg>
          </View>
          <SafeAreaView edges={["top"]} style={styles.safeHero}>
            <View style={styles.toolbar}>
              <Pressable
                accessibilityLabel="Retour"
                onPress={navigation.goBack}
                style={styles.toolbarControl}
              >
                <AdaptiveGlassSurface style={styles.toolbarButton}>
                  <GeekIcon name="chevron-left" />
                </AdaptiveGlassSurface>
              </Pressable>
              <Pressable
                accessibilityLabel="Plus d’options"
                onPress={() => undefined}
                style={styles.toolbarControl}
              >
                <AdaptiveGlassSurface style={styles.toolbarButton}>
                  <GeekIcon name="more-horizontal" />
                </AdaptiveGlassSurface>
              </Pressable>
              <View pointerEvents="none" style={styles.heroLogoWrap}>
                <Image resizeMode="contain" source={SNES_LOGO} style={styles.heroLogo} />
              </View>
            </View>
            <View style={styles.heroCopy}>
              <Text style={styles.heroTitle}>Essentials</Text>
              <Text style={styles.heroSubtitle}>
                {counts.owned}/{SNES_ESSENTIAL_ENTRIES.length} jeux
              </Text>
            </View>
          </SafeAreaView>
        </View>
        <View style={styles.body}>
          <SegmentedControl
            onSelect={setFilter}
            options={[
              { id: "owned", label: `Possédés ${counts.owned}` },
              { id: "missing", label: `Manquants ${counts.missing}` },
              { id: "wanted", label: `Recherchés ${counts.wanted}` },
            ]}
            selected={filter}
          />
          <View style={styles.grid}>
            {SNES_ESSENTIAL_ENTRIES.map((entry, index) => {
              const position = index + 1;
              const item: GameGridItemContent = {
                image: entry.image,
                title: entry.title,
                platform: "SNES",
                components: entry.components,
                opportunities: entry.networkCount,
                overlay: entry.price ? "sale" : undefined,
              };

              return (
                <GameGridItem
                  imageOpacity={entry.owned ? 1 : 0.2}
                  isWishlist={false}
                  item={item}
                  key={entry.id}
                  platformLabel="Super Nintendo"
                  showOpportunity={entry.networkCount !== undefined}
                  slotNumber={entry.owned ? undefined : String(position).padStart(2, "0")}
                  wanted={entry.wanted}
                  width={tileWidth}
                />
              );
            })}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: colors.background, flex: 1 },
  content: { paddingBottom: 32 },
  hero: { height: 202, overflow: "hidden" },
  safeHero: { flex: 1, justifyContent: "space-between" },
  toolbar: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginHorizontal: spacing.page,
    marginTop: spacing.micro,
    position: "relative",
  },
  toolbarButton: {
    alignItems: "center",
    borderRadius: 22,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  toolbarControl: { zIndex: 1 },
  heroLogoWrap: {
    height: 111,
    position: "absolute",
    right: 0,
    top: spacing.micro,
    width: 136,
  },
  heroLogo: { height: "100%", width: "100%" },
  heroCopy: { marginHorizontal: spacing.page, paddingBottom: spacing.page },
  heroTitle: {
    color: colors.controlSelected,
    fontSize: 32,
    fontWeight: "700",
    lineHeight: 38,
  },
  heroSubtitle: {
    ...typography.body,
    color: colors.controlSelected,
    marginTop: spacing.hairline,
  },
  body: { gap: spacing.page, paddingHorizontal: spacing.page, paddingTop: spacing.page },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.compact },
});
