import { canCancelDirectListing, canCreateAuction, canCreateDirectListing } from "@geek/domain";
import type { CopyAvailability, OwnedCopyCommercialState } from "@geek/domain";
import { colors, radii, spacing, typography } from "@geek/design-tokens";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AdaptiveGlassSurface } from "./adaptive-glass-surface";
import { GeekIcon } from "./geek-icon";
import { getStickyAvailabilityPresentation } from "./sticky-availability-presentation";
export function StickyAvailabilityBar({
  availability = "private",
  commercialState,
  hasCopyPhoto,
  listingCancellationPending = false,
  onCancelListing,
  onCreateCommercial,
}: {
  readonly availability?: CopyAvailability;
  readonly commercialState: OwnedCopyCommercialState;
  readonly hasCopyPhoto: boolean;
  readonly listingCancellationPending?: boolean;
  readonly onCancelListing: () => void;
  readonly onCreateCommercial: () => void;
}) {
  const insets = useSafeAreaInsets();
  const canCreateCommercial =
    hasCopyPhoto &&
    (canCreateDirectListing(availability, commercialState) ||
      canCreateAuction(availability, commercialState));
  const canCancelListing =
    commercialState.kind === "listing" && canCancelDirectListing(commercialState.listing);
  const commercialAmount = commercialState.kind === "listing" || commercialState.kind === "auction";
  const actionEnabled = !listingCancellationPending && (canCreateCommercial || canCancelListing);
  const presentation = getStickyAvailabilityPresentation(availability, commercialState);
  return (
    <View style={styles.root}>
      {!hasCopyPhoto && commercialState.kind === "none" ? (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            Vous devez ajouter une photo de votre copie du jeu afin de le rendre visible à la
            communauté
          </Text>
        </View>
      ) : null}
      {presentation.signal ? (
        <View style={styles.auctionSignal}>
          <Text style={styles.signalText}>{presentation.signal.leading}</Text>
          <View style={styles.signalRight}>
            <GeekIcon name="radio" size={14} />
            <Text style={styles.signalText}>{presentation.signal.trailing}</Text>
          </View>
        </View>
      ) : null}
      <AdaptiveGlassSurface
        colorScheme="light"
        style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 16) }]}
      >
        <View>
          <Text style={commercialAmount ? styles.priceLabel : styles.statusLabel}>
            {presentation.label}
          </Text>
          <Text style={commercialAmount ? styles.price : styles.status}>{presentation.value}</Text>
        </View>
        <Pressable
          accessibilityLabel={presentation.action}
          accessibilityRole="button"
          accessibilityState={{ busy: listingCancellationPending, disabled: !actionEnabled }}
          disabled={!actionEnabled}
          onPress={canCancelListing ? onCancelListing : onCreateCommercial}
          style={[styles.action, !actionEnabled && styles.actionDisabled]}
        >
          <View>
            <Text
              style={[styles.actionText, listingCancellationPending && styles.pendingActionText]}
            >
              {presentation.action}
            </Text>
            {listingCancellationPending ? (
              <ActivityIndicator
                color={colors.controlSelected}
                size="small"
                style={styles.spinner}
              />
            ) : null}
          </View>
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
  auctionSignal: {
    alignItems: "center",
    backgroundColor: colors.availabilityNotice,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingVertical: spacing.compact,
  },
  signalRight: { alignItems: "center", flexDirection: "row", gap: spacing.micro },
  signalText: { color: colors.text, ...typography.metadata },
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
  pendingActionText: { opacity: 0 },
  spinner: { bottom: 0, left: 0, position: "absolute", right: 0, top: 0 },
});
