import { colors, spacing, typography } from "@geek/design-tokens";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMemo, useState } from "react";
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
import { getPlatform, searchGamePlatformResults } from "./add-game-fixtures";
import type { RootStackParamList } from "./types";

type Props = NativeStackScreenProps<RootStackParamList, "PlatformCatalog">;

export function PlatformCatalogScreen({ navigation, route }: Props) {
  const platform = getPlatform(route.params.platformId);
  const [query, setQuery] = useState("");
  const platformResults = useMemo(() => searchGamePlatformResults("", platform.id), [platform.id]);
  const results = useMemo(
    () => searchGamePlatformResults(query, platform.id),
    [platform.id, query],
  );
  const platformAlbums = ALBUMS.filter(({ subtitle }) => subtitle === platform.name);
  return (
    <SafeAreaView edges={["top"]} style={styles.page}>
      <AddGameToolbar mode="back" onPress={navigation.goBack} title={platform.shortName} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <FlatList
          contentContainerStyle={styles.content}
          data={results}
          keyboardShouldPersistTaps="handled"
          keyExtractor={({ gameId, platformId }) => `${gameId}:${platformId}`}
          ListHeaderComponent={
            <View style={styles.header}>
              <AddGameSearchField
                onChangeText={setQuery}
                placeholder={`Rechercher dans ${platform.name}...`}
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
                {platformResults.length} {platformResults.length === 1 ? "jeu" : "jeux"}
              </Text>
            </View>
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
  content: { paddingBottom: 32 },
  header: { gap: spacing.page, paddingTop: spacing.compact },
  albums: { gap: spacing.compact, paddingHorizontal: spacing.page },
  album: { width: 280 },
  count: { ...typography.sectionTitle, color: colors.text, paddingHorizontal: spacing.page },
});
