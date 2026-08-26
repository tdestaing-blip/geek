import { colors, radii, spacing, typography } from "@geek/design-tokens";
import { Image, type ImageSourcePropType, Pressable, StyleSheet, Text } from "react-native";

export function CopyComponentCard({
  conditionLabel,
  image,
  label,
  onPress,
  selected = false,
  state,
  mediaState,
}: {
  readonly conditionLabel?: string;
  readonly image: ImageSourcePropType;
  readonly label: string;
  readonly onPress?: () => void;
  readonly selected?: boolean;
  readonly state: "missing" | "present" | "unassessed" | "unknown";
  readonly mediaState?: "photo-missing" | "photo-present";
}) {
  const present = mediaState ? mediaState === "photo-present" : state === "present";
  const stateLabel = mediaState
    ? mediaState === "photo-present"
      ? "Photo ajoutée"
      : "Objet manquant"
    : state === "present"
      ? (conditionLabel ?? "Présent")
      : state === "missing"
        ? "Objet manquant"
        : state === "unknown"
          ? "Présence inconnue"
          : "Non renseigné";
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityState={onPress ? { selected } : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={[styles.card, present && styles.present, selected && styles.selected]}
    >
      <Text style={styles.label}>{label}</Text>
      <Image resizeMode="contain" source={image} style={styles.image} />
      <Text style={[styles.state, present && styles.presentText]}>{stateLabel}</Text>
    </Pressable>
  );
}

/** Product labels are derived from canonical component kind, never photo presence. */
export function getCopyComponentLabel(kind: string, fallback: string): string {
  const normalized = kind.toLocaleLowerCase();
  if (normalized.includes("manual")) return "Notice";
  if (normalized.includes("box") || normalized.includes("case")) return "Boîte";
  if (normalized.includes("cartridge")) return "Cartouche";
  return fallback;
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
  selected: { borderColor: colors.text, borderWidth: 2 },
  label: { color: colors.text, ...typography.body },
  image: { height: 40, width: "62%" },
  state: { color: colors.textSecondary, textAlign: "center", ...typography.metadata },
  presentText: { color: colors.text },
});
