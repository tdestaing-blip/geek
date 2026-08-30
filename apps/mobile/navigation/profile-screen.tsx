import { colors, spacing, typography } from "@geek/design-tokens";
import { getPublicProfile } from "@geek/data";
import type { Profile } from "@geek/domain";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type {
  NativeStackNavigationProp,
  NativeStackScreenProps,
} from "@react-navigation/native-stack";
import { type ReactNode, useEffect, useState } from "react";
import { FlatList, Image, StyleSheet, Text, useWindowDimensions, View } from "react-native";

import THOMAS_AVATAR from "../assets/profiles/thomas.png";
import { useAuth } from "../lib/auth/auth-provider";
import { supabase } from "../lib/supabase";
import { GameGridItem, type GridItem } from "../ui/game-grid-item";
import {
  ProfileActions,
  ProfileHero,
  ProfileMatchCard,
  ProfileSocialSummary,
  ProfileStats,
  type ProfileStat,
} from "../ui/profile-primitives";
import { SegmentedControl } from "../ui/segmented-control";
import { MY_GAMES } from "./collection-screen";
import {
  LEON_PUBLIC_COPY_FIXTURE,
  resolveActiveMarketOpportunitiesForOwner,
  findCollectorFixture,
} from "./marketplace-fixtures";
import type { MainTabParamList, RootStackParamList } from "./types";

type MyProps = BottomTabScreenProps<MainTabParamList, "Me">;
type PublicProps = NativeStackScreenProps<RootStackParamList, "PublicProfile">;

type ProfileInventoryItem = GridItem & { readonly copyId: string };
type MatchReference = { readonly copyId: string; readonly gameId: string };
type ProfileMatchProjection = {
  readonly theirs: readonly MatchReference[];
  readonly yours: readonly MatchReference[];
};

const STATS: readonly ProfileStat[] = [
  { detail: "205 avis", icon: "star", value: "4.0" },
  { detail: "Délai de livraison moyen", icon: "truck", value: "<1j" },
  { detail: "Vendus", icon: "gamepad", value: "23" },
];

function requireCopyItem(item: GridItem): ProfileInventoryItem {
  if (!item.copyId) throw new Error(`My Profile fixture must reference a Copy: ${item.gameId}`);
  return { ...item, copyId: item.copyId };
}

const MY_COPY_ITEMS: readonly ProfileInventoryItem[] = MY_GAMES.map(requireCopyItem);

function getActiveSaleItemsForOwner(userId: string): readonly ProfileInventoryItem[] {
  return resolveActiveMarketOpportunitiesForOwner(userId).map(({ opportunity, resolved }) => {
    const { copy, edition, game } = resolved;
    return {
      copyId: copy.id,
      editionId: edition.id,
      gameId: game.id,
      image: copy.photos[0],
      overlay: "sale",
      platform: "N64",
      salePrice: opportunity.type === "listing" ? opportunity.price : opportunity.currentBid,
      title: game.title,
    };
  });
}

const LEON_SALE_ITEMS = getActiveSaleItemsForOwner(LEON_PUBLIC_COPY_FIXTURE.owner.id);

const LEON_MATCH_PROJECTION: ProfileMatchProjection = {
  theirs: LEON_SALE_ITEMS.slice(0, 2).map(({ copyId, gameId }) => ({ copyId, gameId })),
  yours: MY_COPY_ITEMS.slice(0, 2).map(({ copyId, gameId }) => ({ copyId, gameId })),
};

export function MyProfileScreen({ navigation }: MyProps) {
  const { state } = useAuth();
  if (state.status !== "authenticated") {
    throw new Error("My Profile requires an authenticated user.");
  }

  const rootNavigation = navigation.getParent<NativeStackNavigationProp<RootStackParamList>>();
  if (!rootNavigation) throw new Error("Me must be mounted under the application stack.");
  const saleItems = getActiveSaleItemsForOwner(state.user.id);
  return (
    <ProfileInventory
      avatar={THOMAS_AVATAR}
      gradient={["#BADEEB", "#8CBFD4"]}
      items={saleItems}
      location="Paris"
      name="Thomas Destaing"
      onOpenCopy={(copyId) => rootNavigation.navigate("Copy", { copyId })}
      title="Profil"
    />
  );
}

