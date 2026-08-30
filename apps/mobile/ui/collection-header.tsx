import { colors, spacing, typography } from "@geek/design-tokens";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";

import { GeekIcon } from "./geek-icon";

export function CollectionHeader({
  albumMode,
  onAddGame,
  onAlbumModeChange,
}: {
  readonly albumMode: boolean;
  readonly onAddGame?: () => void;
  readonly onAlbumModeChange: (value: boolean) => void;
}) {
  const actions = (
    <>
      <GeekIcon name="album" />
      <Switch
        accessibilityLabel="Afficher la collection par albums"
        onValueChange={onAlbumModeChange}
        value={albumMode}
      />
      {onAddGame ? (
        <>
          <View style={styles.divider} />
          <Pressable
            accessibilityLabel="Ajouter un jeu"
            accessibilityRole="button"
            hitSlop={10}
            onPress={onAddGame}
          >
            <GeekIcon name="plus" />
          </Pressable>
        </>
      ) : null}
    </>
  );

  return (
    <View style={styles.header}>
      <Text style={styles.title}>Collections</Text>
      <View style={styles.actions}>{actions}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  title: {
    color: colors.text,
    ...typography.screenTitle,
  },
  actions: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.medium,
  },
  divider: {
    backgroundColor: colors.divider,
    height: 16,
    width: StyleSheet.hairlineWidth,
  },
});
