import { colors, spacing, typography } from "@geek/design-tokens";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect, useMemo, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AddGameSearchField } from "../ui/add-game-search-field";
import { AddGameToolbar } from "../ui/add-game-toolbar";
import { AlbumCard } from "../ui/album-card";
import { GamePlatformResultRow } from "../ui/game-platform-result-row";
import { ALBUMS } from "./album-fixtures";
import { normalizeSearchText } from "./add-game-fixtures";
import {
  loadCanonicalPlatformCatalog,
  type CanonicalPlatformCatalog,
} from "./canonical-catalog-data";
import type { RootStackParamList } from "./types";

type Props = NativeStackScreenProps<RootStackParamList, "PlatformCatalog">;

export function PlatformCatalogScreen({ navigation, route }: Props) {
  const [query, setQuery] = useState("");
  const [catalog, setCatalog] = useState<CanonicalPlatformCatalog | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let active = true;
    void loadCanonicalPlatformCatalog(route.params.platformId).then((result) => {
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
  }, [route.params.platformId]);

  const results = useMemo(() => {
    const normalizedQuery = normalizeSearchText(query);
    if (!catalog || !normalizedQuery) return catalog?.results ?? [];
    return catalog.results.filter((result) =>
      normalizeSearchText(result.title).includes(normalizedQuery),
    );
  }, [catalog, query]);
  const platformAlbums = catalog
    ? ALBUMS.filter(({ subtitle }) => subtitle === catalog.platform.name)
    : [];
  const stateMessage =
    state === "loading"
      ? "Chargement du catalogue…"
      : state === "error"
        ? "Catalogue indisponible. Revenez en arrière pour réessayer."
        : "Aucun jeu trouvé.";

  return (
    <SafeAreaView edges={["top"]} style={styles.page}>
      <AddGameToolbar
        mode="back"
        onPress={navigation.goBack}
        title={catalog?.platform.name ?? "Catalogue"}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <FlatList
          contentContainerStyle={styles.content}
          data={state === "ready" ? results : []}
          keyboardShouldPersistTaps="handled"
          keyExtractor={({ gameId, platformId }) => `${gameId}:${platformId}`}
          ListEmptyComponent={<Text style={styles.stateText}>{stateMessage}</Text>}
          ListHeaderComponent={
            catalog ? (
              <View style={styles.header}>
                <AddGameSearchField
                  onChangeText={setQuery}
                  placeholder={`Rechercher dans ${catalog.platform.name}...`}
                  value={query}
                />
                {platformAlbums.length ? (
                  <ScrollView
                    contentContainerStyle={styles.albums}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                  >
                    {platformAlbums.map((album) => (
                      <View key={album.id} style={styles.album}>
                        <AlbumCard
                          album={album}
                          onPress={() => navigation.navigate("AlbumDetail", { albumId: album.id })}
                        />
                      </View>
                    ))}
                  </ScrollView>
                ) : null}
                <Text style={styles.count}>
                  {catalog.results.length} {catalog.results.length === 1 ? "jeu" : "jeux"}
                </Text>
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <GamePlatformResultRow
              item={item}
              onPress={() =>
                navigation.navigate("GameRegions", {
                  gameId: item.gameId,
                  platformId: item.platformId,
                })
              }
            />
          )}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: colors.background, flex: 1 },
  flex: { flex: 1 },
  content: { flexGrow: 1, paddingBottom: 32 },
  header: { gap: spacing.page, paddingTop: spacing.compact },
  albums: { gap: spacing.compact, paddingHorizontal: spacing.page },
  album: { width: 280 },
  count: { ...typography.sectionTitle, color: colors.text, paddingHorizontal: spacing.page },
  stateText: {
    ...typography.body,
    color: colors.textSecondary,
    padding: spacing.page,
    textAlign: "center",
  },
});
