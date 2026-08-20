import { colors, spacing, typography } from "@geek/design-tokens";
import type { ImageSourcePropType } from "react-native";
import { StyleSheet, Text, View } from "react-native";

import { AvatarStack } from "./avatar-stack";

export function NetworkSignalRow({
  avatars,
  count,
  label,
}: {
  readonly avatars: readonly ImageSourcePropType[];
  readonly count: number;
  readonly label: string;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.copy}>
        <Text style={styles.count}>{count} </Text>
        {label}
      </Text>
      <AvatarStack images={avatars} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: "center", flexDirection: "row", gap: spacing.compact },
  copy: { color: colors.textSecondary, flex: 1, ...typography.body },
  count: { color: colors.text, fontWeight: "700" },
});
