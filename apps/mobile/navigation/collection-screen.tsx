import { colors, spacing } from "@geek/design-tokens";
import type { AlbumSummary } from "@geek/domain";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { CompositeScreenProps } from "@react-navigation/native";
import { useFocusEffect } from "@react-navigation/native";
import type {
  NativeStackNavigationProp,
  NativeStackScreenProps,
} from "@react-navigation/native-stack";
import { useCallback, useLayoutEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import MY_ASTERIX from "../assets/collection/v2/my-asterix.png";
import MY_CHRONO_TRIGGER from "../assets/collection/v2/my-chrono-trigger.png";
import MY_GOLDENEYE from "../assets/collection/v2/my-goldeneye.png";
import MY_MARIO_KART from "../assets/collection/v2/my-mario-kart.png";
import MY_MARIO_WORLD from "../assets/collection/v2/my-mario-world.png";
import MY_MARIO_WORLD_COVER from "../assets/collection/v2/my-mario-world-cover.png";
import MY_PERFECT_DARK from "../assets/collection/v2/my-perfect-dark.png";
import MY_SUPER_METROID from "../assets/collection/v2/my-super-metroid.png";
import { CollectionHeader } from "../ui/collection-header";
import { AlbumCard } from "../ui/album-card";
import { GameGridItem, type GridItem } from "../ui/game-grid-item";
import { CollectionSegmentedControl, type CollectionSegment } from "../ui/segmented-control";
import {
  loadCanonicalAlbums,
  loadCanonicalWishlist,
  toggleWishlistIntent,
  type CanonicalWishlistItem,
} from "./collection-surfaces-data";
import { loadCanonicalCollection, type CanonicalCollectionItem } from "./ownership-data";
import type { MainTabParamList, RootStackParamList } from "./types";

type CollectionRouteProps = NativeStackScreenProps<RootStackParamList, "Collection">;
type MyCollectionProps = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, "Collection">,
  NativeStackScreenProps<RootStackParamList>
>;

export const MY_GAMES: readonly GridItem[] = [
  {
    copyId: "10000000-0000-0000-0000-000000000101",
    gameId: "00000000-0000-0000-0000-000000000101",
    title: "Asterix",
    image: MY_ASTERIX,
    platform: "SNES",
    photoRoles: ["cartridge", "box"],
  },
  {
    copyId: "10000000-0000-0000-0000-000000000102",
    gameId: "00000000-0000-0000-0000-000000000102",
    title: "Super Mario World",
    image: MY_MARIO_WORLD_COVER,
    platform: "SNES",
    photoRoles: ["cartridge"],
    overlay: "photo",
  },
  {
    copyId: "10000000-0000-0000-0000-000000000103",
    gameId: "00000000-0000-0000-0000-000000000103",
    title: "Chrono Trigger",
    image: MY_CHRONO_TRIGGER,
    platform: "SNES",
    photoRoles: ["cartridge"],
  },
  {
    copyId: "10000000-0000-0000-0000-000000000104",
    gameId: "00000000-0000-0000-0000-000000000104",
    title: "Super Metroid",
    image: MY_SUPER_METROID,
    platform: "SNES",
    photoRoles: ["cartridge"],
  },
  {
    copyId: "10000000-0000-0000-0000-000000000105",
    gameId: "00000000-0000-0000-0000-000000000105",
    title: "Super Mario World",
    image: MY_MARIO_WORLD,
    platform: "SNES",
    photoRoles: ["cartridge"],
  },
  {
    copyId: "10000000-0000-0000-0000-000000000106",
    gameId: "00000000-0000-0000-0000-000000000106",
    title: "Super Mario Kart",
    image: MY_MARIO_KART,
    platform: "SNES",
    photoRoles: ["cartridge"],
  },
  {
    copyId: "10000000-0000-0000-0000-000000000107",
    gameId: "00000000-0000-0000-0000-000000000107",
    title: "Goldeneye",
    image: MY_GOLDENEYE,
    platform: "N64",
    photoRoles: ["cartridge"],
  },
  {
    copyId: "10000000-0000-0000-0000-000000000108",
    gameId: "00000000-0000-0000-0000-000000000108",
    title: "Perfect Dark",
    image: MY_PERFECT_DARK,
    platform: "N64",
    photoRoles: ["cartridge"],
  },
];

export function MyCollectionScreen({ navigation }: MyCollectionProps) {
  const rootNavigation = navigation.getParent<NativeStackNavigationProp<RootStackParamList>>();
  return (
    <CollectionView
      onOpenCopy={(copyId) => rootNavigation?.navigate("Copy", { copyId })}
      onOpenGame={(gameId, editionId) =>
        editionId
          ? rootNavigation?.navigate("Market", { gameId, editionId })
          : rootNavigation?.navigate("Game", { gameId })
      }
      onOpenAlbum={(albumId) => rootNavigation?.navigate("AlbumDetail", { albumId })}
    />
  );
}

export function CollectionScreen({ navigation }: CollectionRouteProps) {
  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  return (
    <CollectionView
      onOpenCopy={(copyId) => navigation.navigate("Copy", { copyId })}
      onOpenGame={(gameId, editionId) =>
        editionId
          ? navigation.navigate("Market", { gameId, editionId })
          : navigation.navigate("Game", { gameId })
      }
      onOpenAlbum={(albumId) => navigation.navigate("AlbumDetail", { albumId })}
    />
  );
}

function CollectionView({
  onOpenCopy,
  onOpenGame,
  onOpenAlbum,
}: {
  readonly onOpenCopy: (copyId: string) => void;
  readonly onOpenGame: (gameId: string, editionId?: string) => void;
  readonly onOpenAlbum: (albumId: string) => void;
}) {
  const [segment, setSegment] = useState<CollectionSegment>("games");
  const [albumMode, setAlbumMode] = useState(false);
  const collection = useCanonicalCollection();
  const wishlist = useCanonicalWishlist();

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      {albumMode ? (
        <AlbumsList onAlbumModeChange={setAlbumMode} onOpenAlbum={onOpenAlbum} />
      ) : (
        <CollectionGrid
          onAlbumModeChange={setAlbumMode}
          onOpenCopy={onOpenCopy}
          onOpenGame={onOpenGame}
          onSelectSegment={setSegment}
          ownedItems={collection.items}
          ownershipStatus={collection.status}
          segment={segment}
          wishlistItems={wishlist.items}
          wishlistStatus={wishlist.status}
          onRemoveWishlist={wishlist.remove}
        />
      )}
    </SafeAreaView>
  );
}

