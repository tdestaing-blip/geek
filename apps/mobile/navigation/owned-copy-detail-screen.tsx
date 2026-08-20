import { colors, radii, spacing, typography } from "@geek/design-tokens";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMemo } from "react";
import {
  Image,
  type ImageSourcePropType,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import ABOUT_GAME from "../assets/game-detail/owned/about-game.png";
import ALBUM_MARK from "../assets/game-detail/owned/album-mark.png";
import COMPONENT_BOX from "../assets/game-detail/owned/component-box.png";
import COMPONENT_CARTRIDGE from "../assets/game-detail/owned/component-cartridge.png";
import COMPONENT_MANUAL from "../assets/game-detail/owned/component-manual.png";
import COPY_PHOTO from "../assets/game-detail/owned/copy-photo.png";
import NETWORK_AVATAR_1 from "../assets/game-detail/owned/network-avatar-1.png";
import NETWORK_AVATAR_2 from "../assets/game-detail/owned/network-avatar-2.png";
import NETWORK_AVATAR_3 from "../assets/game-detail/owned/network-avatar-3.png";
import NETWORK_AVATAR_4 from "../assets/game-detail/owned/network-avatar-4.png";
import NETWORK_AVATAR_5 from "../assets/game-detail/owned/network-avatar-5.png";
import NETWORK_AVATAR_6 from "../assets/game-detail/owned/network-avatar-6.png";
import OWNER_AVATAR from "../assets/game-detail/owned/owner-avatar.png";
import CATALOG_HERO from "../assets/collection/v2/my-mario-world-cover.png";
import WISH_DONKEY_KONG from "../assets/collection/v2/wish-donkey-kong.png";
import WISH_LINK_TO_PAST from "../assets/collection/v2/wish-link-to-past.png";
import WISH_MAJORAS_MASK from "../assets/collection/v2/wish-majoras-mask.png";
import WISH_YOSHI_ISLAND from "../assets/collection/v2/wish-yoshi-island.png";
import { AdaptiveGlassSurface } from "../ui/adaptive-glass-surface";
import { CopyComponentCard } from "../ui/copy-component-card";
import { GeekIcon } from "../ui/geek-icon";
import { MetadataField } from "../ui/metadata-field";
import { NetworkSignalRow } from "../ui/network-signal-row";
import { StickyAvailabilityBar } from "../ui/sticky-availability-bar";
import type { RootStackParamList } from "./types";

type Props = NativeStackScreenProps<RootStackParamList, "Copy">;

type OwnedCopyDetailFixture = {
  readonly game: { readonly title: string; readonly platform: string; readonly about: string };
  readonly edition: {
    readonly region: string;
    readonly release: string;
    readonly code: string;
  };
  readonly owner: { readonly name: string; readonly rating: string; readonly games: number };
  readonly photos: readonly ImageSourcePropType[];
  readonly components: readonly {
    readonly label: string;
    readonly image: ImageSourcePropType;
    readonly state: "missing" | "present";
  }[];
  readonly album: { readonly collected: number; readonly total: number };
  readonly network: readonly {
    readonly count: number;
    readonly label: string;
    readonly avatars: readonly ImageSourcePropType[];
  }[];
  readonly availability: "private";
};

const AVATARS = [
  NETWORK_AVATAR_1,
  NETWORK_AVATAR_2,
  NETWORK_AVATAR_3,
  NETWORK_AVATAR_4,
  NETWORK_AVATAR_5,
  NETWORK_AVATAR_6,
] as const;

const WISHLIST_COVERS = [
  WISH_MAJORAS_MASK,
  WISH_LINK_TO_PAST,
  WISH_DONKEY_KONG,
  WISH_YOSHI_ISLAND,
] as const;

export function OwnedCopyDetailScreen({ navigation, route }: Props) {
  return (
    <SafeAreaProvider>
      <OwnedCopyDetailContent navigation={navigation} route={route} />
    </SafeAreaProvider>
  );
}

function OwnedCopyDetailContent({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const hasCopyPhoto = !route.params.copyId.endsWith("102");
  const fixture = useMemo(() => makeFixture(hasCopyPhoto), [hasCopyPhoto]);
  const { width } = useWindowDimensions();
  const heroSize = width - spacing.page * 2;
  const footerSpace = hasCopyPhoto ? 112 : 150;

  return (
    <View style={[styles.safeArea, { paddingTop: insets.top }]}>
      <TopToolbar
        title={fixture.game.title}
        onClose={() => navigation.goBack()}
        onMore={() => undefined}
      />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: footerSpace }]}
        showsVerticalScrollIndicator={false}
        style={styles.scroll}
      >
        <CopyHero fixture={fixture} heroSize={heroSize} />
        <View style={styles.heading}>
          <Text style={styles.gameTitle}>{fixture.game.title}</Text>
          <Text style={styles.platform}>{fixture.game.platform}</Text>
        </View>
        <OwnerCard fixture={fixture} />
        <EditionSection fixture={fixture} />
        <AlbumCard fixture={fixture} />
        <NetworkSection fixture={fixture} />
        <AboutGameCard fixture={fixture} />
      </ScrollView>
      <StickyAvailabilityBar hasCopyPhoto={hasCopyPhoto} />
    </View>
  );
}

