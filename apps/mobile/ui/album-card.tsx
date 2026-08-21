import { colors, radii, typography } from "@geek/design-tokens";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { getAlbumProgress, type AlbumFixture } from "../navigation/album-fixtures";

export function AlbumCard({
  album,
  onPress,
}: {
  readonly album: AlbumFixture;
  readonly onPress?: () => void;
}) {
  const { ownedSlots, totalSlots } = getAlbumProgress(album);
  const progress = ownedSlots / totalSlots;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.card}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Svg height="100%" width="100%">
          <Defs>
            <LinearGradient id={`album-${album.id}`} x1="0" x2="1" y1="0" y2="1">
              <Stop offset="0" stopColor={album.colors[0]} />
              <Stop offset="1" stopColor={album.colors[1]} />
            </LinearGradient>
          </Defs>
          <Rect fill={`url(#album-${album.id})`} height="100%" width="100%" />
        </Svg>
      </View>
      <View style={styles.copy}>
        <Text numberOfLines={1} style={[styles.title, { fontFamily: album.fontFamily }]}>
          {album.title}
        </Text>
        <Text style={styles.subtitle}>{album.subtitle}</Text>
        <View style={styles.progressRow}>
          <Text style={styles.count}>
            {ownedSlots}/{totalSlots}
          </Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
          </View>
        </View>
      </View>
      <Image resizeMode="contain" source={album.logo} style={styles.logo} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.wishlistImage,
    height: 137,
    justifyContent: "center",
    overflow: "hidden",
    padding: 16,
  },
  copy: { gap: 4, maxWidth: "70%", zIndex: 1 },
  title: { color: colors.controlSelected, fontSize: 22, lineHeight: 27 },
  subtitle: { ...typography.metadata, color: "rgba(255,255,255,.78)" },
  progressRow: { alignItems: "center", flexDirection: "row", gap: 8, marginTop: 8 },
  progressTrack: {
    backgroundColor: "rgba(255,255,255,.46)",
    borderRadius: 4,
    height: 5,
    overflow: "hidden",
    width: 108,
  },
  progressFill: { backgroundColor: colors.controlSelected, height: "100%" },
  count: { color: colors.controlSelected, fontSize: 12, fontWeight: "600" },
  logo: { bottom: -8, height: 110, opacity: 0.95, position: "absolute", right: -10, width: 140 },
});
