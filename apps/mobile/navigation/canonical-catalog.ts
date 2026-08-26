import type { GamePresentationMedia } from "@geek/data";
import type { CatalogMedia, Edition, Game, Platform } from "@geek/domain";

export type GamePlatformSearchResult = {
  readonly gameId: string;
  readonly platformId: string;
  readonly title: string;
  readonly platformName: string;
  readonly platformSlug: string;
  readonly editionCount: number;
  readonly artworkUrl: string | null;
  readonly mediaAttribution: string | null;
};

export type GameRegionVariant = {
  readonly editionId: string;
  readonly gameId: string;
  readonly platformId: string;
  readonly title: string;
  readonly platformName: string;
  readonly regionCode: string | null;
  readonly editionName: string | null;
  readonly artworkUrl: string | null;
  readonly mediaAttribution: string | null;
};

export type CanonicalMarketCatalog = {
  readonly game: Game;
  readonly edition: Edition;
  readonly platform: Platform;
  readonly artworkUrl: string | null;
  readonly aboutArtworkUrl: string | null;
  readonly mediaAttributions: readonly string[];
};

export function buildGamePlatformResults(
  games: readonly Game[],
  editions: readonly Edition[],
  platforms: readonly Platform[],
  covers: readonly GamePresentationMedia[],
): readonly GamePlatformSearchResult[] {
  const gameById = new Map(games.map((game) => [game.id, game]));
  const platformById = new Map(platforms.map((platform) => [platform.id, platform]));
  const coverByGameId = new Map(covers.map(({ gameId, media }) => [gameId, media.assetUrl]));
  const grouped = new Map<string, Set<string>>();

  for (const edition of editions) {
    if (!gameById.has(edition.gameId) || !platformById.has(edition.platformId)) continue;
    const key = `${edition.gameId}:${edition.platformId}`;
    const editionIds = grouped.get(key) ?? new Set<string>();
    editionIds.add(edition.id);
    grouped.set(key, editionIds);
  }

  return [...grouped.entries()].flatMap(([key, editionIds]) => {
    const [gameId, platformId] = key.split(":");
    if (!gameId || !platformId) return [];
    const game = gameById.get(gameId);
    const platform = platformById.get(platformId);
    if (!game || !platform) return [];

    return [
      {
        gameId,
        platformId,
        title: game.canonicalTitle,
        platformName: platform.name,
        platformSlug: platform.slug,
        editionCount: editionIds.size,
        artworkUrl: coverByGameId.get(gameId) ?? null,
        mediaAttribution:
          covers.find((cover) => cover.gameId === gameId)?.media.attribution ?? null,
      },
    ];
  });
}

export function buildGameRegionVariants(
  game: Game,
  platform: Platform,
  editions: readonly Edition[],
  editionCovers: readonly CatalogMedia[],
  gameCover: CatalogMedia | null,
): readonly GameRegionVariant[] {
  const coverByEditionId = new Map(
    editionCovers.flatMap((cover) =>
      cover.editionId === null ? [] : [[cover.editionId, cover.assetUrl] as const],
    ),
  );

  return editions
    .filter((edition) => edition.gameId === game.id && edition.platformId === platform.id)
    .map((edition) => ({
      editionId: edition.id,
      gameId: game.id,
      platformId: platform.id,
      title: game.canonicalTitle,
      platformName: platform.name,
      regionCode: edition.regionCode,
      editionName: edition.editionName,
      artworkUrl: coverByEditionId.get(edition.id) ?? gameCover?.assetUrl ?? null,
      mediaAttribution:
        editionCovers.find((cover) => cover.editionId === edition.id)?.attribution ??
        gameCover?.attribution ??
        null,
    }));
}

export function resolveCanonicalMarket(
  game: Game,
  edition: Edition,
  platform: Platform,
  editionCover: CatalogMedia | null,
  gameCover: CatalogMedia | null,
  gameArtwork: CatalogMedia | null = null,
): CanonicalMarketCatalog | null {
  if (edition.gameId !== game.id || edition.platformId !== platform.id) return null;
  const selectedCover = editionCover ?? gameCover;
  const selectedAbout = gameArtwork ?? gameCover;
  return {
    game,
    edition,
    platform,
    artworkUrl: selectedCover?.assetUrl ?? null,
    aboutArtworkUrl: selectedAbout?.assetUrl ?? null,
    mediaAttributions: [selectedCover?.attribution, selectedAbout?.attribution].filter(
      (value): value is string => Boolean(value),
    ),
  };
}

export function getCatalogRegionPresentation(regionCode: string | null): {
  readonly flag: string;
  readonly label: string;
} {
  const flags: Readonly<Record<string, string>> = {
    JP: "🇯🇵",
    US: "🇺🇸",
    EU: "🇪🇺",
    "AU+NZ": "🇦🇺",
    "CA+MX+US": "🌎",
  };
  return {
    flag: regionCode ? (flags[regionCode] ?? "🌐") : "🌐",
    label: regionCode ?? "Région inconnue",
  };
}

export function getEditionVariantLabel(editionName: string | null): string {
  return editionName?.trim() || "Standard";
}
