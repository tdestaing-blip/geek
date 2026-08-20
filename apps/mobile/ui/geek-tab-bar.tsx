import {
  colors,
  navigation as navigationTokens,
  radii,
  spacing,
  typography,
} from "@geek/design-tokens";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AdaptiveGlassSurface } from "./adaptive-glass-surface";
import { GeekIcon, type GeekIconName } from "./geek-icon";

const TAB_ICONS = {
  Activity: "activity",
  Collection: "collection",
  Community: "community",
  Profile: "profile",
} satisfies Readonly<Record<string, GeekIconName>>;

export function GeekTabBar({ navigation, state }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 25) }]}>
      <AdaptiveGlassSurface style={styles.surface}>
        {state.routes.map((route, index) => {
          const selected = state.index === index;
          return (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              key={route.key}
              onPress={() => {
                const event = navigation.emit({
                  canPreventDefault: true,
                  target: route.key,
                  type: "tabPress",
                });
                if (!selected && !event.defaultPrevented) {
                  navigation.navigate(route.name, route.params);
                }
              }}
              style={({ pressed }) => [
                styles.tab,
                selected && styles.selectedTab,
                pressed && styles.pressed,
              ]}
            >
              <GeekIcon
                color={selected ? colors.accent : colors.navigationIcon}
                name={TAB_ICONS[route.name as keyof typeof TAB_ICONS]}
                size={navigationTokens.iconSize}
              />
              <Text style={[styles.tabLabel, selected && styles.selectedLabel]}>{route.name}</Text>
            </Pressable>
          );
        })}
      </AdaptiveGlassSurface>
      <AdaptiveGlassSurface style={styles.actionSurface}>
        <Pressable
          accessibilityLabel="Ajouter"
          accessibilityRole="button"
          onPress={() => undefined}
          style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
        >
          <GeekIcon color={colors.accent} name="plus" size={navigationTokens.iconSize} />
        </Pressable>
      </AdaptiveGlassSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    backgroundColor: "transparent",
    bottom: 0,
    flexDirection: "row",
    gap: spacing.page,
    left: 0,
    paddingHorizontal: 20,
    position: "absolute",
    right: 0,
  },
  surface: {
    flex: 1,
    flexDirection: "row",
    height: navigationTokens.surfaceHeight,
    paddingHorizontal: spacing.hairline,
  },
  tab: {
    alignItems: "center",
    borderRadius: radii.capsule,
    flex: 1,
    justifyContent: "center",
    minWidth: 0,
  },
  selectedTab: { backgroundColor: colors.navigationSelected },
  tabLabel: { color: colors.navigationIcon, ...typography.tabLabel },
  selectedLabel: { color: colors.accent },
  actionSurface: {
    height: navigationTokens.actionSize,
    width: navigationTokens.actionSize,
  },
  addButton: {
    alignItems: "center",
    borderRadius: radii.capsule,
    flex: 1,
    justifyContent: "center",
  },
  pressed: { opacity: 0.7 },
});
