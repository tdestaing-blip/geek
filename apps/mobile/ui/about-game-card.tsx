import { colors, radii, spacing, typography } from "@geek/design-tokens";
import { Image, type ImageSourcePropType, StyleSheet, Text, View } from "react-native";

export function AboutGameCard({
  description,
  image,
  title,
}: {
  readonly description: string;
  readonly image: ImageSourcePropType;
  readonly title: string;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.image}>
        <Image resizeMode="cover" source={image} style={styles.fill} />
        <Text style={styles.label}>A propos du jeu</Text>
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{description}</Text>
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
  label: {
    color: colors.controlSelected,
    left: 12,
    position: "absolute",
    top: 12,
    ...typography.sectionTitle,
  },
  copy: { gap: spacing.compact, paddingHorizontal: 12, paddingVertical: spacing.page },
  title: { color: colors.text, ...typography.body, fontWeight: "600" },
  body: { color: colors.textSecondary, ...typography.metadata },
});
