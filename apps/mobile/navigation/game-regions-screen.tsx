import { colors, radii, spacing, typography } from "@geek/design-tokens";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { FlatList, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import FRANCE_FLAG from "../assets/collection/v2/icon-france.png";
import { AddGameToolbar } from "../ui/add-game-toolbar";
import {
  getCatalogGame,
  getGameRegionVariants,
  getPlatform,
  type GameRegionVariant,
} from "./add-game-fixtures";
import type { RootStackParamList } from "./types";

type Props = NativeStackScreenProps<RootStackParamList, "GameRegions">;

export function GameRegionsScreen({ navigation, route }: Props) {
  const game = getCatalogGame(route.params.gameId);
  const platform = getPlatform(route.params.platformId);
  const variants = getGameRegionVariants(game.id, platform.id);
  return (
    <SafeAreaView edges={["top"]} style={styles.page}>
      <AddGameToolbar mode="back" onPress={navigation.goBack} title={game.title} />
      <FlatList
        contentContainerStyle={styles.content}
        data={variants}
        keyExtractor={({ editionId }) => editionId}
        renderItem={({ item }) => (
          <GameRegionRow
            item={item}
            platformName={platform.name}
            onPress={() =>
              navigation.navigate("Market", { gameId: item.gameId, editionId: item.editionId })
            }
          />
        )}
      />
    </SafeAreaView>
  );
}

function GameRegionRow({
  item,
  onPress,
  platformName,
}: {
  readonly item: GameRegionVariant;
  readonly onPress: () => void;
  readonly platformName: string;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <Image source={item.artwork} style={styles.artwork} />
      <View style={styles.copy}>
        <Text numberOfLines={2} style={styles.title}>
          {item.title}
        </Text>
        <View style={styles.meta}>
          <Image source={FRANCE_FLAG} style={styles.flag} />
          <Text style={styles.platform}>
            {item.region} · {platformName}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: colors.background, flex: 1 },
  content: { paddingBottom: 32, paddingTop: spacing.compact },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 15,
    minHeight: 78,
    paddingHorizontal: spacing.page,
    paddingVertical: spacing.micro,
  },
  pressed: { opacity: 0.65 },
  artwork: { borderRadius: radii.wishlistImage, height: 70, width: 70 },
  copy: { flex: 1, gap: spacing.micro },
  title: { ...typography.body, color: colors.text, fontWeight: "600" },
  meta: { alignItems: "center", flexDirection: "row", gap: spacing.micro },
  flag: { borderRadius: 8, height: 16, width: 16 },
  platform: { ...typography.metadata, color: colors.textSecondary },
});
