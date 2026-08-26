import { colors, spacing, typography } from "@geek/design-tokens";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
  Animated,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  type ViewToken,
  View,
} from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { albumRevealHaptic, albumTargetArrivedHaptic } from "../lib/haptics";
import { GameGridItem, type GameGridItemContent } from "../ui/game-grid-item";
import { GeekIcon } from "../ui/geek-icon";
import { getPlatformPresentation } from "./add-game-fixtures";
import {
  loadExactEditionOwnership,
  loadRevealAlbum,
  loadRevealMedia,
  type RevealAlbumData,
} from "./add-copy-data";
import {
  findAlbumRevealRowIndex,
  groupAlbumRevealEntriesIntoRows,
  resolveAlbumRevealEntryIndex,
  shouldStageAlbumRevealEntry,
  type AlbumRevealRow,
  type AlbumRevealRenderPhase,
} from "./add-copy-flow";
import { getAlbumTheme } from "./album-theme";
import { loadCanonicalMarket } from "./canonical-catalog-data";
import type { CanonicalMarketCatalog } from "./canonical-catalog";
import type { RootStackParamList } from "./types";

type Props = NativeStackScreenProps<RootStackParamList, "AlbumReveal">;
type RevealPhase = "intro" | AlbumRevealRenderPhase;
type RevealState =
  | { readonly status: "loading" }
  | { readonly status: "error" }
  | {
      readonly status: "ready";
      readonly albumData: RevealAlbumData;
      readonly catalog: CanonicalMarketCatalog;
      readonly rows: readonly AlbumRevealRow[];
      readonly targetRowIndex: number;
      readonly revealMediaUrl: string | null;
    };

const ALBUM_GRID_COLUMNS = 2;

export function AlbumRevealScreen(props: Props) {
  return (
    <SafeAreaProvider>
      <AlbumRevealContent {...props} />
    </SafeAreaProvider>
  );
}

