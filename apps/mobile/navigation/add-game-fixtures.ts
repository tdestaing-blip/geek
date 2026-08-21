import type { ImageSourcePropType } from "react-native";

import ATARI_2600 from "../assets/add-game/platforms/atari-2600.png";
import DREAMCAST from "../assets/add-game/platforms/dreamcast.png";
import MEGADRIVE from "../assets/add-game/platforms/megadrive.png";
import N64 from "../assets/add-game/platforms/n64.png";
import NES from "../assets/add-game/platforms/nes.png";
import PS1 from "../assets/add-game/platforms/ps1.png";
import PS2 from "../assets/add-game/platforms/ps2.png";
import SNES from "../assets/add-game/platforms/snes.png";
import { WISHLIST_MARKET_TARGETS } from "./marketplace-fixtures";

export type PlatformFixture = {
  readonly id: string;
  readonly name: string;
  readonly shortName: string;
  readonly image: ImageSourcePropType;
  readonly colors: readonly [string, string];
};

export type CatalogGameFixture = {
  readonly id: string;
  readonly title: string;
  readonly artwork: ImageSourcePropType;
};

export type CatalogEditionFixture = {
  readonly id: string;
  readonly gameId: string;
  readonly platformId: string;
  readonly region: "France";
};

export type GamePlatformSearchResult = {
  readonly gameId: string;
  readonly platformId: string;
  readonly title: string;
  readonly artwork: ImageSourcePropType;
  readonly regionCount: number;
};

export type GameRegionVariant = {
  readonly editionId: string;
  readonly gameId: string;
  readonly platformId: string;
  readonly region: CatalogEditionFixture["region"];
  readonly title: string;
  readonly artwork: ImageSourcePropType;
};

export const PLATFORMS: readonly PlatformFixture[] = [
  {
    id: "atari-2600",
    name: "Atari 2600",
    shortName: "Atari 2600",
    image: ATARI_2600,
    colors: ["#BEBAC8", "#A9A6B2"],
  },
  { id: "n64", name: "Nintendo 64", shortName: "N64", image: N64, colors: ["#C6C3B3", "#AFAEA1"] },
  {
    id: "snes",
    name: "Super Nintendo",
    shortName: "SNES",
    image: SNES,
    colors: ["#BAC0CF", "#A3A9BA"],
  },
  {
    id: "nes",
    name: "Nintendo Entertainment System",
    shortName: "NES",
    image: NES,
    colors: ["#CFB4B4", "#B8A1A3"],
  },
  { id: "ps1", name: "PlayStation", shortName: "PS1", image: PS1, colors: ["#B2C3C6", "#9FACEB2"] },
  {
    id: "ps2",
    name: "PlayStation 2",
    shortName: "PS2",
    image: PS2,
    colors: ["#AFB2C8", "#9C9FB3"],
  },
  {
    id: "dreamcast",
    name: "Dreamcast",
    shortName: "Dreamcast",
    image: DREAMCAST,
    colors: ["#CDBCB3", "#B6A8A2"],
  },
  {
    id: "megadrive",
    name: "Mega Drive",
    shortName: "Megadrive",
    image: MEGADRIVE,
    colors: ["#B2C1B8", "#9FAAA5"],
  },
] as const;

const PLATFORM_BY_WISHLIST_LABEL = { N64: "n64", SNES: "snes" } as const;

export const CATALOG_GAMES: readonly CatalogGameFixture[] = WISHLIST_MARKET_TARGETS.map(
  ({ gameId, image, title }) => ({ id: gameId, artwork: image, title }),
);

export const CATALOG_EDITIONS: readonly CatalogEditionFixture[] = WISHLIST_MARKET_TARGETS.map(
  ({ editionId, gameId, platform }) => ({
    id: editionId,
    gameId,
    platformId: PLATFORM_BY_WISHLIST_LABEL[platform],
    region: "France",
  }),
);

export function getPlatform(platformId: string): PlatformFixture {
  const platform = PLATFORMS.find(({ id }) => id === platformId);
  if (!platform) throw new Error(`Unknown local Platform fixture: ${platformId}`);
  return platform;
}

export function getCatalogGame(gameId: string): CatalogGameFixture {
  const game = CATALOG_GAMES.find(({ id }) => id === gameId);
  if (!game) throw new Error(`Unknown local catalog Game fixture: ${gameId}`);
  return game;
}

export function getGameRegionVariants(
  gameId: string,
  platformId: string,
): readonly GameRegionVariant[] {
  const game = getCatalogGame(gameId);
  return CATALOG_EDITIONS.filter(
    (edition) => edition.gameId === gameId && edition.platformId === platformId,
  )
    .map((edition) => ({
      ...edition,
      artwork: game.artwork,
      editionId: edition.id,
      title: game.title,
    }))
    .sort((a, b) => a.region.localeCompare(b.region) || a.editionId.localeCompare(b.editionId));
}

export function buildGamePlatformSearchIndex(): readonly GamePlatformSearchResult[] {
  const groups = new Map<string, CatalogEditionFixture[]>();
  for (const edition of CATALOG_EDITIONS) {
    const key = `${edition.gameId}:${edition.platformId}`;
    groups.set(key, [...(groups.get(key) ?? []), edition]);
  }
  return [...groups.values()]
    .map((editions) => {
      const first = editions[0];
      if (!first) throw new Error("Catalog projection cannot contain an empty Edition group");
      const game = getCatalogGame(first.gameId);
      return {
        artwork: game.artwork,
        gameId: game.id,
        platformId: first.platformId,
        regionCount: new Set(editions.map(({ region }) => region)).size,
        title: game.title,
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title) || a.platformId.localeCompare(b.platformId));
}

export const GAME_PLATFORM_INDEX = buildGamePlatformSearchIndex();

export function normalizeSearchText(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase();
}

export function searchGamePlatformResults(
  query: string,
  platformId?: string | null,
): readonly GamePlatformSearchResult[] {
  const normalizedQuery = normalizeSearchText(query);
  return GAME_PLATFORM_INDEX.filter(
    (result) =>
      (!platformId || result.platformId === platformId) &&
      (!normalizedQuery || normalizeSearchText(result.title).includes(normalizedQuery)),
  ).sort((a, b) => {
    const aTitle = normalizeSearchText(a.title);
    const bTitle = normalizeSearchText(b.title);
    const score = (title: string) =>
      title === normalizedQuery ? 0 : title.startsWith(normalizedQuery) ? 1 : 2;
    return (
      score(aTitle) - score(bTitle) ||
      aTitle.localeCompare(bTitle) ||
      a.gameId.localeCompare(b.gameId)
    );
  });
}
