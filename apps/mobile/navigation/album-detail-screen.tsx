import { colors, spacing, typography } from "@geek/design-tokens";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
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

import { AdaptiveGlassSurface } from "../ui/adaptive-glass-surface";
import { GameGridItem } from "../ui/game-grid-item";
import { GeekIcon } from "../ui/geek-icon";
import { SegmentedControl } from "../ui/segmented-control";
import { getAlbumTheme } from "./album-theme";
import { loadCanonicalAlbumDetail, type CanonicalAlbumDetail } from "./collection-surfaces-data";
import type { RootStackParamList } from "./types";

type Props = NativeStackScreenProps<RootStackParamList, "AlbumDetail">;
type Filter = "owned" | "missing" | "wanted";
type LoadState =
  | { readonly status: "loading" }
  | { readonly status: "error" }
  | { readonly status: "ready"; readonly data: CanonicalAlbumDetail };

export function AlbumDetailScreen({ navigation, route }: Props) {
  const [filter, setFilter] = useState<Filter>("owned");
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const { width } = useWindowDimensions();
  const tileWidth = (width - spacing.page * 2 - spacing.compact) / 2;

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void loadCanonicalAlbumDetail(route.params.albumId)
        .then((result) => {
          if (!active) return;
          setState(
            result.outcome === "ok" ? { status: "ready", data: result.data } : { status: "error" },
          );
        })
        .catch(() => {
          if (active) setState({ status: "error" });
        });
      return () => {
        active = false;
      };
    }, [route.params.albumId]),
  );

  if (state.status !== "ready") {
    return (
      <SafeAreaView edges={["top"]} style={styles.statePage}>
        <View style={styles.stateToolbar}>
          <Pressable accessibilityLabel="Retour" onPress={navigation.goBack}>
            <AdaptiveGlassSurface style={styles.toolbarButton}>
              <GeekIcon name="chevron-left" />
            </AdaptiveGlassSurface>
          </Pressable>
        </View>
        <View style={styles.stateBody}>
          {state.status === "loading" ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <Text style={styles.stateText}>Impossible de charger cet album.</Text>
          )}
        </View>
      </SafeAreaView>
    );
  }

  const { album, items } = state.data;
  const theme = getAlbumTheme(album);
  const counts = album.progress;

  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <Svg height="100%" width="100%">
              <Defs>
                <LinearGradient id="detail" x1="0" x2="1" y1="0" y2="1">
                  <Stop offset="0" stopColor={theme.colors[0]} />
                  <Stop offset="1" stopColor={theme.colors[1]} />
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
              {theme.logo ? (
                <View pointerEvents="none" style={styles.heroLogoWrap}>
                  <Image resizeMode="contain" source={theme.logo} style={styles.heroLogo} />
                </View>
              ) : null}
            </View>
            <View style={styles.heroCopy}>
              <Text style={[styles.heroTitle, { fontFamily: theme.fontFamily }]}>
                {album.title}
              </Text>
              <Text style={styles.heroSubtitle}>
                {counts.ownedSlots}/{counts.totalSlots} jeux
              </Text>
            </View>
          </SafeAreaView>
        </View>
        <View style={styles.body}>
          <SegmentedControl
            onSelect={setFilter}
            options={[
              { id: "owned", label: `Possédés ${counts.ownedSlots}` },
              { id: "missing", label: `Manquants ${counts.missingSlots}` },
              { id: "wanted", label: `Recherchés ${counts.wantedSlots}` },
            ]}
            selected={filter}
          />
          <View style={styles.grid}>
            {items.map((item) => (
              <GameGridItem
                imageOpacity={item.owned ? 1 : 0.2}
                isWishlist={false}
                item={item}
                key={item.entryId}
                onPress={() =>
                  item.editionId
                    ? navigation.navigate("Market", {
                        gameId: item.gameId,
                        editionId: item.editionId,
                      })
                    : navigation.navigate("Game", { gameId: item.gameId })
                }
                showOpportunity
                slotNumber={item.owned ? undefined : String(item.position).padStart(2, "0")}
                wanted={item.wanted}
                width={tileWidth}
              />
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: colors.background, flex: 1 },
  statePage: { backgroundColor: colors.background, flex: 1 },
  stateToolbar: { paddingHorizontal: spacing.page, paddingTop: spacing.micro },
  stateBody: { alignItems: "center", flex: 1, justifyContent: "center", padding: spacing.page },
  stateText: { ...typography.body, color: colors.textSecondary, textAlign: "center" },
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
