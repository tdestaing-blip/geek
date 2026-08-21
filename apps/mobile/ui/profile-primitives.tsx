import { colors, radii, spacing, typography } from "@geek/design-tokens";
import type { ReactNode } from "react";
import type { ImageSourcePropType } from "react-native";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { AdaptiveGlassSurface } from "./adaptive-glass-surface";
import { GeekIcon, type GeekIconName } from "./geek-icon";

export type ProfileStat = {
  readonly detail: string;
  readonly icon: GeekIconName;
  readonly value: string;
};

export function ProfileHero({
  avatar,
  backIcon = "chevron-left",
  gradient,
  location,
  name,
  onBack,
  title,
}: {
  readonly avatar: ImageSourcePropType;
  readonly backIcon?: Extract<GeekIconName, "chevron-down" | "chevron-left">;
  readonly gradient: readonly [string, string];
  readonly location: string;
  readonly name: string;
  readonly onBack?: () => void;
  readonly title?: string;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.hero, { paddingTop: insets.top + spacing.compact }]}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Svg height="100%" preserveAspectRatio="none" width="100%">
          <Defs>
            <LinearGradient id="profile-hero" x1="0" x2="1" y1="0" y2="1">
              <Stop offset="0" stopColor={gradient[0]} />
              <Stop offset="1" stopColor={gradient[1]} />
            </LinearGradient>
          </Defs>
          <Rect fill="url(#profile-hero)" height="100%" width="100%" />
        </Svg>
      </View>
      <View style={styles.toolbar}>
        {onBack ? (
          <GlassButton icon={backIcon} label="Fermer" onPress={onBack} />
        ) : (
          <Text style={styles.screenTitle}>{title}</Text>
        )}
        <View style={styles.toolbarActions}>
          <GlassButton icon="share" label="Partager" />
          <GlassButton icon="more-horizontal" label="Plus d’options" />
        </View>
      </View>
      <View style={styles.identity}>
        <View>
          <Image source={avatar} style={styles.avatar} />
          <View style={styles.online} />
        </View>
        <View style={styles.identityText}>
          <Text numberOfLines={1} style={styles.name}>
            {name}
          </Text>
          <View style={styles.locationRow}>
            <GeekIcon color={colors.controlSelected} name="map-pin" size={18} />
            <Text style={styles.location}>{location}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

