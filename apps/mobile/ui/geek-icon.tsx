import { colors } from "@geek/design-tokens";
import { SvgXml } from "react-native-svg";

export type GeekIconName =
  | "activity"
  | "album"
  | "bell"
  | "box"
  | "collection"
  | "community"
  | "chevron-down"
  | "diamond-gem"
  | "image-2-plus"
  | "image-plus"
  | "plus"
  | "more-horizontal"
  | "profile"
  | "settings"
  | "shopping-cart";

// Exact Pixelarticons vector data sourced from Iconify's Pixelarticons collection.
const GLYPHS: Readonly<Record<GeekIconName, string>> = {
  activity:
    '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M4 2h16v2H4zm0 18h16v2H4zM2 4h2v16H2zm18 0h2v16h-2zM7 11h2v6H7zm4-4h2v10h-2zm4 6h2v4h-2z"/></svg>',
  album:
    '<svg viewBox="0 0 24 24"><g fill="currentColor"><path d="M4 2h16v2H4zm0 18h16v2H4zM2 4h2v16H2zm18 0h2v16h-2zm-4 0h2v8h-2zm-4 0h2v8h-2z"/><path d="M14 3h2v7h-2z"/></g></svg>',
  bell: '<svg viewBox="0 0 24 24"><g fill="currentColor"><path d="M9 2h6v2H9zM7 4h2v2H7zm8 0h2v2h-2zM5 6h2v7H5zm12 0h2v7h-2zM3 13h2v4H3zm16 0h2v4h-2z"/><path d="M3 15h18v2H3zm5 3h2v2H8zm6 0h2v2h-2zm-4 2h4v2h-4z"/></g></svg>',
  box: '<svg viewBox="0 0 24 24"><g fill="currentColor"><path d="M14 4h4v2h-4zm-4-2h4v2h-4zM6 8h4v2H6zm0 10h4v2H6zm4-8h4v2h-4zm0 10h4v2h-4zm4-12h4v2h-4zm0 10h4v2h-4zM6 4h4v2H6zM2 6h4v2H2zm0 10h4v2H2zM18 6h4v2h-4zm0 10h4v2h-4z"/><path d="M2 6h2v12H2zm18 0h2v12h-2zm-8 6h2v8h-2z"/></g></svg>',
  collection:
    '<svg viewBox="0 0 24 24"><g fill="currentColor"><path d="M4 4h16v2H4zm0 14h16v2H4zM2 6h2v12H2zm18 0h2v12h-2zM8 9h2v6H8z"/><path d="M6 11h6v2H6zm8-2h2v2h-2zm2 4h2v2h-2z"/></g></svg>',
  community:
    '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M9 21H5v-2h4zm10 0h-4v-2h4zM5 19H3v-2h2zm12-2h-2v2h-2v-2h-2v2H9v-2H7v-2h10zm4 2h-2v-2h2zM3 17H1V7h2zm20 0h-2V7h2zm-12-4H8v-3h3zm5 0h-3v-3h3zM5 7H3V5h2zm10 0H9V5h6zm6 0h-2V5h2zM9 5H5V3h4zm10 0h-4V3h4z"/></svg>',
  "chevron-down":
    '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M13 16h-2v-2h2v2Zm-2-2H9v-2h2v2Zm4 0h-2v-2h2v2Zm-6-2H7v-2h2v2Zm8 0h-2v-2h2v2Zm-10-2H5V8h2v2Zm12 0h-2V8h2v2Z"/></svg>',
  "diamond-gem":
    '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M7 1h10v2H7zM5 3h2v2H5zm12 0h2v2h-2zm2 2h2v2h-2zm0 8h2v2h-2zm-2 2h2v2h-2zm-2 2h2v2h-2zm-2 2h2v2h-2zm-2 2h2v2h-2zm-2-2h2v2H9zm-2-2h2v2H7zm-2-2h2v2H5zm-2-2h2v2H3zm0-8h2v2H3zM1 7h2v6H1zm20 0h2v6h-2zM3 9h18v2H3zm6-6h2v3H9zM7 6h2v3H7zm8 0h2v3h-2zM7 11h2v2H7zm2 2h2v3H9zm2 3h2v3h-2zm2-3h2v3h-2zm2-2h2v2h-2zm-2-8h2v3h-2z"/></svg>',
  "image-2-plus":
    '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M2 0h12v2H2zm0 22h20v2H2zM0 2h2v20H0zm22 8h2v12h-2zm-8 0h2v2h-2zm-2 2h2v2h-2zm4 0h2v2h-2zm-6 2h2v2h-2zm8 0h2v2h-2zm-10 2h2v2H8zm-2 2h2v2H6zm2-14h2v2H8zM6 6h2v2H6zm2 2h2v2H8zm2-2h2v2h-2zm10-6h2v8h-2zm-2 2h6v2h-6z"/></svg>',
  "image-plus":
    '<svg viewBox="0 0 24 24"><g fill="currentColor"><path d="M4 2h10v2H4zm0 18h16v2H4zM2 4h2v16H2zm18 6h2v10h-2zm-6 0h2v2h-2zm-2 2h2v2h-2zm4 0h2v2h-2zm-6 2h2v2h-2zm8 0h2v2h-2zM8 16h2v2H8zm-2 2h2v2H6zM8 6h2v2H8zM6 8h2v2H6zm2 2h2v2H8zm2-2h2v2h-2zm8-6h2v6h-2z"/><path d="M16 4h6v2h-6z"/></g></svg>',
  plus: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M13 11h7v2h-7v7h-2v-7H4v-2h7V4h2z"/></svg>',
  "more-horizontal":
    '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M3 9h2v2H3zm8 0h2v2h-2zm8 0h2v2h-2zM1 11h2v2H1zm8 0h2v2H9zm8 0h2v2h-2zM3 13h2v2H3zm8 0h2v2h-2zm8 0h2v2h-2zM5 11h2v2H5zm8 0h2v2h-2zm8 0h2v2h-2z"/></svg>',
  profile:
    '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M6 2h8v2H6zm0 18h12v2H6zM4 4h2v2H4zM2 6h2v12H2zm20 4h-2v8h2zM4 18h2v2H4zm16 0h-2v2h2zM10 6h4v2h-4zM8 8h2v4H8zm2 4h4v2h-4zm4-4h2v4h-2zm-8 8h12v2H6zM18 2h2v2h-2zm-2 2h2v2h-2zm2 2h2v2h-2zm2-2h2v2h-2z"/></svg>',
  settings:
    '<svg viewBox="0 0 24 24"><g fill="currentColor"><path d="M4 14h2v6H4zm6 0h2v6h-2zm-4-2h4v2H6zm0 8h4v2H6zm-4-4h2v2H2zm20-8h-4V6h4z"/><path d="M10 16h12v2H10zm4-8H2V6h12zm6-4v2h-2V4zm0 6V8h-2v2zm-6-8h4v2h-4zm0 10h4v-2h-4zm-2-8h2v2h-2zm0 6h2V8h-2z"/></g></svg>',
  "shopping-cart":
    '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M2 2h2v2H2zm2 6h2v4H4zm2 4h2v4H6zm2 4h10v2H8zm10-4h2v4h-2zm2-4h2v4h-2zM4 6h18v2H4zm0-4h2v4H4zm2 17h3v3H6zm11 0h3v3h-3z"/></svg>',
};

export function GeekIcon({
  color = colors.text,
  name,
  size = 24,
}: {
  readonly color?: string;
  readonly name: GeekIconName;
  readonly size?: number;
}) {
  return <SvgXml accessible={false} color={color} height={size} width={size} xml={GLYPHS[name]} />;
}
