import type { ImageSourcePropType } from "react-native";

import GAME_BOY_LOGO from "../assets/albums/list/game-boy-logo.png";
import N64_LOGO from "../assets/albums/list/n64-logo.png";
import SNES_LOGO from "../assets/game-detail/owned/album-mark.png";
import ZELDA_LOGO from "../assets/albums/list/zelda-logo.png";
import CASTLEVANIA from "../assets/albums/snes-essentials/castlevania.png";
import CHRONO_TRIGGER_SMALL from "../assets/albums/snes-essentials/chrono-trigger-small.png";
import DONKEY_KONG from "../assets/albums/snes-essentials/donkey-kong.png";
import DONKEY_KONG_2 from "../assets/albums/snes-essentials/donkey-kong-2.png";
import FINAL_FANTASY from "../assets/albums/snes-essentials/final-fantasy-iii.png";
import FINAL_FANTASY_SMALL from "../assets/albums/snes-essentials/final-fantasy-iii-small.png";
import MARIO_ALL_STARS from "../assets/albums/snes-essentials/mario-all-stars.png";
import MARIO_ALL_STARS_BOX from "../assets/albums/snes-essentials/mario-all-stars-box.png";
import MARIO_ALL_STARS_LARGE from "../assets/albums/snes-essentials/mario-all-stars-large.png";
import SUPER_METROID_SMALL from "../assets/albums/snes-essentials/super-metroid-small.png";
import YOSHI_ISLAND from "../assets/albums/snes-essentials/yoshi-island.png";
import ZELDA from "../assets/albums/snes-essentials/zelda.png";
import ZELDA_SMALL from "../assets/albums/snes-essentials/zelda-small.png";
import NBA_LIVE_95 from "../assets/albums/snes-essentials/nba-live-95.png";
import CHRONO_TRIGGER from "../assets/collection/v2/my-chrono-trigger.png";
import ASTERIX from "../assets/collection/v2/my-asterix.png";
import SUPER_METROID from "../assets/collection/v2/my-super-metroid.png";

export type AlbumFixture = {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly ownedSlots: number;
  readonly totalSlots: number;
  readonly colors: readonly [string, string];
  readonly logo: ImageSourcePropType;
  readonly fontFamily: string;
};

export const ALBUMS: readonly AlbumFixture[] = [
  {
    id: "snes-essentials",
    title: "Essentials",
    subtitle: "Super Nintendo",
    ownedSlots: 5,
    totalSlots: 19,
    colors: ["#D1BFEB", "#AD94CC"],
    logo: SNES_LOGO,
    fontFamily: "TitanOne_400Regular",
  },
  {
    id: "snes-cult-classics",
    title: "Cult Classics",
    subtitle: "Super Nintendo",
    ownedSlots: 5,
    totalSlots: 19,
    colors: ["#B8B8CC", "#807A9E"],
    logo: SNES_LOGO,
    fontFamily: "TitanOne_400Regular",
  },
  {
    id: "n64-essentials",
    title: "Essentials",
    subtitle: "Nintendo 64",
    ownedSlots: 4,
    totalSlots: 19,
    colors: ["#ADD9B8", "#66AD80"],
    logo: N64_LOGO,
    fontFamily: "Audiowide_400Regular",
  },
  {
    id: "n64-cult-classics",
    title: "Cult Classics",
    subtitle: "Nintendo 64",
    ownedSlots: 4,
    totalSlots: 19,
    colors: ["#A6C7D1", "#6B8C9E"],
    logo: N64_LOGO,
    fontFamily: "Audiowide_400Regular",
  },
  {
    id: "game-boy-pokemon",
    title: "Pokémon",
    subtitle: "Game Boy",
    ownedSlots: 4,
    totalSlots: 19,
    colors: ["#D9DEA6", "#B2B873"],
    logo: GAME_BOY_LOGO,
    fontFamily: "PressStart2P_400Regular",
  },
  {
    id: "zelda-integral",
    title: "Zelda Intégral",
    subtitle: "The Legend of Zelda",
    ownedSlots: 4,
    totalSlots: 19,
    colors: ["#EBD494", "#C7A659"],
    logo: ZELDA_LOGO,
    fontFamily: "Cinzel_700Bold",
  },
] as const;

