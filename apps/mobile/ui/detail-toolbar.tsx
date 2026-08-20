import { colors } from "@geek/design-tokens";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AdaptiveGlassSurface } from "./adaptive-glass-surface";
import { GeekIcon } from "./geek-icon";

export function DetailToolbar({
  title,
  onClose,
  onMore,
}: {
  readonly title: string;
  readonly onClose: () => void;
  readonly onMore: () => void;
}) {
  return (
    <View pointerEvents="box-none" style={styles.toolbar}>
      <AdaptiveGlassSurface style={styles.button}>
        <Pressable accessibilityLabel="Fermer" onPress={onClose} style={styles.pressable}>
          <GeekIcon name="chevron-down" />
        </Pressable>
      </AdaptiveGlassSurface>
      <Text numberOfLines={1} style={styles.title}>
        {title}
      </Text>
      <AdaptiveGlassSurface style={styles.button}>
        <Pressable accessibilityLabel="Plus d’options" onPress={onMore} style={styles.pressable}>
          <GeekIcon name="more-horizontal" />
        </Pressable>
      </AdaptiveGlassSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    alignItems: "center",
    flexDirection: "row",
    height: 60,
    justifyContent: "space-between",
    paddingBottom: 8,
    paddingHorizontal: 16,
  },
  button: { borderRadius: 999, height: 44, overflow: "hidden", width: 44 },
  pressable: { alignItems: "center", flex: 1, justifyContent: "center" },
  title: {
    color: colors.text,
    flex: 1,
    fontSize: 17,
    fontWeight: "600",
    marginHorizontal: 8,
    textAlign: "center",
  },
});
