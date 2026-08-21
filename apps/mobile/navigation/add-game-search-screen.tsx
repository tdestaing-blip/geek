import { colors, spacing, typography } from "@geek/design-tokens";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMemo, useState } from "react";
import {
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AddGameSearchField } from "../ui/add-game-search-field";
import { AddGameToolbar } from "../ui/add-game-toolbar";
import { GamePlatformResultRow } from "../ui/game-platform-result-row";
import { GeekIcon } from "../ui/geek-icon";
import { PlatformCategoryCard } from "../ui/platform-category-card";
import {
  getPlatform,
  normalizeSearchText,
  PLATFORMS,
  searchGamePlatformResults,
  type GamePlatformSearchResult,
} from "./add-game-fixtures";
import type { RootStackParamList } from "./types";

type Props = NativeStackScreenProps<RootStackParamList, "AddGameSearch">;
type Suggestion =
  | { readonly id: string; readonly kind: "query"; readonly label: string }
  | { readonly id: string; readonly kind: "game"; readonly result: GamePlatformSearchResult };

export function AddGameSearchScreen({ navigation }: Props) {
  const [draftQuery, setDraftQuery] = useState("");
  const [committedQuery, setCommittedQuery] = useState<string | null>(null);
  const [selectedPlatformId, setSelectedPlatformId] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const mode = !draftQuery.trim() ? "empty" : committedQuery === null ? "typing" : "submitted";
  const query = mode === "submitted" ? (committedQuery ?? "") : draftQuery;
  const results = useMemo(
    () => searchGamePlatformResults(query, mode === "submitted" ? selectedPlatformId : null),
    [mode, query, selectedPlatformId],
  );

  function updateDraft(value: string) {
    setDraftQuery(value);
    setCommittedQuery(null);
    setSelectedPlatformId(null);
    setFilterOpen(false);
  }
  function submit(value = draftQuery) {
    const trimmed = value.trim();
    if (!trimmed) return;
    setDraftQuery(trimmed);
    setCommittedQuery(trimmed);
    setFilterOpen(false);
    Keyboard.dismiss();
  }
  function openRegions(result: GamePlatformSearchResult) {
    Keyboard.dismiss();
    navigation.navigate("GameRegions", { gameId: result.gameId, platformId: result.platformId });
  }

  return (
    <SafeAreaView edges={["top"]} style={styles.page}>
      <AddGameToolbar mode="close" onPress={navigation.goBack} title="Nouveau jeu" />
      <AddGameSearchField
        autoFocus
        onChangeText={updateDraft}
        onSubmitEditing={() => submit()}
        placeholder="Chercher un jeu..."
        value={draftQuery}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        {mode === "empty" ? (
          <PlatformGrid
            onPress={(platformId) => navigation.navigate("PlatformCatalog", { platformId })}
          />
        ) : (
          <SearchResults
            committed={mode === "submitted"}
            filterOpen={filterOpen}
            onCommitSuggestion={submit}
            onFilterOpenChange={setFilterOpen}
            onOpenRegions={openRegions}
            onSelectPlatform={setSelectedPlatformId}
            query={query}
            results={results}
            selectedPlatformId={selectedPlatformId}
          />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function PlatformGrid({ onPress }: { readonly onPress: (platformId: string) => void }) {
  const { width } = useWindowDimensions();
  const cardWidth = (width - spacing.page * 2 - spacing.compact) / 2;
  return (
    <FlatList
      columnWrapperStyle={styles.platformRow}
      contentContainerStyle={styles.platformGrid}
      data={PLATFORMS}
      keyboardShouldPersistTaps="handled"
      keyExtractor={({ id }) => id}
      numColumns={2}
      renderItem={({ item }) => (
        <PlatformCategoryCard item={item} onPress={() => onPress(item.id)} width={cardWidth} />
      )}
    />
  );
}

function SearchResults({
  committed,
  filterOpen,
  onCommitSuggestion,
  onFilterOpenChange,
  onOpenRegions,
  onSelectPlatform,
  query,
  results,
  selectedPlatformId,
}: {
  readonly committed: boolean;
  readonly filterOpen: boolean;
  readonly onCommitSuggestion: (value: string) => void;
  readonly onFilterOpenChange: (value: boolean) => void;
  readonly onOpenRegions: (result: GamePlatformSearchResult) => void;
  readonly onSelectPlatform: (platformId: string | null) => void;
  readonly query: string;
  readonly results: readonly GamePlatformSearchResult[];
  readonly selectedPlatformId: string | null;
}) {
  const suggestions: readonly Suggestion[] = committed
    ? results.map((result) => ({
        id: `game:${result.gameId}:${result.platformId}`,
        kind: "game" as const,
        result,
      }))
    : [
        { id: `query:${normalizeSearchText(query)}`, kind: "query", label: query.trim() },
        ...(normalizeSearchText(query) === "zelda"
          ? [{ id: "query:legend-of-zelda", kind: "query" as const, label: "The Legend of Zelda" }]
          : []),
        ...results.map((result) => ({
          id: `game:${result.gameId}:${result.platformId}`,
          kind: "game" as const,
          result,
        })),
      ];
  const availablePlatforms = [
    ...new Set(searchGamePlatformResults(query).map(({ platformId }) => platformId)),
  ];
  return (
    <FlatList
      contentContainerStyle={styles.results}
      data={suggestions}
      keyboardShouldPersistTaps="handled"
      keyExtractor={({ id }) => id}
      ListHeaderComponent={
        committed ? (
          <ConsoleFilter
            availablePlatforms={availablePlatforms}
            open={filterOpen}
            onOpenChange={onFilterOpenChange}
            onSelect={onSelectPlatform}
            selectedPlatformId={selectedPlatformId}
          />
        ) : null
      }
      renderItem={({ item }) =>
        item.kind === "query" ? (
          <Pressable onPress={() => onCommitSuggestion(item.label)} style={styles.queryRow}>
            <GeekIcon name="search" />
            <Text style={styles.queryText}>{item.label}</Text>
          </Pressable>
        ) : (
          <GamePlatformResultRow item={item.result} onPress={() => onOpenRegions(item.result)} />
        )
      }
    />
  );
}

function ConsoleFilter({
  availablePlatforms,
  onSelect,
  onOpenChange,
  open,
  selectedPlatformId,
}: {
  readonly availablePlatforms: readonly string[];
  readonly onSelect: (value: string | null) => void;
  readonly onOpenChange: (value: boolean) => void;
  readonly open: boolean;
  readonly selectedPlatformId: string | null;
}) {
  const options: readonly (string | null)[] = [null, ...availablePlatforms];
  return (
    <View style={styles.filterWrap}>
      <Pressable onPress={() => onOpenChange(!open)} style={styles.filterButton}>
        <Text style={styles.filterText}>
          Console: {selectedPlatformId ? getPlatform(selectedPlatformId).shortName : "Toutes"}
        </Text>
        <GeekIcon name="chevron-down" size={18} />
      </Pressable>
      {open ? (
        <View style={styles.filterMenu}>
          {options.map((id) => (
            <Pressable
              key={id ?? "all"}
              onPress={() => {
                onSelect(id);
                onOpenChange(false);
              }}
              style={styles.filterOption}
            >
              <Text style={styles.filterText}>{id ? getPlatform(id).name : "Toutes"}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: colors.background, flex: 1 },
  flex: { flex: 1 },
  platformGrid: { gap: spacing.compact, padding: spacing.page },
  platformRow: { gap: spacing.compact },
  results: { paddingBottom: 32, paddingTop: spacing.compact },
  queryRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.medium,
    minHeight: 48,
    paddingHorizontal: spacing.page,
  },
  queryText: { ...typography.body, color: colors.text },
  filterWrap: { marginBottom: spacing.compact, paddingHorizontal: spacing.page, zIndex: 2 },
  filterButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.control,
    borderRadius: 18,
    flexDirection: "row",
    gap: spacing.micro,
    minHeight: 36,
    paddingHorizontal: spacing.medium,
  },
  filterText: { ...typography.body, color: colors.text },
  filterMenu: {
    backgroundColor: colors.background,
    borderColor: colors.divider,
    borderRadius: 12,
    borderWidth: 1,
    left: spacing.page,
    minWidth: 190,
    padding: spacing.micro,
    position: "absolute",
    top: 40,
  },
  filterOption: {
    borderRadius: 8,
    paddingHorizontal: spacing.compact,
    paddingVertical: spacing.compact,
  },
});