function CopyHero({ fixture, heroSize }: { fixture: OwnedCopyDetailFixture; heroSize: number }) {
  const hasPhoto = fixture.photos.length > 0;
  return (
    <View style={styles.heroGroup}>
      <View style={[styles.hero, { height: heroSize, width: heroSize }]}>
        <Image
          resizeMode="cover"
          source={hasPhoto ? fixture.photos[0] : CATALOG_HERO}
          style={styles.fill}
        />
        {!hasPhoto ? (
          <View style={styles.photoOverlay}>
            <GeekIcon color={colors.controlSelected} name="image-2-plus" size={32} />
            <Text style={styles.photoCta}>Add photos of your copy</Text>
          </View>
        ) : (
          <PageDots count={fixture.photos.length} />
        )}
      </View>
      <View style={styles.componentRow}>
        {fixture.components.map((component) => (
          <CopyComponentCard key={component.label} {...component} />
        ))}
      </View>
    </View>
  );
}

function PageDots({ count }: { readonly count: number }) {
  return (
    <View style={styles.pageDots}>
      {Array.from({ length: count }, (_, index) => (
        <View key={index} style={[styles.dot, index === 0 && styles.dotActive]} />
      ))}
    </View>
  );
}

function TopToolbar({
  title,
  onClose,
  onMore,
}: {
  readonly title: string;
  readonly onClose: () => void;
  readonly onMore: () => void;
}) {
  return (
    <View pointerEvents="box-none" style={styles.toolbar}>
      <AdaptiveGlassSurface style={styles.toolbarButton}>
        <Pressable accessibilityLabel="Fermer" onPress={onClose} style={styles.toolbarPressable}>
          <GeekIcon name="chevron-down" />
        </Pressable>
      </AdaptiveGlassSurface>
      <Text numberOfLines={1} style={styles.toolbarTitle}>
        {title}
      </Text>
      <AdaptiveGlassSurface style={styles.toolbarButton}>
        <Pressable
          accessibilityLabel="Plus d’options"
          onPress={onMore}
          style={styles.toolbarPressable}
        >
          <GeekIcon name="more-horizontal" />
        </Pressable>
      </AdaptiveGlassSurface>
    </View>
  );
}

