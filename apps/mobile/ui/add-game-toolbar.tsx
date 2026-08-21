import { colors, spacing } from "@geek/design-tokens";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AdaptiveGlassSurface } from "./adaptive-glass-surface";
import { GeekIcon } from "./geek-icon";

export function AddGameToolbar({
  mode,
  onPress,
  title,
}: {
  readonly mode: "back" | "close";
  readonly onPress: () => void;
  readonly title: string;
}) {
  return (
    <View style={styles.toolbar}>
      {mode === "back" ? (
        <ToolbarButton icon="chevron-left" label="Retour" onPress={onPress} />
      ) : (
        <View style={styles.spacer} />
      )}
      <Text numberOfLines={1} style={styles.title}>
        {title}
      </Text>
      {mode === "close" ? (
        <ToolbarButton icon="close" label="Fermer" onPress={onPress} />
      ) : (
        <View style={styles.spacer} />
      )}
    </View>
  );
}

function ToolbarButton({
  icon,
  label,
  onPress,
}: {
  readonly icon: "chevron-left" | "close";
  readonly label: string;
  readonly onPress: () => void;
}) {
  return (
    <AdaptiveGlassSurface style={styles.button}>
      <Pressable accessibilityLabel={label} onPress={onPress} style={styles.pressable}>
        <GeekIcon name={icon} />
      </Pressable>
    </AdaptiveGlassSurface>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    alignItems: "center",
    flexDirection: "row",
    height: 54,
    paddingBottom: spacing.compact,
    paddingHorizontal: spacing.page,
  },
  spacer: { height: 44, width: 44 },
  button: { borderRadius: 22, height: 44, overflow: "hidden", width: 44 },
  pressable: { alignItems: "center", flex: 1, justifyContent: "center" },
  title: {
    color: colors.text,
    flex: 1,
    fontSize: 17,
    fontWeight: "600",
    marginHorizontal: spacing.compact,
    textAlign: "center",
  },
});
