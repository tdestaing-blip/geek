import type { ImageSourcePropType } from "react-native";

import ATARI_2600 from "../assets/add-game/platforms/atari-2600.png";
import DREAMCAST from "../assets/add-game/platforms/dreamcast.png";
import MEGADRIVE from "../assets/add-game/platforms/megadrive.png";
import N64 from "../assets/add-game/platforms/n64.png";
import NES from "../assets/add-game/platforms/nes.png";
import PS1 from "../assets/add-game/platforms/ps1.png";
import PS2 from "../assets/add-game/platforms/ps2.png";
import SNES from "../assets/add-game/platforms/snes.png";

/** Presentation metadata only. Canonical Platform identity always comes from @geek/data. */
export type PlatformPresentation = {
  readonly slug: string;
  readonly name: string;
  readonly shortName: string;
  readonly image: ImageSourcePropType;
  readonly colors: readonly [string, string];
};

export const PLATFORM_PRESENTATIONS: readonly PlatformPresentation[] = [
  {
    slug: "atari-2600",
    name: "Atari 2600",
    shortName: "Atari 2600",
    image: ATARI_2600,
    colors: ["#BEBAC8", "#A9A6B2"],
  },
  {
    slug: "nintendo-64",
    name: "Nintendo 64",
    shortName: "N64",
    image: N64,
    colors: ["#C6C3B3", "#AFAEA1"],
  },
  {
    slug: "super-nintendo-entertainment-system",
    name: "Super Nintendo",
    shortName: "SNES",
    image: SNES,
    colors: ["#BAC0CF", "#A3A9BA"],
  },
  {
    slug: "nintendo-entertainment-system",
    name: "Nintendo Entertainment System",
    shortName: "NES",
    image: NES,
    colors: ["#CFB4B4", "#B8A1A3"],
  },
  {
    slug: "playstation",
    name: "PlayStation",
    shortName: "PS1",
    image: PS1,
    colors: ["#B2C3C6", "#9FACEB2"],
  },
  {
    slug: "playstation-2",
    name: "PlayStation 2",
    shortName: "PS2",
    image: PS2,
    colors: ["#AFB2C8", "#9C9FB3"],
  },
  {
    slug: "dreamcast",
    name: "Dreamcast",
    shortName: "Dreamcast",
    image: DREAMCAST,
    colors: ["#CDBCB3", "#B6A8A2"],
  },
  {
    slug: "mega-drive-genesis",
    name: "Mega Drive",
    shortName: "Megadrive",
    image: MEGADRIVE,
    colors: ["#B2C1B8", "#9FAAA5"],
  },
] as const;

export function getPlatformPresentation(slug: string): PlatformPresentation | null {
  return PLATFORM_PRESENTATIONS.find((platform) => platform.slug === slug) ?? null;
}

export function normalizeSearchText(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase();
}