function AlbumsList({
  onAlbumModeChange,
  onOpenAlbum,
}: {
  readonly onAlbumModeChange: (value: boolean) => void;
  readonly onOpenAlbum: (albumId: string) => void;
}) {
  const albums = useCanonicalAlbums();
  return (
    <FlatList
      contentContainerStyle={styles.albumContent}
      data={albums.items}
      keyExtractor={({ id }) => id}
      ListHeaderComponent={<CollectionHeader albumMode onAlbumModeChange={onAlbumModeChange} />}
      ListEmptyComponent={<CollectionSurfaceState kind="albums" status={albums.status} />}
      renderItem={({ item }) => <AlbumCard album={item} onPress={() => onOpenAlbum(item.id)} />}
      showsVerticalScrollIndicator={false}
    />
  );
}

function CollectionGrid({
  onAlbumModeChange,
  onOpenCopy,
  onOpenGame,
  onRemoveWishlist,
  onSelectSegment,
  ownedItems,
  ownershipStatus,
  segment,
  wishlistItems,
  wishlistStatus,
}: {
  readonly onAlbumModeChange: (value: boolean) => void;
  readonly onOpenCopy: (copyId: string) => void;
  readonly onOpenGame: (gameId: string, editionId?: string) => void;
  readonly onRemoveWishlist: (item: CanonicalWishlistItem) => void;
  readonly onSelectSegment: (segment: CollectionSegment) => void;
  readonly ownedItems: readonly CanonicalCollectionItem[];
  readonly ownershipStatus: "error" | "loading" | "ready";
  readonly segment: CollectionSegment;
  readonly wishlistItems: readonly CanonicalWishlistItem[];
  readonly wishlistStatus: SurfaceStatus;
}) {
  const { width: screenWidth } = useWindowDimensions();
  const items: readonly (CanonicalCollectionItem | CanonicalWishlistItem)[] =
    segment === "games" ? ownedItems : wishlistItems;
  const tileWidth = (screenWidth - spacing.page * 2 - spacing.compact) / 2;

  return (
    <FlatList
      accessibilityLabel={segment === "games" ? "Mes jeux" : "Wishlist"}
      columnWrapperStyle={styles.gridRow}
      contentContainerStyle={styles.content}
      data={items}
      keyExtractor={(item) => ("intentId" in item ? item.intentId : item.copyId)}
      ListHeaderComponent={
        <View style={styles.topContent}>
          <CollectionHeader albumMode={false} onAlbumModeChange={onAlbumModeChange} />
          <CollectionSegmentedControl
            ownedCount={ownedItems.length}
            wishlistCount={wishlistItems.length}
            selected={segment}
            onSelect={onSelectSegment}
          />
        </View>
      }
      numColumns={2}
      ListEmptyComponent={
        <CollectionSurfaceState
          kind={segment === "games" ? "collection" : "wishlist"}
          status={segment === "games" ? ownershipStatus : wishlistStatus}
        />
      }
      renderItem={({ item }) => (
        <GameGridItem
          isWishlist={segment === "wishlist"}
          item={item}
          owned={"owned" in item ? item.owned : false}
          wanted={"intentId" in item}
          onWantedPress={"intentId" in item ? () => onRemoveWishlist(item) : undefined}
          onPress={() =>
            segment === "games" && item.copyId
              ? onOpenCopy(item.copyId)
              : onOpenGame(item.gameId, item.editionId)
          }
          width={tileWidth}
        />
      )}
      showsVerticalScrollIndicator={false}
      style={styles.page}
    />
  );
}

