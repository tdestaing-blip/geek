import { colors, radii, spacing, typography } from "@geek/design-tokens";
import { Image, type ImageSourcePropType, StyleSheet, Text, View } from "react-native";

export function AboutGameCard({
  description,
  facts = [],
  image,
  title,
}: {
  readonly description?: string | null;
  readonly facts?: readonly { readonly label: string; readonly value: string }[];
  readonly image?: ImageSourcePropType | null;
  readonly title: string;
}) {
  return (
    <View style={styles.card}>
      {image ? (
        <View style={styles.image}>
          <Image resizeMode="cover" source={image} style={styles.fill} />
          <Text style={styles.imageLabel}>À propos du jeu</Text>
        </View>
      ) : null}
      <View style={styles.copy}>
        {!image ? <Text style={styles.sectionLabel}>À propos du jeu</Text> : null}
        <Text style={styles.title}>{title}</Text>
        {description ? <Text style={styles.body}>{description}</Text> : null}
        {facts.map((fact) => (
          <View key={fact.label} style={styles.factRow}>
            <Text style={styles.factLabel}>{fact.label}</Text>
            <Text style={styles.factValue}>{fact.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radii.detailCard,
    marginHorizontal: 12,
    overflow: "hidden",
  },
  image: { height: 181 },
  fill: { height: "100%", width: "100%" },
  imageLabel: {
    color: colors.controlSelected,
    left: 12,
    position: "absolute",
    top: 12,
    ...typography.sectionTitle,
  },
  copy: { gap: spacing.compact, paddingHorizontal: 12, paddingVertical: spacing.page },
  sectionLabel: { color: colors.text, ...typography.sectionTitle },
  title: { color: colors.text, ...typography.body, fontWeight: "600" },
  body: { color: colors.textSecondary, ...typography.metadata },
  factRow: { flexDirection: "row", gap: spacing.compact, justifyContent: "space-between" },
  factLabel: { color: colors.textSecondary, ...typography.metadata },
  factValue: { color: colors.text, flex: 1, textAlign: "right", ...typography.metadata },
});
