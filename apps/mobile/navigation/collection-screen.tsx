import { colors, spacing } from "@geek/design-tokens";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { CompositeScreenProps } from "@react-navigation/native";
import type {
  NativeStackNavigationProp,
  NativeStackScreenProps,
} from "@react-navigation/native-stack";
import { useLayoutEffect, useState } from "react";
import { FlatList, StyleSheet, useWindowDimensions, View } from "react-native";
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
import { GameGridItem, type GridItem } from "../ui/game-grid-item";
import { CollectionSegmentedControl, type CollectionSegment } from "../ui/segmented-control";
import { WISHLIST_MARKET_TARGETS } from "./marketplace-fixtures";
import type { MainTabParamList, RootStackParamList } from "./types";

type CollectionRouteProps = NativeStackScreenProps<RootStackParamList, "Collection">;
type MyCollectionProps = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, "Collection">,
  NativeStackScreenProps<RootStackParamList>
>;

const MY_GAMES: readonly GridItem[] = [
  {
    copyId: "10000000-0000-0000-0000-000000000101",
    gameId: "00000000-0000-0000-0000-000000000101",
    title: "Asterix",
    image: MY_ASTERIX,
    platform: "SNES",
    components: ["gamepad", "box"],
    overlay: "sale",
  },
  {
    copyId: "10000000-0000-0000-0000-000000000102",
    gameId: "00000000-0000-0000-0000-000000000102",
    title: "Super Mario World",
    image: MY_MARIO_WORLD_COVER,
    platform: "SNES",
    components: ["gamepad"],
    overlay: "photo",
  },
  {
    copyId: "10000000-0000-0000-0000-000000000103",
    gameId: "00000000-0000-0000-0000-000000000103",
    title: "Chrono Trigger",
    image: MY_CHRONO_TRIGGER,
    platform: "SNES",
    components: ["gamepad"],
  },
  {
    copyId: "10000000-0000-0000-0000-000000000104",
    gameId: "00000000-0000-0000-0000-000000000104",
    title: "Super Metroid",
    image: MY_SUPER_METROID,
    platform: "SNES",
    components: ["gamepad"],
  },
  {
    copyId: "10000000-0000-0000-0000-000000000105",
    gameId: "00000000-0000-0000-0000-000000000105",
    title: "Super Mario World",
    image: MY_MARIO_WORLD,
    platform: "SNES",
    components: ["gamepad"],
  },
  {
    copyId: "10000000-0000-0000-0000-000000000106",
    gameId: "00000000-0000-0000-0000-000000000106",
    title: "Super Mario Kart",
    image: MY_MARIO_KART,
    platform: "SNES",
    components: ["gamepad"],
  },
  {
    copyId: "10000000-0000-0000-0000-000000000107",
    gameId: "00000000-0000-0000-0000-000000000107",
    title: "Goldeneye",
    image: MY_GOLDENEYE,
    platform: "N64",
    components: ["gamepad"],
  },
  {
    copyId: "10000000-0000-0000-0000-000000000108",
    gameId: "00000000-0000-0000-0000-000000000108",
    title: "Perfect Dark",
    image: MY_PERFECT_DARK,
    platform: "N64",
    components: ["gamepad"],
  },
];

const WISHLIST = WISHLIST_MARKET_TARGETS;

export function MyCollectionScreen({ navigation }: MyCollectionProps) {
  const rootNavigation = navigation.getParent<NativeStackNavigationProp<RootStackParamList>>();
  return (
    <CollectionView
      onOpenCopy={(copyId) => rootNavigation?.navigate("Copy", { copyId })}
      onOpenGame={(gameId, editionId) =>
        rootNavigation?.navigate("Market", {
          gameId,
          editionId,
        })
      }
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
        navigation.navigate("Market", {
          gameId,
          editionId,
        })
      }
    />
  );
}

function CollectionView({
  onOpenCopy,
  onOpenGame,
}: {
  readonly onOpenCopy: (copyId: string) => void;
  readonly onOpenGame: (gameId: string, editionId: string) => void;
}) {
  const { width: screenWidth } = useWindowDimensions();
  const [segment, setSegment] = useState<CollectionSegment>("games");
  const [albumMode, setAlbumMode] = useState(false);
  const items = segment === "games" ? MY_GAMES : WISHLIST;
  const tileWidth = (screenWidth - spacing.page * 2 - spacing.compact) / 2;

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <FlatList
        accessibilityLabel={segment === "games" ? "Mes jeux" : "Wishlist"}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={styles.content}
        data={items}
        keyExtractor={(item) => item.gameId}
        ListHeaderComponent={
          <View style={styles.topContent}>
            <CollectionHeader albumMode={albumMode} onAlbumModeChange={setAlbumMode} />
            <CollectionSegmentedControl selected={segment} onSelect={setSegment} />
          </View>
        }
        numColumns={2}
        renderItem={({ item }) => (
          <GameGridItem
            isWishlist={segment === "wishlist"}
            item={item}
            onPress={() =>
              segment === "games" && item.copyId
                ? onOpenCopy(item.copyId)
                : item.editionId
                  ? onOpenGame(item.gameId, item.editionId)
                  : undefined
            }
            width={tileWidth}
          />
        )}
        showsVerticalScrollIndicator={false}
        style={styles.page}
      />
    </SafeAreaView>
  );
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
});
