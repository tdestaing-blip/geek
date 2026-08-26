import { colors, radii, spacing, typography } from "@geek/design-tokens";
import { useState } from "react";
import {
  FlatList,
  Image,
  type ImageSourcePropType,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewToken,
} from "react-native";

import { GeekIcon } from "./geek-icon";

export type CopyPhotoGalleryItem = {
  readonly id: string;
  readonly uri: string;
};

const VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 60 };

export function CopyPhotoGallery({
  accessibilityLabel,
  canAdd = true,
  emptyActionLabel = "Add photos of your copy",
  emptyTitle,
  fallbackArtwork,
  onAdd,
  onCurrentChange,
  onRemove,
  photos,
  removable = false,
  size,
}: {
  readonly accessibilityLabel: string;
  readonly canAdd?: boolean;
  readonly emptyActionLabel?: string;
  readonly emptyTitle?: string;
  readonly fallbackArtwork: ImageSourcePropType | null;
  readonly onAdd: () => void;
  readonly onCurrentChange?: (photoId: string | null) => void;
  readonly onRemove?: (photoId: string) => void;
  readonly photos: readonly CopyPhotoGalleryItem[];
  readonly removable?: boolean;
  readonly size: number;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const current = photos[Math.min(currentIndex, Math.max(photos.length - 1, 0))] ?? null;

  function updateCurrent({ viewableItems }: { viewableItems: ViewToken[] }) {
    const index = viewableItems.find((item) => item.isViewable)?.index ?? 0;
    setCurrentIndex(index);
    onCurrentChange?.(photos[index]?.id ?? null);
  }

  if (photos.length === 0) {
    return (
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        onPress={onAdd}
        style={[styles.frame, { height: size, width: size }]}
      >
        {fallbackArtwork ? (
          <Image resizeMode="cover" source={fallbackArtwork} style={styles.fill} />
        ) : null}
        <View style={styles.photoShade} />
        <View style={styles.emptyCopy}>
          <GeekIcon color={colors.controlSelected} name="image-2-plus" size={32} />
          {emptyTitle ? <Text style={styles.emptyTitle}>{emptyTitle}</Text> : null}
          <Text style={styles.emptyText}>{emptyActionLabel}</Text>
        </View>
      </Pressable>
    );
  }

  return (
    <View style={[styles.frame, { height: size, width: size }]}>
      <FlatList
        data={photos}
        decelerationRate="fast"
        horizontal
        keyExtractor={(photo) => photo.id}
        onViewableItemsChanged={updateCurrent}
        pagingEnabled
        renderItem={({ item }) => (
          <Image
            resizeMode="cover"
            source={{ uri: item.uri }}
            style={{ height: size, width: size }}
          />
        )}
        showsHorizontalScrollIndicator={false}
        viewabilityConfig={VIEWABILITY_CONFIG}
      />
      {removable && current && onRemove ? (
        <Pressable
          accessibilityLabel="Retirer cette photo"
          onPress={() => onRemove(current.id)}
          style={[styles.floatingAction, styles.removeAction]}
        >
          <GeekIcon color={colors.controlSelected} name="close" size={20} />
        </Pressable>
      ) : null}
      {canAdd ? (
        <Pressable
          accessibilityLabel="Ajouter une photo"
          onPress={onAdd}
          style={styles.floatingAction}
        >
          <GeekIcon color={colors.controlSelected} name="plus" size={20} />
        </Pressable>
      ) : (
        <View accessibilityLabel="Limite de 6 photos atteinte" style={styles.limitBadge}>
          <Text style={styles.limitText}>6/6</Text>
        </View>
      )}
      {photos.length > 1 ? (
        <View style={styles.dots}>
          {photos.map((photo, index) => (
            <View key={photo.id} style={[styles.dot, index === currentIndex && styles.dotActive]} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignSelf: "center",
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radii.detailCard,
    overflow: "hidden",
  },
  fill: { height: "100%", width: "100%" },
  photoShade: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,.58)" },
  emptyCopy: {
    alignItems: "center",
    gap: spacing.compact,
    left: 0,
    position: "absolute",
    right: 0,
    top: "43%",
  },
  emptyTitle: { ...typography.sectionTitle, color: colors.controlSelected },
  emptyText: { ...typography.body, color: colors.controlSelected },
  floatingAction: {
    alignItems: "center",
    backgroundColor: "rgba(20,20,20,.72)",
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    position: "absolute",
    right: 12,
    top: 12,
    width: 36,
  },
  removeAction: { left: 12, right: undefined },
  limitBadge: {
    backgroundColor: "rgba(20,20,20,.72)",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 5,
    position: "absolute",
    right: 12,
    top: 12,
  },
  limitText: { color: colors.controlSelected, ...typography.metadata },
  dots: {
    alignItems: "center",
    bottom: 12,
    flexDirection: "row",
    gap: 5,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
  },
  dot: { backgroundColor: "rgba(255,255,255,.55)", borderRadius: 3, height: 6, width: 6 },
  dotActive: { backgroundColor: colors.controlSelected },
});
