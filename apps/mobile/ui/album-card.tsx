import { colors, radii, typography } from "@geek/design-tokens";
import type { AlbumSummary } from "@geek/domain";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { getAlbumTheme } from "../navigation/album-theme";
import { getAlbumProgress, type AlbumFixture } from "../navigation/album-fixtures";

export function AlbumCard({
  album,
  onPress,
}: {
  readonly album: AlbumSummary | AlbumFixture;
  readonly onPress?: () => void;
}) {
  const canonical = "progress" in album;
  const theme = canonical
    ? getAlbumTheme(album)
    : { colors: album.colors, fontFamily: album.fontFamily, logo: album.logo };
  const progress = canonical ? album.progress : getAlbumProgress(album);
  const { ownedSlots, totalSlots } = progress;
  const completionRatio = canonical ? album.progress.completionRatio : ownedSlots / totalSlots;
  const subtitle = canonical ? album.description : album.subtitle;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.card}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Svg height="100%" width="100%">
          <Defs>
            <LinearGradient id={`album-${album.id}`} x1="0" x2="1" y1="0" y2="1">
              <Stop offset="0" stopColor={theme.colors[0]} />
              <Stop offset="1" stopColor={theme.colors[1]} />
            </LinearGradient>
          </Defs>
          <Rect fill={`url(#album-${album.id})`} height="100%" width="100%" />
        </Svg>
      </View>
      <View style={styles.copy}>
        <Text numberOfLines={1} style={[styles.title, { fontFamily: theme.fontFamily }]}>
          {album.title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} style={styles.subtitle}>
            {subtitle}
          </Text>
        ) : null}
        <View style={styles.progressRow}>
          <Text style={styles.count}>
            {ownedSlots}/{totalSlots} · {Math.round(completionRatio * 100)}%
          </Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${completionRatio * 100}%` }]} />
          </View>
        </View>
      </View>
      {theme.logo ? <Image resizeMode="contain" source={theme.logo} style={styles.logo} /> : null}
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
