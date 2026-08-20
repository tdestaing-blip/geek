import { colors, radii, spacing, typography } from "@geek/design-tokens";
import { Image, type ImageSourcePropType, Pressable, StyleSheet, Text, View } from "react-native";

import FRANCE_ICON from "../assets/collection/v2/icon-france.png";
import { GeekIcon } from "./geek-icon";

export type GridItem = {
  readonly gameId: string;
  readonly editionId?: string;
  readonly copyId?: string;
  readonly image: ImageSourcePropType;
  readonly title: string;
  readonly platform: "N64" | "SNES";
  readonly components?: readonly ("gamepad" | "box")[];
  readonly overlay?: "sale" | "photo" | "bell";
  readonly opportunities?: number;
};

export function GameGridItem({
  item,
  isWishlist,
  onPress,
  width,
}: {
  readonly item: GridItem;
  readonly isWishlist: boolean;
  readonly onPress: () => void;
  readonly width: number;
}) {
  return (
    <Pressable
      accessibilityLabel={`Ouvrir ${item.title}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.tile, { width }, pressed && styles.pressed]}
    >
      <View style={[styles.imageFrame, isWishlist ? styles.wishlistImage : styles.copyImage]}>
        <Image resizeMode="cover" source={item.image} style={styles.image} />
        {item.overlay ? <ImageOverlay kind={item.overlay} /> : null}
      </View>
      <View style={styles.metadata}>
        <View style={styles.titleRow}>
          <Text numberOfLines={1} style={styles.title}>
            {item.title}
          </Text>
          {isWishlist ? (
            <OpportunityPill count={item.opportunities ?? 0} />
          ) : (
            <View style={styles.components}>
              {item.components?.map((component) => (
                <GeekIcon
                  key={component}
                  name={component === "gamepad" ? "collection" : "box"}
                  size={16}
                />
              ))}
            </View>
          )}
        </View>
        <View style={styles.platformRow}>
          <Image source={FRANCE_ICON} style={styles.flag} />
          <Text style={styles.platform}>{item.platform}</Text>
        </View>
      </View>
    </Pressable>
  );
}

function ImageOverlay({ kind }: { readonly kind: "sale" | "photo" | "bell" }) {
  if (kind === "bell") {
    return (
      <View style={[styles.overlay, styles.bellOverlay]}>
        <GeekIcon name="bell" size={14} />
      </View>
    );
  }

  return (
    <View style={[styles.overlay, kind === "photo" ? styles.photoOverlay : styles.saleOverlay]}>
      <GeekIcon name={kind === "photo" ? "image-plus" : "shopping-cart"} size={14} />
      <Text style={styles.overlayText}>{kind === "photo" ? "Photo needed" : "34€"}</Text>
    </View>
  );
}

function OpportunityPill({ count }: { readonly count: number }) {
  const active = count > 0;
  return (
    <View style={[styles.opportunity, active && styles.opportunityActive]}>
      <GeekIcon
        color={active ? colors.controlSelected : colors.textSecondary}
        name="shopping-cart"
        size={14}
      />
      <Text style={[styles.opportunityText, active && styles.opportunityTextActive]}>{count}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    gap: spacing.hairline,
    minWidth: 0,
  },
  imageFrame: {
    aspectRatio: 115 / 84,
    overflow: "hidden",
    width: "100%",
  },
  copyImage: { borderRadius: radii.copyImage },
  wishlistImage: { borderRadius: radii.wishlistImage },
  image: { height: "100%", width: "100%" },
  metadata: { padding: spacing.micro },
  titleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.micro,
    height: 18,
  },
  title: {
    color: colors.text,
    flex: 1,
    minWidth: 0,
    ...typography.itemTitle,
  },
  components: { flexDirection: "row", gap: spacing.micro },
  platformRow: { alignItems: "center", flexDirection: "row", gap: spacing.micro },
  flag: { height: 14, width: 14 },
  platform: { color: colors.textSecondary, ...typography.metadata },
  overlay: {
    alignItems: "center",
    flexDirection: "row",
    height: 20,
    position: "absolute",
    top: spacing.micro,
  },
  saleOverlay: {
    backgroundColor: colors.overlay,
    borderRadius: radii.pill,
    gap: spacing.micro,
    left: spacing.micro,
    paddingHorizontal: spacing.micro,
  },
  photoOverlay: {
    backgroundColor: colors.warning,
    borderRadius: radii.pill,
    gap: spacing.micro,
    paddingHorizontal: spacing.micro,
    right: spacing.micro,
  },
  bellOverlay: {
    backgroundColor: colors.overlay,
    borderRadius: radii.capsule,
    justifyContent: "center",
    left: spacing.micro,
    width: 20,
  },
  overlayText: { color: colors.text, ...typography.metadata },
  opportunity: {
    alignItems: "center",
    backgroundColor: colors.opportunityNeutral,
    borderRadius: radii.wishlistImage,
    flexDirection: "row",
    gap: spacing.micro,
    paddingHorizontal: spacing.micro,
    paddingVertical: spacing.hairline,
  },
  opportunityActive: { backgroundColor: colors.opportunityAvailable },
  opportunityText: { color: colors.textSecondary, ...typography.metadata },
  opportunityTextActive: { color: colors.controlSelected },
  pressed: { opacity: 0.65 },
});
