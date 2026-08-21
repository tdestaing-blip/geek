import { colors, radii, spacing, typography } from "@geek/design-tokens";
import { Image, type ImageSourcePropType, StyleSheet, Text, View } from "react-native";

export function CopyComponentCard({
  conditionLabel,
  image,
  label,
  state,
}: {
  readonly conditionLabel?: string;
  readonly image: ImageSourcePropType;
  readonly label: string;
  readonly state: "missing" | "present" | "unassessed" | "unknown";
}) {
  const present = state === "present";
  const stateLabel =
    state === "present"
      ? (conditionLabel ?? "Présent")
      : state === "missing"
        ? "Objet manquant"
        : state === "unknown"
          ? "Présence inconnue"
          : "Non renseigné";
  return (
    <View style={[styles.card, present && styles.present]}>
      <Text style={styles.label}>{label}</Text>
      <Image resizeMode="contain" source={image} style={styles.image} />
      <Text style={[styles.state, present && styles.presentText]}>{stateLabel}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: "center",
    backgroundColor: colors.surfaceSubtle,
    borderColor: colors.divider,
    borderRadius: radii.copyImage,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    gap: spacing.compact,
    minWidth: 0,
    paddingVertical: spacing.compact,
  },
  present: { backgroundColor: colors.surfaceSelected, borderColor: colors.text },
  label: { color: colors.text, ...typography.body },
  image: { height: 40, width: "62%" },
  state: { color: colors.textSecondary, textAlign: "center", ...typography.metadata },
  presentText: { color: colors.text },
});