export function PublicProfileScreen({ navigation, route }: PublicProps) {
  const fixture = findCollectorFixture(route.params.userId);
  const [canonicalResult, setCanonicalResult] = useState<{
    readonly userId: string;
    readonly profile: Profile | null;
    readonly failed: boolean;
  } | null>(null);
  const canonicalProfile =
    canonicalResult?.userId === route.params.userId ? canonicalResult.profile : null;
  const loadFailed =
    canonicalResult?.userId === route.params.userId && canonicalResult.failed === true;

  useEffect(() => {
    if (fixture !== null) return;
    let active = true;
    void getPublicProfile(supabase, route.params.userId).then(
      (result) => {
        if (!active) return;
        setCanonicalResult({
          userId: route.params.userId,
          profile: result.outcome === "ok" ? result.data : null,
          failed: result.outcome !== "ok",
        });
      },
      () => {
        if (active) {
          setCanonicalResult({ userId: route.params.userId, profile: null, failed: true });
        }
      },
    );
    return () => {
      active = false;
    };
  }, [fixture, route.params.userId]);

  if (fixture === null && canonicalProfile === null) {
    return (
      <View style={styles.profileLoadState}>
        <Text style={styles.profileLoadText}>
          {loadFailed ? "Ce profil public n’est pas disponible." : "Chargement du profil…"}
        </Text>
      </View>
    );
  }

  const userId = fixture?.id ?? canonicalProfile?.id ?? route.params.userId;
  const saleItems = getActiveSaleItemsForOwner(userId);
  const isLeon = userId === LEON_PUBLIC_COPY_FIXTURE.owner.id;
  const canonicalAvatar = canonicalProfile?.avatarPath;
  return (
    <ProfileInventory
      actions
      avatar={
        fixture?.avatar ??
        (canonicalAvatar?.startsWith("http") === true ? { uri: canonicalAvatar } : null)
      }
      bio={canonicalProfile === null ? undefined : (canonicalProfile.bio ?? "")}
      gradient={["#D1BFEB", "#AD94CC"]}
      items={saleItems}
      location={fixture?.distance ?? "Collectionneur Geek"}
      matchCard={isLeon ? <LeonMatchProjection projection={LEON_MATCH_PROJECTION} /> : undefined}
      name={
        fixture?.name ??
        canonicalProfile?.displayName ??
        canonicalProfile?.username ??
        "Collectionneur Geek"
      }
      backIcon="chevron-down"
      onBack={navigation.goBack}
      onOpenCopy={(copyId) => navigation.navigate("PublicCopy", { copyId })}
    />
  );
}

function ProfileInventory({
  actions = false,
  avatar,
  backIcon,
  bio,
  gradient,
  items,
  location,
  matchCard,
  name,
  onBack,
  onOpenCopy,
  title,
}: {
  readonly actions?: boolean;
  readonly avatar: Parameters<typeof ProfileHero>[0]["avatar"];
  readonly backIcon?: "chevron-down" | "chevron-left";
  readonly bio?: string;
  readonly gradient: readonly [string, string];
  readonly items: readonly ProfileInventoryItem[];
  readonly location: string;
  readonly matchCard?: ReactNode;
  readonly name: string;
  readonly onBack?: () => void;
  readonly onOpenCopy: (copyId: string) => void;
  readonly title?: string;
}) {
  const { width } = useWindowDimensions();
  const numColumns = 2;
  const itemWidth = (width - spacing.page * 2 - spacing.compact) / numColumns;
  const profileSegments = [
    { id: "sale", label: `En vente ${items.length}` },
    { id: "games", label: "Jeux 192" },
    { id: "reviews", label: "Avis 10" },
  ] as const;
  return (
    <FlatList
      columnWrapperStyle={numColumns > 1 ? styles.gridRow : undefined}
      contentContainerStyle={styles.content}
      data={items}
      keyExtractor={({ copyId }) => copyId}
      ListHeaderComponent={
        <View>
          <ProfileHero
            avatar={avatar}
            backIcon={backIcon}
            gradient={gradient}
            location={location}
            name={name}
            onBack={onBack}
            title={title}
          />
          <ProfileStats stats={STATS} />
          <ProfileSocialSummary
            bio={
              bio ?? "RPG 16 bits, complet en boîte. Échange volontiers en main propre à Nantes."
            }
          />
          {actions ? <ProfileActions /> : null}
          {matchCard}
          <View style={styles.segments}>
            <SegmentedControl
              options={profileSegments}
              selected="sale"
              onSelect={() => undefined}
            />
          </View>
        </View>
      }
      numColumns={numColumns}
      renderItem={({ item }) => (
        <GameGridItem
          isWishlist={false}
          item={item}
          onPress={() => onOpenCopy(item.copyId)}
          platformLabel={item.platform === "N64" ? "Nintendo 64" : "Super Nintendo"}
          width={itemWidth}
        />
      )}
      showsVerticalScrollIndicator={false}
    />
  );
}

