import type { Album } from "@geek/domain";
import type { ImageSourcePropType } from "react-native";

import N64_LOGO from "../assets/albums/list/n64-logo.png";
import SNES_LOGO from "../assets/game-detail/owned/album-mark.png";

export type AlbumTheme = {
  readonly colors: readonly [string, string];
  readonly fontFamily?: string;
  readonly logo?: ImageSourcePropType;
};

const THEMES_BY_SLUG: Readonly<Record<string, AlbumTheme>> = {
  "n64-essentials": {
    colors: ["#ADD9B8", "#66AD80"],
    fontFamily: "Audiowide_400Regular",
    logo: N64_LOGO,
  },
  "snes-essentials": {
    colors: ["#D1BFEB", "#AD94CC"],
    fontFamily: "TitanOne_400Regular",
    logo: SNES_LOGO,
  },
};

const FALLBACK_THEME: AlbumTheme = { colors: ["#C8CFCC", "#8D9994"] };

/** Presentation only: membership, identity, and progress never enter this registry. */
export function getAlbumTheme(album: Album): AlbumTheme {
  return THEMES_BY_SLUG[album.slug] ?? FALLBACK_THEME;
}
