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
import WISH_DONKEY_KONG from "../assets/collection/v2/wish-donkey-kong.png";
import WISH_DONKEY_KONG_2 from "../assets/collection/v2/wish-donkey-kong-2.png";
import WISH_LINK_TO_PAST from "../assets/collection/v2/wish-link-to-past.png";
import WISH_MAJORAS_MASK from "../assets/collection/v2/wish-majoras-mask.png";
import WISH_YOSHI_ISLAND from "../assets/collection/v2/wish-yoshi-island.png";
import { CollectionHeader } from "../ui/collection-header";
import { GameGridItem, type GridItem } from "../ui/game-grid-item";
import { CollectionSegmentedControl, type CollectionSegment } from "../ui/segmented-control";
import type { MainTabParamList, RootStackParamList } from "./types";

type CollectionRouteProps = NativeStackScreenProps<RootStackParamList, "Collection">;
type MyCollectionProps = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, "Collection">,
  NativeStackScreenProps<RootStackParamList>
>;

const MY_GAMES: readonly GridItem[] = [
  fixture("101", "Asterix", MY_ASTERIX, "SNES", {
    components: ["gamepad", "box"],
    overlay: "sale",
  }),
  fixture("102", "Super Mario World", MY_MARIO_WORLD_COVER, "SNES", {
    components: ["gamepad"],
    overlay: "photo",
  }),
  fixture("103", "Chrono Trigger", MY_CHRONO_TRIGGER, "SNES", {
    components: ["gamepad"],
  }),
  fixture("104", "Super Metroid", MY_SUPER_METROID, "SNES", {
    components: ["gamepad"],
  }),
  fixture("105", "Super Mario World", MY_MARIO_WORLD, "SNES", {
    components: ["gamepad"],
  }),
  fixture("106", "Super Mario Kart", MY_MARIO_KART, "SNES", {
    components: ["gamepad"],
  }),
  fixture("107", "Goldeneye", MY_GOLDENEYE, "N64", {
    components: ["gamepad"],
  }),
  fixture("108", "Perfect Dark", MY_PERFECT_DARK, "N64", {
    components: ["gamepad"],
  }),
];

const WISHLIST: readonly GridItem[] = [
  fixture("201", "Zelda: Majora’s Mask", WISH_MAJORAS_MASK, "N64", {
    opportunities: 2,
    overlay: "bell",
  }),
  fixture("202", "Zelda: A Link to the Past", WISH_LINK_TO_PAST, "SNES", {
    opportunities: 2,
    overlay: "bell",
  }),
  fixture("203", "Donkey King Country", WISH_DONKEY_KONG, "SNES", {
    opportunities: 0,
    overlay: "bell",
  }),
  fixture("204", "Super Mario World: Yoshi Island", WISH_YOSHI_ISLAND, "SNES", {
    opportunities: 0,
    overlay: "bell",
  }),
  fixture("205", "Donkey King Country", WISH_DONKEY_KONG_2, "SNES", {
    opportunities: 0,
    overlay: "bell",
  }),
];

function fixture(
  suffix: string,
  title: string,
  image: GridItem["image"],
  platform: GridItem["platform"],
  details: Pick<GridItem, "components" | "opportunities" | "overlay">,
): GridItem {
  return {
    gameId: `00000000-0000-0000-0000-000000000${suffix}`,
    image,
    platform,
    title,
    ...details,
  };
}

export function MyCollectionScreen({ navigation }: MyCollectionProps) {
  const rootNavigation = navigation.getParent<NativeStackNavigationProp<RootStackParamList>>();
  return <CollectionView onOpenGame={(gameId) => rootNavigation?.navigate("Game", { gameId })} />;
}

export function CollectionScreen({ navigation }: CollectionRouteProps) {
  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  return <CollectionView onOpenGame={(gameId) => navigation.navigate("Game", { gameId })} />;
}

function CollectionView({ onOpenGame }: { readonly onOpenGame: (gameId: string) => void }) {
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
            onPress={() => onOpenGame(item.gameId)}
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