function AlbumRevealContent({ navigation, route }: Props) {
  const [state, setState] = useState<RevealState>({ status: "loading" });
  const [phase, setPhase] = useState<RevealPhase>("intro");
  const phaseRef = useRef<RevealPhase>("intro");
  const targetSettled = useRef(false);
  const targetVisible = useRef(false);
  const scrollInFlight = useRef(false);
  const listRef = useRef<FlatList<AlbumRevealRow>>(null);
  const arrivalTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollFallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [intro] = useState(() => new Animated.Value(0));
  const [platformIntro] = useState(() => new Animated.Value(0));
  const [stagedOverlay] = useState(() => new Animated.Value(1));

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    let active = true;
    void Promise.all([
      loadRevealAlbum(route.params.albumId),
      loadCanonicalMarket(route.params.gameId, route.params.editionId),
      loadExactEditionOwnership(route.params.editionId),
      loadRevealMedia(route.params.copyId, route.params.gameId, route.params.editionId),
    ]).then(
      ([albumData, catalog, exactCopies, revealMedia]) => {
        if (!active) return;
        const targetIndex = albumData
          ? resolveAlbumRevealEntryIndex(
              albumData.album,
              route.params.entryId,
              route.params.gameId,
              route.params.editionId,
            )
          : null;
        const target = targetIndex === null ? null : albumData?.album.entries[targetIndex];
        const rows = albumData
          ? groupAlbumRevealEntriesIntoRows(albumData.album.entries, ALBUM_GRID_COLUMNS)
          : [];
        const targetRowIndex = findAlbumRevealRowIndex(rows, route.params.entryId);
        if (
          !albumData ||
          catalog.outcome !== "ok" ||
          targetIndex === null ||
          targetRowIndex === null ||
          !target ||
          !target.state.owned ||
          !exactCopies?.some((copy) => copy.id === route.params.copyId)
        ) {
          setState({ status: "error" });
          return;
        }
        setState({
          status: "ready",
          albumData,
          catalog: catalog.data,
          rows,
          targetRowIndex,
          revealMediaUrl: revealMedia.url,
        });
        Animated.parallel([
          Animated.timing(intro, {
            duration: 280,
            toValue: 1,
            useNativeDriver: true,
          }),
          Animated.sequence([
            Animated.delay(110),
            Animated.timing(platformIntro, {
              duration: 220,
              toValue: 1,
              useNativeDriver: true,
            }),
          ]),
        ]).start();
      },
      () => {
        if (active) setState({ status: "error" });
      },
    );
    return () => {
      active = false;
    };
  }, [
    intro,
    platformIntro,
    route.params.albumId,
    route.params.copyId,
    route.params.editionId,
    route.params.entryId,
    route.params.gameId,
  ]);

  useEffect(
    () => () => {
      if (revealTimer.current) clearTimeout(revealTimer.current);
      if (arrivalTimer.current) clearTimeout(arrivalTimer.current);
      if (scrollFallbackTimer.current) clearTimeout(scrollFallbackTimer.current);
      intro.stopAnimation();
      platformIntro.stopAnimation();
      stagedOverlay.stopAnimation();
    },
    [intro, platformIntro, stagedOverlay],
  );

  const completeTargetArrival = useCallback(() => {
    if (phaseRef.current !== "album_staged" || targetSettled.current) return;
    targetSettled.current = true;
    void albumTargetArrivedHaptic();
    revealTimer.current = setTimeout(() => {
      phaseRef.current = "album_revealing";
      setPhase("album_revealing");
      Animated.timing(stagedOverlay, {
        duration: 300,
        toValue: 0,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          phaseRef.current = "album_revealed";
          setPhase("album_revealed");
        }
      });
      void albumRevealHaptic();
    }, 320);
  }, [stagedOverlay]);

  const scheduleTargetArrival = useCallback(
    (delay: number) => {
      if (arrivalTimer.current) clearTimeout(arrivalTimer.current);
      arrivalTimer.current = setTimeout(() => {
        if (!scrollInFlight.current && targetVisible.current) completeTargetArrival();
      }, delay);
    },
    [completeTargetArrival],
  );

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken<AlbumRevealRow>[] }) => {
      targetVisible.current = viewableItems.some((item) =>
        item.item.entries.some((entry) => entry.id === route.params.entryId),
      );
      if (targetVisible.current && !scrollInFlight.current) scheduleTargetArrival(80);
    },
    [route.params.entryId, scheduleTargetArrival],
  );

  const onMomentumScrollEnd = useCallback(() => {
    scrollInFlight.current = false;
    scheduleTargetArrival(80);
  }, [scheduleTargetArrival]);

  const onMomentumScrollBegin = useCallback(() => {
    scrollInFlight.current = true;
    if (scrollFallbackTimer.current) clearTimeout(scrollFallbackTimer.current);
  }, []);

  function openAlbum(targetRowIndex: number) {
    phaseRef.current = "album_staged";
    scrollInFlight.current = true;
    setPhase("album_staged");
    requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({
        animated: true,
        index: targetRowIndex,
        viewPosition: 0.42,
      });
      scrollFallbackTimer.current = setTimeout(() => {
        scrollInFlight.current = false;
        scheduleTargetArrival(80);
      }, 220);
    });
  }

  if (state.status !== "ready") {
    return (
      <View style={styles.centered}>
        <Text style={styles.stateText}>
          {state.status === "loading"
            ? "Préparation de votre Album…"
            : "Votre jeu a bien été ajouté, mais l’Album ne peut pas être affiché."}
        </Text>
        {state.status === "error" ? (
          <PrimaryButton label="Terminer" onPress={navigation.goBack} />
        ) : null}
      </View>
    );
  }

  return phase === "intro" ? (
    <RevealIntro
      albumData={state.albumData}
      catalog={state.catalog}
      revealMediaUrl={state.revealMediaUrl}
      enrichmentWarning={route.params.enrichmentWarning}
      photoWarning={route.params.photoWarning}
      intro={intro}
      platformIntro={platformIntro}
      onNext={() => openAlbum(state.targetRowIndex)}
    />
  ) : (
    <RevealAlbum
      data={state.albumData}
      listRef={listRef}
      onFinish={navigation.goBack}
      onMomentumScrollBegin={onMomentumScrollBegin}
      onMomentumScrollEnd={onMomentumScrollEnd}
      onViewableItemsChanged={onViewableItemsChanged}
      phase={phase}
      rows={state.rows}
      revealMediaUrl={state.revealMediaUrl}
      stagedOverlay={stagedOverlay}
      targetEntryId={route.params.entryId}
    />
  );
}

