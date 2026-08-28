import ABOUT_GAME from "../assets/game-detail/market/about-game.png";
import AUCTION_COPY from "../assets/game-detail/market/auction-copy.png";
import DIRECT_COPY from "../assets/game-detail/market/direct-copy.png";
import LEON_COPY from "../assets/game-detail/market/leon-copy.png";
import COMPONENT_BOX from "../assets/game-detail/owned/component-box.png";
import COMPONENT_CARTRIDGE from "../assets/game-detail/owned/component-cartridge.png";
import COMPONENT_MANUAL from "../assets/game-detail/owned/component-manual.png";
import LEON_AVATAR from "../assets/profiles/leon.png";
import WISH_DONKEY_KONG from "../assets/collection/v2/wish-donkey-kong.png";
import WISH_DONKEY_KONG_2 from "../assets/collection/v2/wish-donkey-kong-2.png";
import WISH_LINK_TO_PAST from "../assets/collection/v2/wish-link-to-past.png";
import WISH_MAJORAS_MASK from "../assets/collection/v2/wish-majoras-mask.png";
import WISH_YOSHI_ISLAND from "../assets/collection/v2/wish-yoshi-island.png";
import type { GridItem } from "../ui/game-grid-item";
import type { ImageSourcePropType } from "react-native";

type WishlistMarketTarget = GridItem & { readonly editionId: string };

export const MAJORA_GAME_FIXTURE = {
  id: "00000000-0000-0000-0000-000000000201",
  title: "The Legend of Zelda: Majora’s Mask",
  platform: "Nintendo 64",
  image: WISH_MAJORAS_MASK,
  about: {
    image: ABOUT_GAME,
    title: "The Legend of Zelda: Majora’s Mask",
    description:
      "Développé et édité par Nintendo, Majora’s Mask prolonge l’aventure d’Ocarina of Time. Sorti sur Nintendo 64 en 2000, il est connu pour son cycle de trois jours et son atmosphère plus sombre.",
  },
} as const;

export const MAJORA_EDITION_FIXTURE = {
  id: "20000000-0000-0000-0000-000000000201",
  gameId: MAJORA_GAME_FIXTURE.id,
  region: "EU",
  regionLanguage: "PAL Europe · multilingue",
  releaseDate: "17 novembre 2000",
  code: "NUS-NZSP-EUR",
} as const;

export const LEON_PUBLIC_COPY_FIXTURE = {
  id: "30000000-0000-0000-0000-000000000301",
  gameId: MAJORA_GAME_FIXTURE.id,
  editionId: MAJORA_EDITION_FIXTURE.id,
  photos: [LEON_COPY],
  components: [
    { condition: "Très bon état", image: COMPONENT_CARTRIDGE, label: "Cartouche", present: true },
    { condition: undefined, image: COMPONENT_BOX, label: "Boîte", present: false },
    { condition: undefined, image: COMPONENT_MANUAL, label: "Notice", present: false },
  ],
  owner: {
    id: "50000000-0000-0000-0000-000000000501",
    avatar: LEON_AVATAR,
    collectionCount: 192,
    distance: "4km",
    name: "Léon Dupont",
    rating: "4.0",
    wishlistPreview: [WISH_MAJORAS_MASK, WISH_LINK_TO_PAST, WISH_DONKEY_KONG, WISH_YOSHI_ISLAND],
    wishlistTotal: 18,
  },
  story: "Acheté dans mon enfance en 96, 97",
} as const;

const CAMILLE_COPY_FIXTURE = {
  id: "30000000-0000-0000-0000-000000000302",
  gameId: MAJORA_GAME_FIXTURE.id,
  editionId: MAJORA_EDITION_FIXTURE.id,
  photos: [DIRECT_COPY],
  components: [
    { condition: "Très bon état", image: COMPONENT_CARTRIDGE, label: "Cartouche", present: true },
    { condition: "Bon état", image: COMPONENT_BOX, label: "Boîte", present: true },
    { condition: undefined, image: COMPONENT_MANUAL, label: "Notice", present: false },
  ],
  owner: {
    id: "50000000-0000-0000-0000-000000000502",
    avatar: LEON_AVATAR,
    collectionCount: 84,
    distance: "12km",
    name: "Camille Lefevre",
    rating: "4.5",
    wishlistPreview: [WISH_LINK_TO_PAST, WISH_YOSHI_ISLAND],
    wishlistTotal: 12,
  },
  story: "Conservé avec soin dans ma collection.",
} as const;