export type AlbumEntryFixture = {
  readonly id: string;
  readonly title: string;
  readonly image: ImageSourcePropType;
  readonly owned: boolean;
  readonly wanted: boolean;
  readonly networkCount?: number;
  readonly price?: string;
  readonly photoRoles?: readonly ("cartridge" | "box" | "manual")[];
};

export const SNES_ESSENTIAL_ENTRIES: readonly AlbumEntryFixture[] = [
  {
    id: "asterix",
    title: "Astérix",
    image: ASTERIX,
    owned: true,
    wanted: false,
    price: "34€",
    photoRoles: ["cartridge", "box"],
  },
  {
    id: "zelda",
    title: "Zelda: A Link to the Past",
    image: ZELDA,
    owned: true,
    wanted: false,
    photoRoles: ["cartridge", "box"],
  },
  {
    id: "chrono",
    title: "Chrono Trigger",
    image: CHRONO_TRIGGER,
    owned: true,
    wanted: false,
    photoRoles: ["cartridge"],
  },
  {
    id: "all-stars",
    title: "Super Mario All-Stars",
    image: MARIO_ALL_STARS_BOX,
    owned: false,
    wanted: false,
    networkCount: 2,
  },
  {
    id: "metroid",
    title: "Super Metroid",
    image: SUPER_METROID,
    owned: true,
    wanted: false,
    photoRoles: ["cartridge", "box"],
  },
  {
    id: "nba",
    title: "NBA Live 95",
    image: NBA_LIVE_95,
    owned: true,
    wanted: false,
    photoRoles: ["cartridge"],
  },
  {
    id: "castlevania",
    title: "Super Castlevania IV",
    image: CASTLEVANIA,
    owned: false,
    wanted: true,
    networkCount: 0,
  },
  { id: "dkc", title: "Donkey Kong Country", image: DONKEY_KONG, owned: false, wanted: true },
  {
    id: "metroid-cart",
    title: "Super Metroid",
    image: SUPER_METROID_SMALL,
    owned: false,
    wanted: false,
  },
  { id: "yoshi", title: "Yoshi’s Island", image: YOSHI_ISLAND, owned: false, wanted: true },
  {
    id: "chrono-cart",
    title: "Chrono Trigger",
    image: CHRONO_TRIGGER_SMALL,
    owned: false,
    wanted: false,
  },
  { id: "ff3", title: "Final Fantasy III", image: FINAL_FANTASY, owned: false, wanted: true },
  {
    id: "zelda-cart",
    title: "Zelda: A Link to the Past",
    image: ZELDA_SMALL,
    owned: false,
    wanted: false,
  },
  { id: "dkc2", title: "Donkey Kong Country 2", image: DONKEY_KONG_2, owned: false, wanted: false },
  {
    id: "ff3-small",
    title: "Final Fantasy III",
    image: FINAL_FANTASY_SMALL,
    owned: false,
    wanted: false,
  },
  {
    id: "all-stars-large",
    title: "Super Mario All-Stars",
    image: MARIO_ALL_STARS_LARGE,
    owned: false,
    wanted: false,
  },
  {
    id: "all-stars-cart",
    title: "Super Mario All-Stars",
    image: MARIO_ALL_STARS,
    owned: false,
    wanted: false,
  },
  { id: "metroid-alt", title: "Super Metroid", image: SUPER_METROID, owned: false, wanted: false },
  { id: "chrono-alt", title: "Chrono Trigger", image: CHRONO_TRIGGER, owned: false, wanted: false },
] as const;

export function getAlbumProgress(album: AlbumFixture) {
  if (album.id !== "snes-essentials") {
    return { ownedSlots: album.ownedSlots, totalSlots: album.totalSlots } as const;
  }
  return {
    ownedSlots: SNES_ESSENTIAL_ENTRIES.filter(({ owned }) => owned).length,
    totalSlots: SNES_ESSENTIAL_ENTRIES.length,
  } as const;
}

export function getAlbumFixture(albumId: string) {
  const album = ALBUMS.find(({ id }) => id === albumId);
  if (!album) throw new Error(`Unknown local Album fixture: ${albumId}`);
  return album;
}
