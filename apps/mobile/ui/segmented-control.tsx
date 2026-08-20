import { colors, radii, spacing } from "@geek/design-tokens";
import { Pressable, StyleSheet, Text, View } from "react-native";

export type CollectionSegment = "games" | "wishlist";

export function CollectionSegmentedControl({
  selected,
  onSelect,
}: {
  readonly selected: CollectionSegment;
  readonly onSelect: (segment: CollectionSegment) => void;
}) {
  return (
    <View accessibilityRole="tablist" style={styles.control}>
      <SegmentButton
        label="Mes jeux 192"
        onPress={() => onSelect("games")}
        selected={selected === "games"}
      />
      <SegmentButton
        label="Wishlist 18"
        onPress={() => onSelect("wishlist")}
        selected={selected === "wishlist"}
      />
    </View>
  );
}

function SegmentButton({
  label,
  onPress,
  selected,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly selected: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.segment,
        selected && styles.selected,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.label, selected && styles.selectedLabel]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  control: {
    backgroundColor: colors.control,
    borderRadius: radii.capsule,
    flexDirection: "row",
    height: 44,
    padding: spacing.hairline,
  },
  segment: {
    alignItems: "center",
    borderRadius: radii.capsule,
    flex: 1,
    justifyContent: "center",
  },
  selected: {
    backgroundColor: colors.controlSelected,
    shadowColor: colors.text,
    shadowOffset: { height: 1, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 1,
  },
  label: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: "500",
  },
  selectedLabel: {
    color: colors.text,
    fontWeight: "600",
  },
  pressed: {
    opacity: 0.7,
  },
});
