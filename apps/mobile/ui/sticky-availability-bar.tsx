import { canCreateDirectListing } from "@geek/domain";
import type { CopyAvailability, OwnedCopyCommercialState } from "@geek/domain";
import { colors, radii, spacing, typography } from "@geek/design-tokens";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AdaptiveGlassSurface } from "./adaptive-glass-surface";
import { getStickyAvailabilityPresentation } from "./sticky-availability-presentation";
export function StickyAvailabilityBar({
  availability = "private",
  commercialState,
  hasCopyPhoto,
  onCreateListing,
}: {
  readonly availability?: CopyAvailability;
  readonly commercialState: OwnedCopyCommercialState;
  readonly hasCopyPhoto: boolean;
  readonly onCreateListing: () => void;
}) {
  const insets = useSafeAreaInsets();
  const canCreateListing = hasCopyPhoto && canCreateDirectListing(availability, commercialState);
  const presentation = getStickyAvailabilityPresentation(availability, commercialState);
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
      <AdaptiveGlassSurface
        colorScheme="light"
        style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 16) }]}
      >
        <View>
          <Text style={commercialState.kind === "listing" ? styles.priceLabel : styles.statusLabel}>
            {presentation.label}
          </Text>
          <Text style={commercialState.kind === "listing" ? styles.price : styles.status}>
            {presentation.value}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !canCreateListing }}
          disabled={!canCreateListing}
          onPress={onCreateListing}
          style={[styles.action, !canCreateListing && styles.actionDisabled]}
        >
          <Text style={styles.actionText}>{presentation.action}</Text>
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
  priceLabel: { color: colors.text, fontSize: 15, fontWeight: "400", opacity: 0.5 },
  price: { color: colors.text, fontSize: 24, fontWeight: "600", lineHeight: 29 },
  action: {
    backgroundColor: colors.text,
    borderRadius: radii.capsule,
    padding: 12,
  },
  actionDisabled: { backgroundColor: colors.disabledAction, opacity: 0.78 },
  actionText: { color: colors.controlSelected, ...typography.body },
});