const BASILE_COPY_FIXTURE = {
  id: "30000000-0000-0000-0000-000000000303",
  gameId: MAJORA_GAME_FIXTURE.id,
  editionId: MAJORA_EDITION_FIXTURE.id,
  photos: [AUCTION_COPY],
  components: [
    { condition: "Très bon état", image: COMPONENT_CARTRIDGE, label: "Cartouche", present: true },
    { condition: "Bon état", image: COMPONENT_BOX, label: "Boîte", present: true },
    { condition: "Bon état", image: COMPONENT_MANUAL, label: "Notice", present: true },
  ],
  owner: {
    id: "50000000-0000-0000-0000-000000000503",
    avatar: LEON_AVATAR,
    collectionCount: 136,
    distance: "40km",
    name: "Basile Bolie",
    rating: "4.8",
    wishlistPreview: [WISH_DONKEY_KONG, WISH_YOSHI_ISLAND],
    wishlistTotal: 9,
  },
  story: "Une belle édition complète de ma collection.",
} as const;

type CopyFixture = {
  readonly id: string;
  readonly gameId: string;
  readonly editionId: string;
  readonly photos: readonly ImageSourcePropType[];
  readonly components: readonly {
    readonly condition?: string;
    readonly image?: ImageSourcePropType;
    readonly label: "Cartouche" | "Boîte" | "Notice";
    readonly present: boolean;
  }[];
  readonly owner: {
    readonly id: string;
    readonly avatar?: ImageSourcePropType;
    readonly collectionCount?: number;
    readonly distance: string;
    readonly name: string;
    readonly rating: string;
    readonly wishlistPreview?: readonly ImageSourcePropType[];
    readonly wishlistTotal?: number;
  };
  readonly story?: string;
};

type PublicCopyFixture = Omit<CopyFixture, "components" | "owner" | "photos" | "story"> & {
  readonly photos: readonly [ImageSourcePropType, ...ImageSourcePropType[]];
  readonly components: readonly {
    readonly condition?: string;
    readonly image: ImageSourcePropType;
    readonly label: "Cartouche" | "Boîte" | "Notice";
    readonly present: boolean;
  }[];
  readonly owner: CopyFixture["owner"] & {
    readonly avatar: ImageSourcePropType;
    readonly collectionCount: number;
    readonly wishlistPreview: readonly ImageSourcePropType[];
    readonly wishlistTotal: number;
  };
  readonly story: string;
};

const GAMES = [MAJORA_GAME_FIXTURE] as const;
const EDITIONS = [MAJORA_EDITION_FIXTURE] as const;
const COPIES: readonly CopyFixture[] = [
  LEON_PUBLIC_COPY_FIXTURE,
  CAMILLE_COPY_FIXTURE,
  BASILE_COPY_FIXTURE,
];
const PUBLIC_COPIES: readonly PublicCopyFixture[] = [
  LEON_PUBLIC_COPY_FIXTURE,
  CAMILLE_COPY_FIXTURE,
  BASILE_COPY_FIXTURE,
];

const COLLECTORS: readonly PublicCopyFixture["owner"][] = PUBLIC_COPIES.map(({ owner }) => owner);

type ListingOpportunityFixture = {
  readonly id: string;
  readonly type: "listing";
  readonly copyId: string;
  readonly price: string;
  readonly purchaseMode: "direct_and_trade";
  readonly reciprocalInterest?: {
    readonly estimatedValue: string;
    readonly gameCount: number;
    readonly previewImages: readonly ImageSourcePropType[];
  };
};

export type MarketOpportunityFixture =
  | ListingOpportunityFixture
  | {
      readonly id: string;
      readonly type: "auction";
      readonly copyId: string;
      readonly currentBid: string;
      readonly bidCount: number;
      readonly countdown: string;
    };

export const MAJORA_MARKET_OPPORTUNITIES: readonly MarketOpportunityFixture[] = [
  {
    id: "40000000-0000-0000-0000-000000000401",
    type: "listing",
    copyId: LEON_PUBLIC_COPY_FIXTURE.id,
    price: "56€",
    purchaseMode: "direct_and_trade",
    reciprocalInterest: {
      estimatedValue: "65€",
      gameCount: 2,
      previewImages: [WISH_MAJORAS_MASK, WISH_DONKEY_KONG],
    },
  },
  {
    id: "40000000-0000-0000-0000-000000000402",
    type: "listing",
    copyId: CAMILLE_COPY_FIXTURE.id,
    price: "89€",
    purchaseMode: "direct_and_trade",
  },
  {
    id: "40000000-0000-0000-0000-000000000403",
    type: "auction",
    copyId: BASILE_COPY_FIXTURE.id,
    currentBid: "56€",
    bidCount: 7,
    countdown: "2j : 04h : 36m",
  },
];

