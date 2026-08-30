import { getMyReciprocalTradeMatches } from "@geek/data";
import { colors, radii, spacing, typography } from "@geek/design-tokens";
import type { AlbumSummary, ReciprocalTradeMatch } from "@geek/domain";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { supabase } from "../lib/supabase";
import { AddGameSearchField } from "../ui/add-game-search-field";
import { AlbumCard } from "../ui/album-card";
import { CatalogSearchHome } from "./add-game-search-screen";
import { loadCanonicalAlbums } from "./collection-surfaces-data";
import type { MainTabParamList, RootStackParamList } from "./types";

type DiscoverProps = BottomTabScreenProps<MainTabParamList, "Discover">;
type RootNavigation = NativeStackNavigationProp<RootStackParamList>;
type FeedState = "loading" | "ready" | "error";

export function DiscoverScreen({ navigation }: DiscoverProps) {
  const rootNavigation = requireRootNavigation(navigation);
  const [searchActive, setSearchActive] = useState(false);
  const [albums, setAlbums] = useState<readonly AlbumSummary[]>([]);
  const [matches, setMatches] = useState<readonly ReciprocalTradeMatch[]>([]);
  const [matchState, setMatchState] = useState<FeedState>("loading");

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setMatchState("loading");
      void loadCanonicalAlbums()
        .then((result) => {
          if (!active) return;
          setAlbums(result.outcome === "ok" ? result.data : []);
        })
        .catch(() => {
          if (active) setAlbums([]);
        });
      void getMyReciprocalTradeMatches(supabase, { limit: 20 })
        .then((result) => {
          if (!active) return;
          if (result.outcome === "ok") {
            setMatches(result.data.items);
            setMatchState("ready");
          } else {
            setMatches([]);
            setMatchState("error");
          }
        })
        .catch(() => {
          if (!active) return;
          setMatches([]);
          setMatchState("error");
        });
      return () => {
        active = false;
      };
    }, []),
  );

  useEffect(
    () =>
      navigation.addListener("blur", () => {
        Keyboard.dismiss();
        setSearchActive(false);
      }),
    [navigation],
  );

  if (searchActive) {
    return (
      <SafeAreaView edges={["top"]} style={styles.page}>
        <CatalogSearchHome
          autoFocus
          cancelLabel="Annuler"
          onCancel={() => setSearchActive(false)}
          onOpenPlatform={(platformId) => {
            Keyboard.dismiss();
            setSearchActive(false);
            rootNavigation.navigate("DiscoverCatalog", {
              screen: "PlatformCatalog",
              params: { platformId },
            });
          }}
          onOpenRegions={({ gameId, platformId }) => {
            Keyboard.dismiss();
            setSearchActive(false);
            rootNavigation.navigate("DiscoverCatalog", {
              screen: "GameRegions",
              params: { gameId, platformId },
            });
          }}
          prominent
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top"]} style={styles.page}>
      <FlatList
        contentContainerStyle={styles.content}
        data={matches}
        keyboardShouldPersistTaps="handled"
        keyExtractor={(item) => `${item.myIntentId}:${item.theirIntentId}`}
        ListHeaderComponent={
          <View style={styles.headerContent}>
            <View style={styles.fullBleedControl}>
              <Pressable
                accessibilityLabel="Rechercher un jeu"
                accessibilityRole="button"
                onPress={() => setSearchActive(true)}
              >
                <View
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  pointerEvents="none"
                >
                  <AddGameSearchField
                    prominent
                    onChangeText={() => undefined}
                    placeholder="Rechercher un jeu"
                    value=""
                  />
                </View>
              </Pressable>
            </View>
            <DiscoverFeedHeader
              albums={albums}
              showCompatibleCollectors={matches.length > 0}
              onOpenAlbum={(albumId) => rootNavigation.navigate("AlbumDetail", { albumId })}
            />
          </View>
        }
        ListEmptyComponent={
          <DiscoverEmptyState albumCount={albums.length} matchState={matchState} />
        }
        renderItem={({ item }) => (
          <TradeMatchRow
            match={item}
            onPress={() => rootNavigation.navigate("PublicProfile", { userId: item.collector.id })}
          />
        )}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

function DiscoverFeedHeader({
  albums,
  onOpenAlbum,
  showCompatibleCollectors,
}: {
  readonly albums: readonly AlbumSummary[];
  readonly onOpenAlbum: (albumId: string) => void;
  readonly showCompatibleCollectors: boolean;
}) {
  return albums.length > 0 || showCompatibleCollectors ? (
    <View style={styles.sectionContent}>
      <AlbumStrip albums={albums} onOpenAlbum={onOpenAlbum} title="À découvrir" />
      {showCompatibleCollectors ? (
        <Text style={styles.sectionTitle}>Collectors compatibles</Text>
      ) : null}
    </View>
  ) : null;
}

function DiscoverEmptyState({
  albumCount,
  matchState,
}: {
  readonly albumCount: number;
  readonly matchState: FeedState;
}) {
  if (albumCount > 0) return null;
  return (
    <RootState
      loading={matchState === "loading"}
      message={
        matchState === "error"
          ? "Impossible de charger les découvertes. Réessayez."
          : "Aucune découverte disponible pour le moment."
      }
    />
  );
}

function AlbumStrip({
  albums,
  onOpenAlbum,
  title,
}: {
  readonly albums: readonly AlbumSummary[];
  readonly onOpenAlbum: (albumId: string) => void;
  readonly title: string;
}) {
  if (albums.length === 0) return null;
  return (
    <View style={styles.sectionContent}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <ScrollView
        contentContainerStyle={styles.albumRow}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        {albums.map((album) => (
          <View key={album.id} style={styles.albumCard}>
            <AlbumCard album={album} onPress={() => onOpenAlbum(album.id)} />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function TradeMatchRow({
  match,
  onPress,
}: {
  readonly match: ReciprocalTradeMatch;
  readonly onPress: () => void;
}) {
  const name = match.collector.displayName ?? match.collector.username ?? "Collectionneur Geek";
  const avatarPath = match.collector.avatarPath;
  const avatarUri =
    avatarPath?.startsWith("http://") || avatarPath?.startsWith("https://") ? avatarPath : null;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.matchRow, pressed && styles.pressed]}
    >
      {avatarUri ? (
        <Image source={{ uri: avatarUri }} style={styles.matchAvatar} />
      ) : (
        <View style={[styles.matchAvatar, styles.matchAvatarFallback]}>
          <Text style={styles.matchInitial}>{name.slice(0, 1).toLocaleUpperCase()}</Text>
        </View>
      )}
      <View style={styles.matchCopy}>
        <Text numberOfLines={1} style={styles.matchName}>
          {name}
        </Text>
        <Text style={styles.matchDetail}>Vous voulez le sien · cette personne veut le vôtre</Text>
        <Text style={styles.matchDistance}>{distanceLabel(match.nearby.distanceBucket)}</Text>
      </View>
    </Pressable>
  );
}

function RootState({
  loading = false,
  message,
}: {
  readonly loading?: boolean;
  readonly message: string;
}) {
  return (
    <View style={styles.state}>
      {loading ? <ActivityIndicator color={colors.text} /> : null}
      <Text style={styles.stateText}>{message}</Text>
    </View>
  );
}

function requireRootNavigation(navigation: DiscoverProps["navigation"]): RootNavigation {
  const root = navigation.getParent<RootNavigation>();
  if (!root) throw new Error("Discover must be mounted under the application stack.");
  return root;
}

function distanceLabel(bucket: ReciprocalTradeMatch["nearby"]["distanceBucket"]): string {
  switch (bucket) {
    case "under_2_km":
      return "À moins de 2 km";
    case "2_to_5_km":
      return "Entre 2 et 5 km";
    case "5_to_10_km":
      return "Entre 5 et 10 km";
    case "10_to_25_km":
      return "Entre 10 et 25 km";
    case "25_to_50_km":
      return "Entre 25 et 50 km";
    case "50_to_100_km":
      return "Entre 50 et 100 km";
    case "100_to_200_km":
      return "Entre 100 et 200 km";
  }
}

const styles = StyleSheet.create({
  page: { backgroundColor: colors.background, flex: 1 },
  content: { flexGrow: 1, paddingBottom: 112 },
  headerContent: {
    gap: spacing.page,
    paddingBottom: spacing.page,
    paddingHorizontal: spacing.page,
  },
  sectionContent: { gap: spacing.compact },
  fullBleedControl: { marginHorizontal: -spacing.page },
  sectionTitle: { ...typography.sectionTitle, color: colors.text },
  albumRow: {
    gap: spacing.compact,
    marginHorizontal: -spacing.page,
    paddingHorizontal: spacing.page,
  },
  albumCard: { width: 280 },
  state: { alignItems: "center", gap: spacing.compact, padding: 48 },
  stateText: { ...typography.body, color: colors.textSecondary, textAlign: "center" },
  matchRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.medium,
    minHeight: 84,
    paddingHorizontal: spacing.page,
    paddingVertical: spacing.compact,
  },
  matchAvatar: { borderRadius: radii.capsule, height: 52, width: 52 },
  matchAvatarFallback: {
    alignItems: "center",
    backgroundColor: colors.navigationSelected,
    justifyContent: "center",
  },
  matchInitial: { color: colors.text, fontSize: 18, fontWeight: "700" },
  matchCopy: { flex: 1, gap: spacing.micro, minWidth: 0 },
  matchName: { ...typography.body, color: colors.text, fontWeight: "600" },
  matchDetail: { ...typography.metadata, color: colors.text },
  matchDistance: { ...typography.metadata, color: colors.textSecondary },
  pressed: { opacity: 0.65 },
});