function OwnerCard({ fixture }: { fixture: OwnedCopyDetailFixture }) {
  return (
    <View style={styles.ownerShell}>
      <View style={styles.ownerTop}>
        <View style={styles.ownerIdentity}>
          <View>
            <Image source={OWNER_AVATAR} style={styles.ownerAvatar} />
            <View style={styles.online} />
          </View>
          <View>
            <View style={styles.ownerNameRow}>
              <Text style={styles.body}>À {fixture.owner.name}</Text>
              <Text style={styles.rating}>⭐ {fixture.owner.rating}</Text>
            </View>
            <Text style={styles.metadata}>{fixture.owner.games} jeux</Text>
          </View>
        </View>
        <Text style={styles.description}>Ajouter une description...</Text>
      </View>
      <View style={styles.wishlistRow}>
        <Text style={styles.body}>18 jeux recherchés</Text>
        <View style={styles.coverStack}>
          {WISHLIST_COVERS.map((cover, index) => (
            <Image
              key={index}
              source={cover}
              style={[styles.miniCover, index > 0 && styles.coverOverlap]}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

function EditionSection({ fixture }: { fixture: OwnedCopyDetailFixture }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Édition</Text>
      <MetadataField label="Région / langue" value={fixture.edition.region} />
      <MetadataField label="Sortie européenne" value={fixture.edition.release} />
      <MetadataField label="Code associé" value={fixture.edition.code} />
    </View>
  );
}

function AlbumCard({ fixture }: { fixture: OwnedCopyDetailFixture }) {
  const progress = fixture.album.collected / fixture.album.total;
  return (
    <View style={styles.albumCard}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Svg height="100%" preserveAspectRatio="none" width="100%">
          <Defs>
            <LinearGradient id="album" x1="0" x2="1" y1="0" y2="1">
              <Stop offset="0" stopColor={colors.albumStart} />
              <Stop offset="1" stopColor={colors.albumEnd} />
            </LinearGradient>
          </Defs>
          <Rect fill="url(#album)" height="100%" width="100%" />
        </Svg>
      </View>
      <View style={styles.albumHeader}>
        <View style={styles.albumIdentity}>
          <Image resizeMode="contain" source={ALBUM_MARK} style={styles.albumMark} />
          <View>
            <Text style={styles.albumLabel}>Album</Text>
            <Text style={styles.albumName}>Essentials</Text>
          </View>
        </View>
        <View style={styles.albumRank}>
          <GeekIcon color={colors.controlSelected} name="diamond-gem" size={17} />
          <Text style={styles.albumValue}>Top 30%</Text>
        </View>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>
      <Text style={styles.albumProgress}>
        {fixture.album.collected}/{fixture.album.total} collectés
      </Text>
    </View>
  );
}

function NetworkSection({ fixture }: { fixture: OwnedCopyDetailFixture }) {
  return (
    <View style={styles.networkSection}>
      <View style={styles.sectionHeadingRow}>
        <Text style={styles.sectionTitle}>Dans le réseau</Text>
        <GeekIcon name="community" size={28} />
      </View>
      <Text style={styles.networkIntro}>
        <Text style={styles.networkStrong}>261 collectionneurs</Text> cherchent cette édition du jeu
        parmi lesquelles:
      </Text>
      {fixture.network.map((signal) => (
        <NetworkSignalRow key={signal.label} {...signal} />
      ))}
    </View>
  );
}

function AboutGameCard({ fixture }: { fixture: OwnedCopyDetailFixture }) {
  return (
    <View style={styles.aboutCard}>
      <View style={styles.aboutImage}>
        <Image resizeMode="cover" source={ABOUT_GAME} style={styles.fill} />
        <Text style={styles.aboutLabel}>A propos du jeu</Text>
      </View>
      <View style={styles.aboutCopy}>
        <Text style={styles.aboutTitle}>Super Mario World</Text>
        <Text style={styles.aboutBody}>{fixture.game.about}</Text>
      </View>
    </View>
  );
}

function makeFixture(hasCopyPhoto: boolean): OwnedCopyDetailFixture {
  return {
    game: {
      title: hasCopyPhoto ? "The Legend of Zelda: A Link to the Past" : "Super Mario World",
      platform: "Super Nintendo",
      about:
        "Développé par Nintendo EAD, édité par Nintendo · troisième opus de la série · seul épisode SNES\n\nSortie originale : Japon fin 1991, Europe presque un an après. Plus de 4,6 millions d’exemplaires vendus · considéré comme l’un des plus grands jeux de l’histoire.",
    },
    edition: {
      region: "PAL FR",
      release: "24 septembre 1992",
      code: "SNSP-P-ZL-FRA",
    },
    owner: { name: "Thomas Destaing", rating: "3.1", games: 192 },
    photos: hasCopyPhoto ? [COPY_PHOTO, COPY_PHOTO, COPY_PHOTO, COPY_PHOTO] : [],
    components: [
      {
        label: "Cartouche",
        image: COMPONENT_CARTRIDGE,
        state: hasCopyPhoto ? "present" : "missing",
      },
      { label: "Boîte", image: COMPONENT_BOX, state: "missing" },
      { label: "Notice", image: COMPONENT_MANUAL, state: "missing" },
    ],
    album: { collected: 12, total: 24 },
    network: hasCopyPhoto
      ? [
          { count: 14, label: "ont des jeux que tu recherches", avatars: AVATARS.slice(0, 3) },
          { count: 8, label: "ont soumis une offre ferme", avatars: AVATARS.slice(3, 6) },
          { count: 1, label: "possède la notice", avatars: AVATARS.slice(5, 6) },
        ]
      : [
          { count: 14, label: "ont des jeux que tu recherches", avatars: AVATARS.slice(0, 3) },
          { count: 2, label: "ont posé un dibs", avatars: AVATARS.slice(3, 6) },
          { count: 8, label: "proposent un échange", avatars: AVATARS.slice(4, 6) },
        ],
    availability: "private",
  };
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  scroll: { flex: 1 },
  content: { gap: 24 },
  toolbar: {
    alignItems: "center",
    flexDirection: "row",
    height: 60,
    justifyContent: "space-between",
    paddingBottom: spacing.compact,
    paddingHorizontal: spacing.page,
  },
  toolbarButton: { height: 44, width: 44 },
  toolbarPressable: { alignItems: "center", flex: 1, justifyContent: "center" },
  toolbarTitle: {
    color: colors.text,
    flex: 1,
    fontSize: 17,
    fontWeight: "600",
    marginHorizontal: spacing.compact,
    textAlign: "center",
  },
  heroGroup: { gap: spacing.page, paddingHorizontal: spacing.page },
  hero: { alignSelf: "center", borderRadius: radii.detailCard, overflow: "hidden" },
  fill: { height: "100%", width: "100%" },
  photoOverlay: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    gap: 10,
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    justifyContent: "center",
  },
  photoCta: { color: colors.controlSelected, ...typography.body },
  pageDots: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: "rgba(0, 0, 0, 0.28)",
    borderRadius: radii.capsule,
    bottom: spacing.compact,
    flexDirection: "row",
    gap: spacing.micro,
    padding: spacing.micro,
    position: "absolute",
  },
  dot: { backgroundColor: "rgba(255, 255, 255, 0.45)", borderRadius: 3, height: 4, width: 4 },
  dotActive: { backgroundColor: colors.controlSelected },
  componentRow: { flexDirection: "row", gap: spacing.compact },
  heading: { gap: spacing.micro, paddingHorizontal: 24 },
  gameTitle: { color: colors.text, ...typography.screenTitle },
  platform: { color: colors.text, ...typography.body },
  ownerShell: { gap: 1, paddingHorizontal: 12 },
  ownerTop: {
    backgroundColor: colors.surfaceSubtle,
    borderTopLeftRadius: radii.detailCard,
    borderTopRightRadius: radii.detailCard,
    gap: spacing.page,
    padding: 12,
  },
  ownerIdentity: { alignItems: "center", flexDirection: "row", gap: 12 },
  ownerAvatar: { borderRadius: 24, height: 48, width: 48 },
  online: {
    backgroundColor: colors.success,
    borderRadius: 6,
    bottom: -1,
    height: 12,
    position: "absolute",
    right: -1,
    width: 12,
  },
  ownerNameRow: { alignItems: "center", flexDirection: "row", gap: spacing.compact },
  rating: { color: colors.text, ...typography.metadata },
  body: { color: colors.text, ...typography.body },
  metadata: { color: colors.textSecondary, ...typography.metadata },
  description: { color: colors.textSecondary, ...typography.body },
  wishlistRow: {
    alignItems: "center",
    backgroundColor: colors.surfaceSubtle,
    borderBottomLeftRadius: radii.detailCard,
    borderBottomRightRadius: radii.detailCard,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: spacing.page,
  },
  coverStack: { flexDirection: "row" },
  miniCover: {
    borderColor: colors.controlSelected,
    borderRadius: spacing.micro,
    borderWidth: 1,
    height: 32,
    width: 43,
  },
  coverOverlap: { marginLeft: -8 },
  section: { gap: spacing.page, paddingHorizontal: 24 },
  sectionTitle: { color: colors.text, ...typography.sectionTitle },
  albumCard: {
    alignSelf: "stretch",
    borderRadius: radii.detailCard,
    gap: spacing.compact,
    marginHorizontal: 12,
    minHeight: 129,
    overflow: "hidden",
    paddingHorizontal: spacing.page,
    paddingVertical: 24,
  },
  albumHeader: { alignItems: "center", flexDirection: "row", gap: spacing.compact },
  albumIdentity: { alignItems: "center", flex: 1, flexDirection: "row", gap: 12, minWidth: 0 },
  albumMark: { height: 33, width: 42 },
  albumLabel: { color: "rgba(255, 255, 255, 0.7)", ...typography.metadata },
  albumName: { color: "#F4F1FA", fontSize: 18, fontWeight: "800" },
  albumRank: { alignItems: "center", flexDirection: "row", gap: 6 },
  albumValue: { color: colors.controlSelected, ...typography.body },
  progressTrack: { backgroundColor: "rgba(255, 255, 255, 0.2)", borderRadius: 2, height: 4 },
  progressFill: { backgroundColor: colors.controlSelected, borderRadius: 2, height: 4 },
  albumProgress: { color: colors.controlSelected, ...typography.metadata },
  networkSection: { gap: spacing.page, paddingHorizontal: 24 },
  sectionHeadingRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  networkIntro: { color: colors.textSecondary, ...typography.body },
  networkStrong: { color: colors.text, fontWeight: "600" },
  aboutCard: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radii.detailCard,
    marginHorizontal: 12,
    overflow: "hidden",
  },
  aboutImage: { height: 181 },
  aboutLabel: {
    color: colors.controlSelected,
    left: 12,
    position: "absolute",
    top: 12,
    ...typography.sectionTitle,
  },
  aboutCopy: { gap: spacing.compact, paddingHorizontal: 12, paddingVertical: spacing.page },
  aboutTitle: { color: colors.text, ...typography.body, fontWeight: "600" },
  aboutBody: { color: colors.textSecondary, ...typography.metadata },
});
