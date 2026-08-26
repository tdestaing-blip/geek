import { colors, radii, spacing, typography } from "@geek/design-tokens";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useEffect, useState } from "react";
import { FlatList, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AddGameToolbar } from "../ui/add-game-toolbar";
import { GeekIcon } from "../ui/geek-icon";
import { getCatalogRegionPresentation, getEditionVariantLabel } from "./canonical-catalog";
import { loadCanonicalGameRegions, type CanonicalGameRegions } from "./canonical-catalog-data";
import type { GameRegionVariant } from "./canonical-catalog";
import { findActiveWishlistIntent, toggleWishlistIntent } from "./collection-surfaces-data";
import type { RootStackParamList } from "./types";

type Props = NativeStackScreenProps<RootStackParamList, "GameRegions">;

export function GameRegionsScreen({ navigation, route }: Props) {
  const [catalog, setCatalog] = useState<CanonicalGameRegions | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [wishlistIntentId, setWishlistIntentId] = useState<string | null | undefined>(undefined);
  const [wishlistBusy, setWishlistBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void loadCanonicalGameRegions(route.params.gameId, route.params.platformId).then((result) => {
      if (!active) return;
      if (result.outcome === "ok") {
        setCatalog(result.data);
        setState("ready");
      } else {
        setCatalog(null);
        setState("error");
      }
    });
    return () => {
      active = false;
    };
  }, [route.params.gameId, route.params.platformId]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void findActiveWishlistIntent(route.params.gameId).then((intentId) => {
        if (active) setWishlistIntentId(intentId);
      });
      return () => {
        active = false;
      };
    }, [route.params.gameId]),
  );

  const stateMessage =
    state === "loading"
      ? "Chargement des éditions…"
      : state === "error"
        ? "Ce jeu est indisponible. Revenez en arrière pour réessayer."
        : "Aucune édition physique disponible.";
  return (
    <SafeAreaView edges={["top"]} style={styles.page}>
      <AddGameToolbar
        mode="back"
        onPress={navigation.goBack}
        title={catalog?.game.canonicalTitle ?? "Éditions"}
      />
      <Pressable
        accessibilityRole="button"
        disabled={wishlistIntentId === undefined || wishlistBusy}
        onPress={() => {
          const previous = wishlistIntentId;
          setWishlistBusy(true);
          setWishlistIntentId(previous ? null : "pending");
          void toggleWishlistIntent({
            gameId: route.params.gameId,
            ...(previous ? { intentId: previous } : {}),
          })
            .then(() => findActiveWishlistIntent(route.params.gameId))
            .then(setWishlistIntentId)
            .catch(() => setWishlistIntentId(previous))
            .finally(() => setWishlistBusy(false));
        }}
        style={({ pressed }) => [styles.wishlistAction, pressed && styles.pressed]}
      >
        <GeekIcon name={wishlistIntentId ? "checkbox" : "bell-ring"} size={18} />
        <Text style={styles.wishlistActionText}>
          {wishlistIntentId ? "Jeu dans la Wishlist" : "Ajouter le jeu à la Wishlist"}
        </Text>
      </Pressable>
      <FlatList
        contentContainerStyle={styles.content}
        data={state === "ready" ? (catalog?.variants ?? []) : []}
        keyExtractor={({ editionId }) => editionId}
        ListEmptyComponent={<Text style={styles.stateText}>{stateMessage}</Text>}
        renderItem={({ item }) => (
          <GameRegionRow
            item={item}
            onPress={() =>
              navigation.navigate("Market", { gameId: item.gameId, editionId: item.editionId })
            }
          />
        )}
      />
    </SafeAreaView>
  );
}

function GameRegionRow({
  item,
  onPress,
}: {
  readonly item: GameRegionVariant;
  readonly onPress: () => void;
}) {
  const region = getCatalogRegionPresentation(item.regionCode);
  const variant = getEditionVariantLabel(item.editionName);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      {item.artworkUrl ? (
        <Image source={{ uri: item.artworkUrl }} style={styles.artwork} />
      ) : (
        <View style={[styles.artwork, styles.placeholder]}>
          <GeekIcon color={colors.textSecondary} name="gamepad" size={28} />
        </View>
      )}
      <View style={styles.copy}>
        <Text numberOfLines={2} style={styles.title}>
          {item.title}
        </Text>
        <View style={styles.meta}>
          <Text style={styles.flag}>{region.flag}</Text>
          <Text numberOfLines={2} style={styles.platform}>
            {region.label} · {variant} · {item.platformName}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: colors.background, flex: 1 },
  content: { flexGrow: 1, paddingBottom: 32, paddingTop: spacing.compact },
  wishlistAction: {
    alignItems: "center",
    borderColor: colors.divider,
    borderRadius: radii.capsule,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.compact,
    justifyContent: "center",
    marginHorizontal: spacing.page,
    marginVertical: spacing.compact,
    minHeight: 44,
    paddingHorizontal: spacing.page,
  },
  wishlistActionText: { ...typography.body, color: colors.text, fontWeight: "600" },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: 15,
    minHeight: 78,
    paddingHorizontal: spacing.page,
    paddingVertical: spacing.micro,
  },
  pressed: { opacity: 0.65 },
  artwork: { borderRadius: radii.wishlistImage, height: 70, width: 70 },
  placeholder: {
    alignItems: "center",
    backgroundColor: colors.surfaceSubtle,
    justifyContent: "center",
  },
  copy: { flex: 1, gap: spacing.micro },
  title: { ...typography.body, color: colors.text, fontWeight: "600" },
  meta: { alignItems: "center", flexDirection: "row", gap: spacing.micro },
  flag: { fontSize: 16, lineHeight: 18 },
  platform: { ...typography.metadata, color: colors.textSecondary, flex: 1 },
  stateText: {
    ...typography.body,
    color: colors.textSecondary,
    padding: spacing.page,
    textAlign: "center",
  },
});