function RevealIntro({
  albumData,
  catalog,
  revealMediaUrl,
  enrichmentWarning,
  photoWarning,
  intro,
  platformIntro,
  onNext,
}: {
  readonly albumData: RevealAlbumData;
  readonly catalog: CanonicalMarketCatalog;
  readonly revealMediaUrl: string | null;
  readonly enrichmentWarning: boolean;
  readonly photoWarning: boolean;
  readonly intro: Animated.Value;
  readonly platformIntro: Animated.Value;
  readonly onNext: () => void;
}) {
  const insets = useSafeAreaInsets();
  const theme = getAlbumTheme(albumData.album);
  const platform = getPlatformPresentation(catalog.platform.slug);
  const translateY = intro.interpolate({ inputRange: [0, 1], outputRange: [12, 0] });
  const scale = intro.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] });
  return (
    <View style={styles.introPage}>
      <AlbumGradient colors={theme.colors} id="intro-gradient" />
      <View
        style={[
          styles.introContent,
          { paddingBottom: Math.max(insets.bottom, 24), paddingTop: insets.top + 72 },
        ]}
      >
        <Animated.View style={[styles.newBadge, { opacity: intro, transform: [{ translateY }] }]}>
          <Text style={styles.newBadgeText}>NOUVEAU</Text>
        </Animated.View>
        <Animated.View style={[styles.introArtwork, { opacity: intro, transform: [{ scale }] }]}>
          {revealMediaUrl ? (
            <Image source={{ uri: revealMediaUrl }} style={styles.fill} />
          ) : (
            <View style={styles.artworkPlaceholder}>
              <GeekIcon color={colors.textSecondary} name="gamepad" size={52} />
            </View>
          )}
        </Animated.View>
        <Animated.View
          style={[
            styles.platformMark,
            {
              opacity: platformIntro,
              transform: [
                {
                  translateY: platformIntro.interpolate({
                    inputRange: [0, 1],
                    outputRange: [8, 0],
                  }),
                },
              ],
            },
          ]}
        >
          {platform ? (
            <Image resizeMode="contain" source={platform.image} style={styles.fill} />
          ) : (
            <GeekIcon color={colors.controlSelected} name="gamepad" size={48} />
          )}
        </Animated.View>
        {photoWarning ? (
          <Text style={styles.enrichmentWarning}>
            Jeu ajouté, certaines photos n’ont pas pu être enregistrées.
          </Text>
        ) : enrichmentWarning ? (
          <Text style={styles.enrichmentWarning}>
            Jeu ajouté, certains détails n’ont pas pu être enregistrés.
          </Text>
        ) : null}
        <View style={styles.introSpacer} />
        <PrimaryButton label="Suivant" onPress={onNext} />
      </View>
    </View>
  );
}

