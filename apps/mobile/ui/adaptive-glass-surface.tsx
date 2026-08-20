import { colors, radii } from "@geek/design-tokens";
import { requireOptionalNativeModule } from "expo";
import type * as GlassEffectModule from "expo-glass-effect";
import type { PropsWithChildren } from "react";
import { Platform, StyleSheet, View, type ViewStyle } from "react-native";

const nativeGlassModule =
  Platform.OS === "ios" && requireOptionalNativeModule("ExpoGlassEffect")
    ? loadGlassEffectModule()
    : null;

function loadGlassEffectModule(): typeof GlassEffectModule {
  // The native module guard prevents older Expo Go binaries from evaluating
  // expo-glass-effect's strict native-module import.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("expo-glass-effect") as typeof GlassEffectModule;
}

export function AdaptiveGlassSurface({
  children,
  style,
}: PropsWithChildren<{ readonly style?: ViewStyle }>) {
  const supportsNativeGlass =
    nativeGlassModule?.isLiquidGlassAvailable() === true &&
    nativeGlassModule.isGlassEffectAPIAvailable();

  if (supportsNativeGlass && nativeGlassModule) {
    const { GlassView } = nativeGlassModule;
    return (
      <GlassView glassEffectStyle="regular" style={[styles.surface, style]}>
        {children}
      </GlassView>
    );
  }

  return <View style={[styles.surface, styles.fallback, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  surface: {
    borderRadius: radii.capsule,
    overflow: "hidden",
  },
  fallback: {
    backgroundColor: colors.navigationFallback,
    borderColor: colors.divider,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
