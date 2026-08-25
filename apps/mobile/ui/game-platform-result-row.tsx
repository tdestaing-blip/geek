import { colors, radii, spacing, typography } from "@geek/design-tokens";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import type { GamePlatformSearchResult } from "../navigation/canonical-catalog";
import { GeekIcon } from "./geek-icon";

export function GamePlatformResultRow({
  item,
  onPress,
}: {
  readonly item: GamePlatformSearchResult;
  readonly onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      {item.artworkUrl ? (
        <Image source={{ uri: item.artworkUrl }} style={styles.artwork} />
      ) : (
        <View style={[styles.artwork, styles.placeholder]}>
          <GeekIcon color={colors.textSecondary} name="gamepad" size={28} />
        </View>
      )}
      <View style={styles.copy}>
        <Text numberOfLines={2} style={styles.title}>
          {item.title}
        </Text>
        <View style={styles.meta}>
          <View style={styles.count}>
            <Text style={styles.countText}>{item.editionCount}</Text>
          </View>
          <Text style={styles.platform}>{item.platformName}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
  placeholder: {
    alignItems: "center",
    backgroundColor: colors.surfaceSubtle,
    justifyContent: "center",
  },
  copy: { flex: 1, gap: spacing.micro },
  title: { ...typography.body, color: colors.text, fontWeight: "600" },
  meta: { alignItems: "center", flexDirection: "row", gap: spacing.micro },
  count: {
    alignItems: "center",
    backgroundColor: colors.control,
    borderRadius: 10,
    height: 18,
    justifyContent: "center",
    minWidth: 18,
    paddingHorizontal: spacing.micro,
  },
  countText: { color: colors.text, fontSize: 11, fontWeight: "600" },
  platform: { ...typography.metadata, color: colors.textSecondary },
});