function RevealAlbum({
  data,
  listRef,
  onFinish,
  onMomentumScrollBegin,
  onMomentumScrollEnd,
  onViewableItemsChanged,
  phase,
  rows,
  revealMediaUrl,
  stagedOverlay,
  targetEntryId,
}: {
  readonly data: RevealAlbumData;
  readonly listRef: RefObject<FlatList<AlbumRevealRow> | null>;
  readonly onFinish: () => void;
  readonly onMomentumScrollBegin: () => void;
  readonly onMomentumScrollEnd: () => void;
  readonly onViewableItemsChanged: (info: { viewableItems: ViewToken<AlbumRevealRow>[] }) => void;
  readonly phase: AlbumRevealRenderPhase;
  readonly rows: readonly AlbumRevealRow[];
  readonly revealMediaUrl: string | null;
  readonly stagedOverlay: Animated.Value;
  readonly targetEntryId: string;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const tileWidth = (width - spacing.page * 2 - spacing.compact) / 2;
  const rowStride = tileWidth * (84 / 115) + 46 + spacing.compact;
  const headerStride = 203 + spacing.page + spacing.compact;
  const theme = getAlbumTheme(data.album);
  const targetRevealed = phase === "album_revealed";
  return (
    <View style={styles.albumPage}>
      <FlatList
        contentContainerStyle={[styles.albumContent, { paddingBottom: insets.bottom + 88 }]}
        data={rows}
        extraData={phase}
        getItemLayout={(_items, index) => ({
          index,
          length: rowStride,
          offset: headerStride + index * rowStride,
        })}
        keyExtractor={(row) => row.id}
        ListHeaderComponent={<AlbumRevealHeader data={data} theme={theme} topInset={insets.top} />}
        onMomentumScrollBegin={onMomentumScrollBegin}
        onScrollToIndexFailed={({ index }) => {
          listRef.current?.scrollToOffset({
            animated: true,
            offset: headerStride + index * rowStride,
          });
        }}
        onMomentumScrollEnd={onMomentumScrollEnd}
        onViewableItemsChanged={onViewableItemsChanged}
        ref={listRef}
        renderItem={({ item: row }) => (
          <View style={styles.gridRow}>
            {row.entries.map((entry) => {
              const stageTarget = shouldStageAlbumRevealEntry(entry, targetEntryId, phase);
              const isTarget = entry.id === targetEntryId;
              const content: Omit<GameGridItemContent, "image"> & {
                readonly image?: GameGridItemContent["image"];
              } = {
                image:
                  isTarget && revealMediaUrl
                    ? { uri: revealMediaUrl }
                    : data.artworkByEntryId[entry.id]
                      ? { uri: data.artworkByEntryId[entry.id] }
                      : undefined,
                title: entry.target.gameTitle,
                platform: entry.target.kind === "edition" ? entry.target.platformName : "",
                regionCode: entry.target.kind === "edition" ? entry.target.regionCode : null,
                opportunities: entry.network.activeListingCount,
              };
              return (
                <View key={entry.id} style={{ width: tileWidth }}>
                  <GameGridItem
                    imageOpacity={entry.state.owned ? 1 : 0.2}
                    isWishlist={false}
                    item={content}
                    platformLabel={content.platform}
                    showOpportunity
                    slotNumber={entry.state.owned ? undefined : slot(entry.position)}
                    wanted={entry.state.wanted}
                    width={tileWidth}
                  />
                  {stageTarget ? (
                    <Animated.View
                      pointerEvents="none"
                      style={[styles.stagedTarget, { opacity: stagedOverlay }]}
                    >
                      <GameGridItem
                        imageOpacity={0.2}
                        isWishlist={false}
                        item={content}
                        platformLabel={content.platform}
                        showOpportunity
                        slotNumber={slot(entry.position)}
                        wanted={entry.state.wanted}
                        width={tileWidth}
                      />
                    </Animated.View>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}
        showsVerticalScrollIndicator={false}
        viewabilityConfig={REVEAL_VIEWABILITY_CONFIG}
      />
      {targetRevealed ? (
        <View style={[styles.finish, { bottom: Math.max(insets.bottom, 16) }]}>
          <PrimaryButton label="Suivant" onPress={onFinish} />
        </View>
      ) : null}
    </View>
  );
}

function AlbumRevealHeader({
  data,
  theme,
  topInset,
}: {
  readonly data: RevealAlbumData;
  readonly theme: ReturnType<typeof getAlbumTheme>;
  readonly topInset: number;
}) {
  return (
    <View style={[styles.albumHeader, { paddingTop: topInset + spacing.compact }]}>
      <AlbumGradient colors={theme.colors} id="album-gradient" />
      <View style={styles.albumTitleWrap}>
        <Text
          style={[styles.albumTitle, theme.fontFamily ? { fontFamily: theme.fontFamily } : null]}
        >
          {data.album.title}
        </Text>
        <Text style={styles.albumProgress}>
          {data.album.progress.ownedSlots}/{data.album.progress.totalSlots} jeux
        </Text>
      </View>
      {theme.logo ? (
        <Image resizeMode="contain" source={theme.logo} style={styles.albumLogo} />
      ) : null}
    </View>
  );
}

function AlbumGradient({
  colors: gradientColors,
  id,
}: {
  readonly colors: readonly [string, string];
  readonly id: string;
}) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg height="100%" width="100%">
        <Defs>
          <LinearGradient id={id} x1="0" x2="1" y1="0" y2="1">
            <Stop offset="0" stopColor={gradientColors[0]} />
            <Stop offset="1" stopColor={gradientColors[1]} />
          </LinearGradient>
        </Defs>
        <Rect fill={`url(#${id})`} height="100%" width="100%" />
      </Svg>
    </View>
  );
}

function PrimaryButton({
  label,
  onPress,
}: {
  readonly label: string;
  readonly onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.primaryButton}>
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function slot(position: number): string {
  return String(position).padStart(2, "0");
}

const styles = StyleSheet.create({
  centered: {
    alignItems: "center",
    backgroundColor: colors.background,
    flex: 1,
    gap: spacing.page,
    justifyContent: "center",
    padding: 32,
  },
  stateText: { ...typography.body, color: colors.textSecondary, textAlign: "center" },
  introPage: { flex: 1, overflow: "hidden" },
  introContent: { alignItems: "center", flex: 1, paddingHorizontal: spacing.page },
  newBadge: {
    backgroundColor: "rgba(255,255,255,.3)",
    borderRadius: 48,
    marginBottom: spacing.page,
    padding: spacing.compact,
  },
  newBadgeText: { ...typography.body, color: colors.controlSelected, fontWeight: "600" },
  introArtwork: { aspectRatio: 361 / 249, borderRadius: 16, overflow: "hidden", width: "100%" },
  fill: { height: "100%", width: "100%" },
  artworkPlaceholder: {
    alignItems: "center",
    backgroundColor: colors.surfaceSubtle,
    height: "100%",
    justifyContent: "center",
    width: "100%",
  },
  platformMark: {
    alignSelf: "flex-start",
    height: 64,
    marginLeft: spacing.medium,
    marginTop: spacing.medium,
    width: 72,
  },
  enrichmentWarning: {
    ...typography.metadata,
    backgroundColor: "rgba(255,255,255,.45)",
    borderRadius: 12,
    color: colors.text,
    marginTop: spacing.page,
    padding: spacing.compact,
    textAlign: "center",
  },
  introSpacer: { flex: 1 },
  primaryButton: { backgroundColor: colors.text, borderRadius: 999, minWidth: 157, padding: 12 },
  primaryButtonText: { ...typography.body, color: colors.controlSelected, textAlign: "center" },
  albumPage: { backgroundColor: colors.background, flex: 1 },
  albumContent: { gap: spacing.compact },
  albumHeader: {
    height: 203,
    justifyContent: "flex-end",
    marginBottom: spacing.page,
    overflow: "hidden",
    paddingBottom: 24,
    paddingHorizontal: spacing.page,
  },
  albumTitleWrap: { maxWidth: "66%", zIndex: 1 },
  albumTitle: { color: colors.controlSelected, fontSize: 32, fontWeight: "700", lineHeight: 38 },
  albumProgress: { ...typography.body, color: "rgba(255,255,255,.78)" },
  albumLogo: { bottom: 12, height: 118, position: "absolute", right: spacing.page, width: 128 },
  gridRow: {
    flexDirection: "row",
    gap: spacing.compact,
    paddingHorizontal: spacing.page,
  },
  stagedTarget: { backgroundColor: colors.background, left: 0, position: "absolute", top: 0 },
  finish: { alignItems: "center", left: 0, position: "absolute", right: 0 },
});

const REVEAL_VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 65 } as const;