export const WISHLIST_MARKET_TARGETS: readonly WishlistMarketTarget[] = [
  {
    gameId: "00000000-0000-0000-0000-000000000201",
    editionId: "20000000-0000-0000-0000-000000000201",
    title: "Zelda: Majora’s Mask",
    image: WISH_MAJORAS_MASK,
    platform: "N64",
    opportunities: 2,
    overlay: "bell",
  },
  {
    gameId: "00000000-0000-0000-0000-000000000202",
    editionId: "20000000-0000-0000-0000-000000000202",
    title: "Zelda: A Link to the Past",
    image: WISH_LINK_TO_PAST,
    platform: "SNES",
    opportunities: 2,
    overlay: "bell",
  },
  {
    gameId: "00000000-0000-0000-0000-000000000203",
    editionId: "20000000-0000-0000-0000-000000000203",
    title: "Donkey Kong Country",
    image: WISH_DONKEY_KONG,
    platform: "SNES",
    opportunities: 0,
    overlay: "bell",
  },
  {
    gameId: "00000000-0000-0000-0000-000000000204",
    editionId: "20000000-0000-0000-0000-000000000204",
    title: "Super Mario World 2: Yoshi’s Island",
    image: WISH_YOSHI_ISLAND,
    platform: "SNES",
    opportunities: 0,
    overlay: "bell",
  },
  {
    gameId: "00000000-0000-0000-0000-000000000205",
    editionId: "20000000-0000-0000-0000-000000000205",
    title: "Donkey Kong Country 2",
    image: WISH_DONKEY_KONG_2,
    platform: "SNES",
    opportunities: 0,
    overlay: "bell",
  },
];

export function isMajoraMarketIdentity(gameId: string, editionId: string): boolean {
  return gameId === MAJORA_GAME_FIXTURE.id && editionId === MAJORA_EDITION_FIXTURE.id;
}

function requireFixture<T>(fixture: T | undefined, message: string): T {
  if (!fixture) throw new Error(message);
  return fixture;
}

export function getGameFixture(gameId: string) {
  return requireFixture(
    GAMES.find(({ id }) => id === gameId),
    `Unknown local Game fixture: ${gameId}`,
  );
}

export function getEditionFixture(editionId: string) {
  return requireFixture(
    EDITIONS.find(({ id }) => id === editionId),
    `Unknown local Edition fixture: ${editionId}`,
  );
}

export function getCopyFixture(copyId: string): CopyFixture {
  return requireFixture(
    COPIES.find(({ id }) => id === copyId),
    `Unknown local Copy fixture: ${copyId}`,
  );
}

export function resolveCopyFixture(copyId: string) {
  const copy = getCopyFixture(copyId);
  const edition = getEditionFixture(copy.editionId);
  const game = getGameFixture(edition.gameId);

  if (copy.gameId !== game.id) {
    throw new Error(`Incoherent local Copy fixture: ${copy.id}`);
  }

  return { copy, edition, game } as const;
}

export function resolvePublicCopyFixture(copyId: string) {
  const copy = requireFixture(
    PUBLIC_COPIES.find(({ id }) => id === copyId),
    `Unknown local Public Copy fixture: ${copyId}`,
  );
  const edition = getEditionFixture(copy.editionId);
  const game = getGameFixture(edition.gameId);
  const opportunities = MAJORA_MARKET_OPPORTUNITIES.filter(
    (candidate) => candidate.copyId === copy.id,
  );
  if (opportunities.length > 1) {
    throw new Error(`Conflicting local commercial opportunities for Copy: ${copy.id}`);
  }
  const opportunity = opportunities[0] ?? null;

  if (copy.gameId !== game.id) {
    throw new Error(`Incoherent local Public Copy fixture: ${copy.id}`);
  }

  return { copy, edition, game, opportunity } as const;
}

export function resolveCollectorFixture(userId: string): PublicCopyFixture["owner"] {
  return requireFixture(
    COLLECTORS.find(({ id }) => id === userId),
    `Unknown local collector fixture: ${userId}`,
  );
}

export function findCollectorFixture(userId: string): PublicCopyFixture["owner"] | null {
  return COLLECTORS.find(({ id }) => id === userId) ?? null;
}

export function resolveActiveMarketOpportunitiesForOwner(userId: string) {
  const seenCopyIds = new Set<string>();

  return MAJORA_MARKET_OPPORTUNITIES.flatMap((opportunity) => {
    const resolved = resolvePublicCopyFixture(opportunity.copyId);
    if (resolved.copy.owner.id !== userId || seenCopyIds.has(resolved.copy.id)) return [];
    seenCopyIds.add(resolved.copy.id);
    return [{ opportunity, resolved }] as const;
  });
}