function LeonMatchProjection({ projection }: { readonly projection: ProfileMatchProjection }) {
  const first = resolveMatchReferences(projection.yours, MY_COPY_ITEMS);
  const second = resolveMatchReferences(projection.theirs, LEON_SALE_ITEMS);
  return (
    <ProfileMatchCard>
      <MatchRow items={first} label="2 jeux l’intéresse chez toi" value="Valeur estimé: 65€" />
      <MatchRow
        items={second}
        label="5 jeux t’intéresse chez lui"
        overflowCount={4}
        value="Valeur estimé: 293€"
      />
    </ProfileMatchCard>
  );
}

function resolveMatchReferences(
  references: readonly MatchReference[],
  inventory: readonly ProfileInventoryItem[],
): readonly ProfileInventoryItem[] {
  return references.map((reference) => {
    const item = inventory.find(
      (candidate) => candidate.copyId === reference.copyId && candidate.gameId === reference.gameId,
    );
    if (!item) throw new Error(`Unknown local Match Copy reference: ${reference.copyId}`);
    return item;
  });
}

function MatchRow({
  items,
  label,
  overflowCount,
  value,
}: {
  readonly items: readonly ProfileInventoryItem[];
  readonly label: string;
  readonly overflowCount?: number;
  readonly value: string;
}) {
  return (
    <View style={styles.matchRow}>
      <View style={styles.matchText}>
        <Text style={styles.matchLabel}>{label}</Text>
        <Text style={styles.matchValue}>{value}</Text>
      </View>
      <View style={styles.previewStack}>
        {items.map((item, index) => (
          <View key={item.copyId} style={[styles.preview, index > 0 && styles.previewOverlap]}>
            <Image source={item.image} style={styles.previewImage} />
            {overflowCount && index === items.length - 1 ? (
              <View style={styles.previewShade}>
                <Text style={styles.overflowText}>+{overflowCount}</Text>
              </View>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  profileLoadState: {
    alignItems: "center",
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: "center",
    padding: spacing.page,
  },
  profileLoadText: { ...typography.body, color: colors.textSecondary, textAlign: "center" },
  content: { backgroundColor: colors.background, paddingBottom: 112 },
  segments: { paddingHorizontal: spacing.page, paddingVertical: 24 },
  gridRow: { gap: spacing.compact, paddingHorizontal: spacing.page },
  matchRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  matchText: { gap: spacing.micro },
  matchLabel: { color: colors.controlSelected, ...typography.body },
  matchValue: { color: colors.controlSelected, fontSize: 13, lineHeight: 17 },
  previewStack: { flexDirection: "row" },
  preview: {
    borderColor: colors.controlSelected,
    borderRadius: 4,
    borderWidth: 1,
    height: 48,
    width: 66,
    overflow: "hidden",
  },
  previewImage: { height: "100%", width: "100%" },
  previewShade: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  overflowText: { color: colors.controlSelected, fontSize: 15, fontWeight: "600" },
  previewOverlap: { marginLeft: -16 },
});
