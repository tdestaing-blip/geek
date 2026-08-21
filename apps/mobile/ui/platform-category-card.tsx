import { colors, radii, spacing, typography } from "@geek/design-tokens";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import type { PlatformFixture } from "../navigation/add-game-fixtures";

export function PlatformCategoryCard({
  item,
  onPress,
  width,
}: {
  readonly item: PlatformFixture;
  readonly onPress: () => void;
  readonly width: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, { width }, pressed && styles.pressed]}
    >
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Svg height="100%" width="100%">
          <Defs>
            <LinearGradient id={`platform-${item.id}`} x1="0" x2="1" y1="0" y2="1">
              <Stop offset="0" stopColor={item.colors[0]} />
              <Stop offset="1" stopColor={item.colors[1]} />
            </LinearGradient>
          </Defs>
          <Rect fill={`url(#platform-${item.id})`} height="100%" width="100%" />
        </Svg>
      </View>
      <Text style={styles.label}>{item.shortName}</Text>
      <Image resizeMode="contain" source={item.image} style={styles.image} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderColor: colors.divider,
    borderRadius: radii.wishlistImage,
    borderWidth: 1,
    height: 113,
    overflow: "hidden",
    padding: spacing.medium,
  },
  pressed: { opacity: 0.7 },
  label: { ...typography.body, color: colors.controlSelected, fontWeight: "600", zIndex: 1 },
  image: { bottom: -12, height: 116, position: "absolute", right: -18, width: 152 },
});
