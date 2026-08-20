import { colors, radii, spacing, typography } from "@geek/design-tokens";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AdaptiveGlassSurface } from "./adaptive-glass-surface";

export function StickyAvailabilityBar({ hasCopyPhoto }: { readonly hasCopyPhoto: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.root}>
      {!hasCopyPhoto ? (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            Vous devez ajouter une photo de votre copie du jeu afin de le rendre visible à la
            communauté
          </Text>
        </View>
      ) : null}
      <AdaptiveGlassSurface style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View>
          <Text style={styles.statusLabel}>Status</Text>
          <Text style={styles.status}>Privé</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !hasCopyPhoto }}
          disabled={!hasCopyPhoto}
          onPress={() => undefined}
          style={[styles.action, !hasCopyPhoto && styles.actionDisabled]}
        >
          <Text style={styles.actionText}>Rendre disponible</Text>
        </Pressable>
      </AdaptiveGlassSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { bottom: 0, left: 0, position: "absolute", right: 0 },
  notice: {
    backgroundColor: colors.availabilityNotice,
    borderTopLeftRadius: radii.detailCard,
    borderTopRightRadius: radii.detailCard,
    paddingHorizontal: 24,
    paddingVertical: spacing.compact,
  },
  noticeText: { color: colors.text, textAlign: "center", ...typography.metadata },
  bar: {
    alignItems: "center",
    borderRadius: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 88,
    paddingHorizontal: 24,
    paddingTop: spacing.page,
  },
  statusLabel: { color: colors.textSecondary, ...typography.body },
  status: { color: colors.text, ...typography.body },
  action: {
    backgroundColor: colors.text,
    borderRadius: radii.capsule,
    padding: 12,
  },
  actionDisabled: { backgroundColor: colors.disabledAction, opacity: 0.78 },
  actionText: { color: colors.controlSelected, ...typography.body },
});