export function ProfileStats({ stats }: { readonly stats: readonly ProfileStat[] }) {
  return (
    <ScrollView
      contentContainerStyle={styles.statsContent}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.stats}
    >
      {stats.map((stat) => (
        <View key={stat.detail} style={styles.statCard}>
          <GeekIcon name={stat.icon} size={24} />
          <Text style={styles.statValue}>{stat.value}</Text>
          <Text style={styles.statDetail}>{stat.detail}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

export function ProfileSocialSummary({ bio }: { readonly bio: string }) {
  return (
    <View style={styles.social}>
      <View style={styles.followRow}>
        <Text style={styles.followText}>0 Followers</Text>
        <Text style={styles.bullet}>•</Text>
        <Text style={styles.followText}>0 Suivi(e)s</Text>
      </View>
      <Text style={styles.bio}>{bio}</Text>
    </View>
  );
}

export function ProfileActions() {
  return (
    <View style={styles.actions}>
      <Pressable style={({ pressed }) => [styles.secondaryAction, pressed && styles.pressed]}>
        <Text style={styles.actionText}>Message</Text>
      </Pressable>
      <Pressable style={({ pressed }) => [styles.primaryAction, pressed && styles.pressed]}>
        <Text style={styles.primaryActionText}>Suivre</Text>
      </Pressable>
    </View>
  );
}

export function ProfileMatchCard({ children }: { readonly children: ReactNode }) {
  return (
    <View style={styles.matchCard}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Svg height="100%" preserveAspectRatio="none" width="100%">
          <Defs>
            <LinearGradient id="profile-match" x1="0" x2="0" y1="0" y2="1">
              <Stop offset="0" stopColor="#92AEF4" />
              <Stop offset="1" stopColor="#8781DF" />
            </LinearGradient>
          </Defs>
          <Rect fill="url(#profile-match)" height="100%" width="100%" />
        </Svg>
      </View>
      <View style={styles.matchTitleRow}>
        <Text style={styles.matchTitle}>You match!</Text>
        <GeekIcon color={colors.controlSelected} name="fire" size={24} />
      </View>
      {children}
    </View>
  );
}

function GlassButton({
  icon,
  label,
  onPress,
}: {
  readonly icon: GeekIconName;
  readonly label: string;
  readonly onPress?: () => void;
}) {
  return (
    <Pressable accessibilityLabel={label} accessibilityRole="button" onPress={onPress}>
      <AdaptiveGlassSurface style={styles.glassButton}>
        <GeekIcon name={icon} size={24} />
      </AdaptiveGlassSurface>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: { height: 254, paddingHorizontal: spacing.page },
  toolbar: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 52,
  },
  toolbarActions: { flexDirection: "row", gap: spacing.compact },
  glassButton: { alignItems: "center", height: 44, justifyContent: "center", width: 44 },
  screenTitle: { ...typography.screenTitle },
  identity: { alignItems: "center", flexDirection: "row", gap: spacing.medium, marginTop: 24 },
  avatar: { borderRadius: 36, height: 80, width: 80 },
  online: {
    backgroundColor: colors.success,
    borderRadius: 10,
    bottom: 0,
    height: 20,
    position: "absolute",
    right: 0,
    width: 20,
  },
  identityText: { flex: 1, gap: spacing.micro, minWidth: 0 },
  name: { color: colors.controlSelected, fontSize: 24, lineHeight: 29 },
  locationRow: { alignItems: "center", flexDirection: "row", gap: spacing.micro },
  location: { color: colors.controlSelected, fontSize: 13, lineHeight: 18 },
  stats: { marginTop: -16 },
  statsContent: { gap: spacing.compact, paddingHorizontal: spacing.page },
  statCard: {
    backgroundColor: "rgba(240,240,240,0.95)",
    borderRadius: 12,
    gap: spacing.micro,
    height: 113,
    padding: spacing.medium,
    width: 130,
  },
  statValue: { fontSize: 15, fontWeight: "600", lineHeight: 20 },
  statDetail: { color: colors.textSecondary, fontSize: 13, lineHeight: 17 },
  social: { gap: spacing.medium, paddingHorizontal: 24, paddingVertical: 22 },
  followRow: { alignItems: "center", flexDirection: "row", gap: spacing.compact },
  followText: { ...typography.body },
  bullet: { color: colors.textSecondary },
  bio: { color: "rgba(0,0,0,0.8)", fontSize: 13, lineHeight: 17 },
  actions: { flexDirection: "row", gap: spacing.compact, paddingHorizontal: spacing.page },
  secondaryAction: {
    alignItems: "center",
    borderColor: colors.divider,
    borderRadius: radii.capsule,
    borderWidth: 1,
    flex: 1,
    height: 46,
    justifyContent: "center",
  },
  primaryAction: {
    alignItems: "center",
    backgroundColor: colors.text,
    borderRadius: radii.capsule,
    flex: 1,
    height: 46,
    justifyContent: "center",
  },
  actionText: { ...typography.body },
  primaryActionText: { color: colors.controlSelected, ...typography.body },
  matchCard: {
    borderRadius: radii.detailCard,
    gap: spacing.page,
    marginHorizontal: spacing.medium,
    marginTop: 24,
    overflow: "hidden",
    padding: spacing.page,
  },
  matchTitleRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  matchTitle: { color: colors.controlSelected, fontSize: 18, fontWeight: "600" },
  pressed: { opacity: 0.7 },
});
