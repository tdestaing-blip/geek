import { colors, spacing, typography } from "@geek/design-tokens";
import type { Platform as CatalogPlatform } from "@geek/domain";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect, useMemo, useState } from "react";
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
import { normalizeSearchText, PLATFORM_PRESENTATIONS } from "./add-game-fixtures";
import { loadCanonicalPlatforms, searchCanonicalGamePlatforms } from "./canonical-catalog-data";
import type { GamePlatformSearchResult } from "./canonical-catalog";
import type { RootStackParamList } from "./types";

type Props = NativeStackScreenProps<RootStackParamList, "AddGameSearch">;
type Suggestion =
  | { readonly id: string; readonly kind: "query"; readonly label: string }
  | { readonly id: string; readonly kind: "game"; readonly result: GamePlatformSearchResult };
type LoadState = "idle" | "loading" | "error";

export function AddGameSearchScreen({ navigation }: Props) {
  const [draftQuery, setDraftQuery] = useState("");
  const [committedQuery, setCommittedQuery] = useState<string | null>(null);
  const [selectedPlatformId, setSelectedPlatformId] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [platforms, setPlatforms] = useState<readonly CatalogPlatform[]>([]);
  const [results, setResults] = useState<readonly GamePlatformSearchResult[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const mode = !draftQuery.trim() ? "empty" : committedQuery === null ? "typing" : "submitted";
  const query = mode === "submitted" ? (committedQuery ?? "") : draftQuery;
  const visibleResults = useMemo(
    () =>
      mode === "submitted" && selectedPlatformId
        ? results.filter((result) => result.platformId === selectedPlatformId)
        : results,
    [mode, results, selectedPlatformId],
  );

  useEffect(() => {
    let active = true;
    void loadCanonicalPlatforms().then((result) => {
      if (active && result.outcome === "ok") setPlatforms(result.data);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) return;

    let active = true;
    const timeout = setTimeout(() => {
      void searchCanonicalGamePlatforms(trimmed).then((result) => {
        if (!active) return;
        if (result.outcome === "ok") {
          setResults(result.data);
          setLoadState("idle");
        } else {
          setResults([]);
          setLoadState("error");
        }
      });
    }, 180);
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [query]);

  function updateDraft(value: string) {
    setDraftQuery(value);
    setCommittedQuery(null);
    setSelectedPlatformId(null);
    setFilterOpen(false);
    setResults([]);
    setLoadState(value.trim() ? "loading" : "idle");
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
            canonicalPlatforms={platforms}
            onPress={(platformId) => navigation.navigate("PlatformCatalog", { platformId })}
          />
        ) : (
          <SearchResults
            committed={mode === "submitted"}
            filterOpen={filterOpen}
            loadState={loadState}
            onCommitSuggestion={submit}
            onFilterOpenChange={setFilterOpen}
            onOpenRegions={openRegions}
            onSelectPlatform={setSelectedPlatformId}
            query={query}
            results={visibleResults}
            selectedPlatformId={selectedPlatformId}
            unfilteredResults={results}
          />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function PlatformGrid({
  canonicalPlatforms,
  onPress,
}: {
  readonly canonicalPlatforms: readonly CatalogPlatform[];
  readonly onPress: (platformId: string) => void;
}) {
  const { width } = useWindowDimensions();
  const cardWidth = (width - spacing.page * 2 - spacing.compact) / 2;
  const platformBySlug = new Map(canonicalPlatforms.map((platform) => [platform.slug, platform]));
  return (
    <FlatList
      columnWrapperStyle={styles.platformRow}
      contentContainerStyle={styles.platformGrid}
      data={PLATFORM_PRESENTATIONS}
      keyboardShouldPersistTaps="handled"
      keyExtractor={({ slug }) => slug}
      numColumns={2}
      renderItem={({ item }) => {
        const canonical = platformBySlug.get(item.slug);
        return (
          <PlatformCategoryCard
            item={item}
            onPress={canonical ? () => onPress(canonical.id) : undefined}
            width={cardWidth}
          />
        );
      }}
    />
  );
}

function SearchResults({
  committed,
  filterOpen,
  loadState,
  onCommitSuggestion,
  onFilterOpenChange,
  onOpenRegions,
  onSelectPlatform,
  query,
  results,
  selectedPlatformId,
  unfilteredResults,
}: {
  readonly committed: boolean;
  readonly filterOpen: boolean;
  readonly loadState: LoadState;
  readonly onCommitSuggestion: (value: string) => void;
  readonly onFilterOpenChange: (value: boolean) => void;
  readonly onOpenRegions: (result: GamePlatformSearchResult) => void;
  readonly onSelectPlatform: (platformId: string | null) => void;
  readonly query: string;
  readonly results: readonly GamePlatformSearchResult[];
  readonly selectedPlatformId: string | null;
  readonly unfilteredResults: readonly GamePlatformSearchResult[];
}) {
  const suggestions: readonly Suggestion[] = committed
    ? results.map((result) => ({
        id: `game:${result.gameId}:${result.platformId}`,
        kind: "game" as const,
        result,
      }))
    : [
        { id: `query:${normalizeSearchText(query)}`, kind: "query", label: query.trim() },
        ...results.map((result) => ({
          id: `game:${result.gameId}:${result.platformId}`,
          kind: "game" as const,
          result,
        })),
      ];
  const availablePlatforms = [
    ...new Map(
      unfilteredResults.map((result) => [
        result.platformId,
        { id: result.platformId, name: result.platformName },
      ]),
    ).values(),
  ];
  const emptyMessage =
    loadState === "loading"
      ? "Recherche…"
      : loadState === "error"
        ? "Impossible de charger le catalogue. Réessayez."
        : "Aucun jeu trouvé.";
  return (
    <FlatList
      contentContainerStyle={styles.results}
      data={loadState === "idle" ? suggestions : []}
      keyboardShouldPersistTaps="handled"
      keyExtractor={({ id }) => id}
      ListEmptyComponent={<Text style={styles.stateText}>{emptyMessage}</Text>}
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
  readonly availablePlatforms: readonly { readonly id: string; readonly name: string }[];
  readonly onSelect: (value: string | null) => void;
  readonly onOpenChange: (value: boolean) => void;
  readonly open: boolean;
  readonly selectedPlatformId: string | null;
}) {
  const selected = availablePlatforms.find(({ id }) => id === selectedPlatformId);
  return (
    <View style={styles.filterWrap}>
      <Pressable onPress={() => onOpenChange(!open)} style={styles.filterButton}>
        <Text style={styles.filterText}>Console: {selected?.name ?? "Toutes"}</Text>
        <GeekIcon name="chevron-down" size={18} />
      </Pressable>
      {open ? (
        <View style={styles.filterMenu}>
          {[{ id: null, name: "Toutes" } as const, ...availablePlatforms].map((platform) => (
            <Pressable
              key={platform.id ?? "all"}
              onPress={() => {
                onSelect(platform.id);
                onOpenChange(false);
              }}
              style={styles.filterOption}
            >
              <Text style={styles.filterText}>{platform.name}</Text>
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
  results: { flexGrow: 1, paddingBottom: 32, paddingTop: spacing.compact },
  queryRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.medium,
    minHeight: 48,
    paddingHorizontal: spacing.page,
  },
  queryText: { ...typography.body, color: colors.text },
  stateText: {
    ...typography.body,
    color: colors.textSecondary,
    paddingHorizontal: spacing.page,
    paddingVertical: spacing.page,
    textAlign: "center",
  },
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
