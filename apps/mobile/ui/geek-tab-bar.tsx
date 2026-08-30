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
import { GeekIcon } from "./geek-icon";
import { getRootDestination } from "../navigation/navigation-architecture";

export function GeekTabBar({ navigation, state }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 25) }]}>
      <AdaptiveGlassSurface style={styles.surface}>
        {state.routes.map((route, index) => {
          const destination = getRootDestination(route.name);
          if (!destination) throw new Error(`Unknown Geek root destination: ${route.name}`);
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
                name={destination.icon}
                size={navigationTokens.iconSize}
              />
              <Text numberOfLines={1} style={[styles.tabLabel, selected && styles.selectedLabel]}>
                {destination.label}
              </Text>
            </Pressable>
          );
        })}
      </AdaptiveGlassSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    backgroundColor: "transparent",
    bottom: 0,
    left: 0,
    paddingHorizontal: 20,
    position: "absolute",
    right: 0,
  },
  surface: {
    flexDirection: "row",
    height: navigationTokens.surfaceHeight,
    paddingHorizontal: spacing.hairline,
    width: "100%",
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
  pressed: { opacity: 0.7 },
});