function useCanonicalCollection(): {
  readonly items: readonly CanonicalCollectionItem[];
  readonly status: "error" | "loading" | "ready";
} {
  const [state, setState] = useState<{
    readonly items: readonly CanonicalCollectionItem[];
    readonly status: "error" | "loading" | "ready";
  }>({ items: [], status: "loading" });

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void loadCanonicalCollection()
        .then((result) => {
          if (!active) return;
          setState(
            result.outcome === "ok"
              ? { items: result.data.items, status: "ready" }
              : { items: [], status: "error" },
          );
        })
        .catch(() => {
          if (active) setState({ items: [], status: "error" });
        });
      return () => {
        active = false;
      };
    }, []),
  );

  return state;
}

type SurfaceStatus = "error" | "loading" | "ready";

function CollectionSurfaceState({
  kind,
  status,
}: {
  readonly kind: "albums" | "collection" | "wishlist";
  readonly status: SurfaceStatus;
}) {
  if (status === "loading") {
    return (
      <View style={styles.collectionState}>
        <ActivityIndicator color={colors.text} />
      </View>
    );
  }

  return (
    <View style={styles.collectionState}>
      <Text style={styles.collectionStateText}>
        {status === "error"
          ? `Impossible de charger ${kind === "albums" ? "les albums" : kind === "wishlist" ? "votre Wishlist" : "votre collection"}.`
          : kind === "albums"
            ? "Aucun album publié pour le moment."
            : kind === "wishlist"
              ? "Votre Wishlist est vide."
              : "Votre collection est vide."}
      </Text>
    </View>
  );
}

function useCanonicalWishlist(): {
  readonly items: readonly CanonicalWishlistItem[];
  readonly status: SurfaceStatus;
  readonly remove: (item: CanonicalWishlistItem) => void;
} {
  const [state, setState] = useState<{
    readonly items: readonly CanonicalWishlistItem[];
    readonly status: SurfaceStatus;
  }>({ items: [], status: "loading" });

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void loadCanonicalWishlist()
        .then((result) => {
          if (!active) return;
          setState(
            result.outcome === "ok"
              ? { items: result.data, status: "ready" }
              : { items: [], status: "error" },
          );
        })
        .catch(() => {
          if (active) setState({ items: [], status: "error" });
        });
      return () => {
        active = false;
      };
    }, []),
  );

  const remove = useCallback((item: CanonicalWishlistItem) => {
    setState((current) => ({
      ...current,
      items: current.items.filter(({ intentId }) => intentId !== item.intentId),
    }));
    void toggleWishlistIntent({
      gameId: item.gameId,
      ...(item.editionId ? { editionId: item.editionId } : {}),
      intentId: item.intentId,
    })
      .then((removed) => {
        if (removed) return;
        void loadCanonicalWishlist().then((result) => {
          setState(
            result.outcome === "ok"
              ? { items: result.data, status: "ready" }
              : { items: [], status: "error" },
          );
        });
      })
      .catch(() => {
        void loadCanonicalWishlist().then((result) => {
          setState(
            result.outcome === "ok"
              ? { items: result.data, status: "ready" }
              : { items: [], status: "error" },
          );
        });
      });
  }, []);

  return { ...state, remove };
}

function useCanonicalAlbums(): {
  readonly items: readonly AlbumSummary[];
  readonly status: SurfaceStatus;
} {
  const [state, setState] = useState<{
    readonly items: readonly AlbumSummary[];
    readonly status: SurfaceStatus;
  }>({ items: [], status: "loading" });
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void loadCanonicalAlbums()
        .then((result) => {
          if (!active) return;
          setState(
            result.outcome === "ok"
              ? { items: result.data, status: "ready" }
              : { items: [], status: "error" },
          );
        })
        .catch(() => {
          if (active) setState({ items: [], status: "error" });
        });
      return () => {
        active = false;
      };
    }, []),
  );
  return state;
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  page: { backgroundColor: colors.background },
  content: {
    gap: spacing.compact,
    paddingBottom: 112,
    paddingHorizontal: spacing.page,
  },
  topContent: { gap: spacing.page, marginBottom: spacing.micro },
  gridRow: { gap: spacing.compact, justifyContent: "space-between", width: "100%" },
  albumContent: { gap: spacing.compact, paddingBottom: 112, paddingHorizontal: spacing.page },
  collectionState: { alignItems: "center", paddingVertical: 48 },
  collectionStateText: { color: colors.textSecondary, textAlign: "center" },
});
