import type { NormalizedPlatformRecord } from "./types.ts";

export type LibretroPlatform = NormalizedPlatformRecord & {
  readonly key: string;
  readonly sourcePath: string;
};

export const LIBRETRO_PLATFORMS: readonly LibretroPlatform[] = [
  platform(
    "nes",
    "nintendo-entertainment-system",
    "Nintendo Entertainment System",
    "Nintendo",
    "Nintendo - Nintendo Entertainment System",
    "no-intro",
  ),
  platform(
    "snes",
    "super-nintendo-entertainment-system",
    "Super Nintendo Entertainment System",
    "Nintendo",
    "Nintendo - Super Nintendo Entertainment System",
    "no-intro",
  ),
  platform("game-boy", "game-boy", "Game Boy", "Nintendo", "Nintendo - Game Boy", "no-intro"),
  platform(
    "game-boy-color",
    "game-boy-color",
    "Game Boy Color",
    "Nintendo",
    "Nintendo - Game Boy Color",
    "no-intro",
  ),
  platform(
    "game-boy-advance",
    "game-boy-advance",
    "Game Boy Advance",
    "Nintendo",
    "Nintendo - Game Boy Advance",
    "no-intro",
  ),
  platform(
    "nintendo-64",
    "nintendo-64",
    "Nintendo 64",
    "Nintendo",
    "Nintendo - Nintendo 64",
    "no-intro",
  ),
  platform(
    "gamecube",
    "nintendo-gamecube",
    "Nintendo GameCube",
    "Nintendo",
    "Nintendo - GameCube",
    "redump",
  ),
  platform(
    "master-system",
    "sega-master-system",
    "Master System / Mark III",
    "Sega",
    "Sega - Master System - Mark III",
    "no-intro",
  ),
  platform(
    "mega-drive",
    "sega-mega-drive",
    "Mega Drive / Genesis",
    "Sega",
    "Sega - Mega Drive - Genesis",
    "no-intro",
  ),
  platform("saturn", "sega-saturn", "Saturn", "Sega", "Sega - Saturn", "redump"),
  platform("dreamcast", "sega-dreamcast", "Dreamcast", "Sega", "Sega - Dreamcast", "redump"),
  platform(
    "playstation",
    "sony-playstation",
    "PlayStation",
    "Sony",
    "Sony - PlayStation",
    "redump",
  ),
  platform(
    "playstation-2",
    "sony-playstation-2",
    "PlayStation 2",
    "Sony",
    "Sony - PlayStation 2",
    "redump",
  ),
];

export function getLibretroPlatform(value: string): LibretroPlatform | null {
  return (
    LIBRETRO_PLATFORMS.find(
      (platformRecord) =>
        platformRecord.key === value || platformRecord.providerSystemName === value,
    ) ?? null
  );
}

function platform(
  key: string,
  slug: string,
  name: string,
  manufacturer: string,
  providerSystemName: string,
  sourceFamily: "no-intro" | "redump",
): LibretroPlatform {
  return {
    key,
    slug,
    name,
    manufacturer,
    providerSystemName,
    sourcePath: `metadat/${sourceFamily}/${providerSystemName}.dat`,
  };
}
