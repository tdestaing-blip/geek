import { colors, spacing, typography } from "@geek/design-tokens";
import { StyleSheet, Text, View } from "react-native";

export function MetadataField({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.micro },
  label: { color: colors.textSecondary, ...typography.metadata },
  value: { color: colors.text, ...typography.body },
});
