import { colors, radii, spacing, typography } from "@geek/design-tokens";
import { Image, type ImageSourcePropType, Pressable, StyleSheet, Text, View } from "react-native";

import FRANCE_ICON from "../assets/collection/v2/icon-france.png";
import { GeekIcon } from "./geek-icon";

export type GameGridItemContent = {
  readonly image: ImageSourcePropType;
  readonly title: string;
  readonly platform: string;
  readonly regionCode?: string | null;
  readonly components?: readonly ("gamepad" | "box")[];
  readonly overlay?: "sale" | "photo" | "bell";
  readonly opportunities?: number;
  readonly salePrice?: string;
};

export type GridItem = GameGridItemContent & {
  readonly gameId: string;
  readonly editionId?: string;
  readonly copyId?: string;
};

type RenderableGameGridItemContent = Omit<GameGridItemContent, "image"> & {
  readonly image?: ImageSourcePropType;
};

export function GameGridItem({
  item,
  isWishlist,
  imageOpacity = 1,
  onPress,
  onWantedPress,
  owned = false,
  platformLabel,
  showOpportunity = false,
  slotNumber,
  wanted = false,
  width,
}: {
  readonly item: RenderableGameGridItemContent;
  readonly isWishlist: boolean;
  readonly imageOpacity?: number;
  readonly onPress?: () => void;
  readonly onWantedPress?: () => void;
  readonly owned?: boolean;
  readonly platformLabel?: string;
  readonly showOpportunity?: boolean;
  readonly slotNumber?: string;
  readonly wanted?: boolean;
  readonly width: number;
}) {
  return (
    <Pressable
      accessibilityLabel={onPress ? `Ouvrir ${item.title}` : undefined}
      accessibilityRole={onPress ? "button" : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, { width }, pressed && styles.pressed]}
    >
      <View style={[styles.imageFrame, isWishlist ? styles.wishlistImage : styles.copyImage]}>
        {item.image ? (
          <Image
            resizeMode="cover"
            source={item.image}
            style={[styles.image, { opacity: imageOpacity }]}
          />
        ) : (
          <View style={[styles.imagePlaceholder, { opacity: imageOpacity }]}>
            <GeekIcon color={colors.textSecondary} name="collection" size={32} />
          </View>
        )}
        {slotNumber ? (
          <View pointerEvents="none" style={styles.slotNumberWrap}>
            <Text style={styles.slotNumber}>{slotNumber}</Text>
          </View>
        ) : null}
        {item.overlay ? <ImageOverlay kind={item.overlay} price={item.salePrice} /> : null}
        {wanted ? (
          onWantedPress ? (
            <Pressable
              accessibilityLabel={`Retirer ${item.title} de la Wishlist`}
              hitSlop={8}
              onPress={(event) => {
                event.stopPropagation();
                onWantedPress();
              }}
              style={[styles.overlay, styles.bellOverlay]}
            >
              <GeekIcon name="bell" size={14} />
            </Pressable>
          ) : (
            <ImageOverlay kind="bell" />
          )
        ) : null}
        {owned ? (
          <View pointerEvents="none" style={[styles.overlay, styles.ownedOverlay]}>
            <GeekIcon name="checkbox" size={14} />
          </View>
        ) : null}
      </View>
      <View style={styles.metadata}>
        <View style={styles.titleRow}>
          <Text numberOfLines={1} style={styles.title}>
            {item.title}
          </Text>
          {showOpportunity ? (
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
          {item.regionCode === undefined || item.regionCode === "FR" ? (
            <Image source={FRANCE_ICON} style={styles.flag} />
          ) : null}
          <Text style={styles.platform}>{platformLabel ?? item.platform}</Text>
        </View>
      </View>
    </Pressable>
  );
}

function ImageOverlay({
  kind,
  price,
}: {
  readonly kind: "sale" | "photo" | "bell";
  readonly price?: string;
}) {
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
      <Text style={styles.overlayText}>{kind === "photo" ? "Photo needed" : (price ?? "34€")}</Text>
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
  imagePlaceholder: {
    alignItems: "center",
    backgroundColor: colors.surfaceSubtle,
    height: "100%",
    justifyContent: "center",
    width: "100%",
  },
  slotNumberWrap: {
    alignItems: "center",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  slotNumber: {
    color: colors.text,
    fontFamily: "Courier",
    fontSize: 24,
    fontWeight: "700",
    lineHeight: 28,
  },
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
  ownedOverlay: {
    backgroundColor: colors.overlay,
    borderRadius: radii.capsule,
    justifyContent: "center",
    right: spacing.micro,
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
