import { colors } from "@geek/design-tokens";
import { SvgXml } from "react-native-svg";

export type GeekIconName =
  | "activity"
  | "album"
  | "bell"
  | "bell-ring"
  | "box"
  | "collection"
  | "community"
  | "close"
  | "chevron-down"
  | "chevron-left"
  | "diamond-gem"
  | "folder-plus"
  | "fire"
  | "gamepad"
  | "image-2-plus"
  | "image-plus"
  | "plus"
  | "more-horizontal"
  | "map-pin"
  | "profile"
  | "settings"
  | "settings-2"
  | "star"
  | "chevrons-horizontal"
  | "checkbox"
  | "square"
  | "radio"
  | "search"
  | "shopping-cart"
  | "share"
  | "truck";

// Exact Pixelarticons vector data sourced from Iconify's Pixelarticons collection.
const GLYPHS: Readonly<Record<GeekIconName, string>> = {
  activity:
    '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M4 2h16v2H4zm0 18h16v2H4zM2 4h2v16H2zm18 0h2v16h-2zM7 11h2v6H7zm4-4h2v10h-2zm4 6h2v4h-2z"/></svg>',
  album:
    '<svg viewBox="0 0 24 24"><g fill="currentColor"><path d="M4 2h16v2H4zm0 18h16v2H4zM2 4h2v16H2zm18 0h2v16h-2zm-4 0h2v8h-2zm-4 0h2v8h-2z"/><path d="M14 3h2v7h-2z"/></g></svg>',
  bell: '<svg viewBox="0 0 24 24"><g fill="currentColor"><path d="M9 2h6v2H9zM7 4h2v2H7zm8 0h2v2h-2zM5 6h2v7H5zm12 0h2v7h-2zM3 13h2v4H3zm16 0h2v4h-2z"/><path d="M3 15h18v2H3zm5 3h2v2H8zm6 0h2v2h-2zm-4 2h4v2h-4z"/></g></svg>',
  "bell-ring":
    '<svg viewBox="0 0 18 18"><path fill="currentColor" d="M10.5 16.5h-3V15h3v1.5ZM7.5 15H6v-1.5h1.5V15Zm4.5 0h-1.5v-1.5H12V15ZM3.75 11.25h10.5v-1.5h1.5v3H2.25v-3h1.5v1.5Zm1.5-1.5h-1.5V4.5h1.5v5.25Zm9 0h-1.5V4.5h1.5v5.25ZM2.25 4.5H.75V3h1.5v1.5Zm4.5 0h-1.5V3h1.5v1.5Zm6 0h-1.5V3h1.5v1.5Zm4.5 0h-1.5V3h1.5v1.5ZM3.75 3h-1.5V1.5h1.5V3Zm7.5 0h-4.5V1.5h4.5V3Zm4.5 0h-1.5V1.5h1.5V3Z"/></svg>',
  box: '<svg viewBox="0 0 24 24"><g fill="currentColor"><path d="M14 4h4v2h-4zm-4-2h4v2h-4zM6 8h4v2H6zm0 10h4v2H6zm4-8h4v2h-4zm0 10h4v2h-4zm4-12h4v2h-4zm0 10h4v2h-4zM6 4h4v2H6zM2 6h4v2H2zm0 10h4v2H2zM18 6h4v2h-4zm0 10h4v2h-4z"/><path d="M2 6h2v12H2zm18 0h2v12h-2zm-8 6h2v8h-2z"/></g></svg>',
  collection:
    '<svg viewBox="0 0 24 24"><g fill="currentColor"><path d="M4 4h16v2H4zm0 14h16v2H4zM2 6h2v12H2zm18 0h2v12h-2zM8 9h2v6H8z"/><path d="M6 11h6v2H6zm8-2h2v2h-2zm2 4h2v2h-2z"/></g></svg>',
  community:
    '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M9 21H5v-2h4zm10 0h-4v-2h4zM5 19H3v-2h2zm12-2h-2v2h-2v-2h-2v2H9v-2H7v-2h10zm4 2h-2v-2h2zM3 17H1V7h2zm20 0h-2V7h2zm-12-4H8v-3h3zm5 0h-3v-3h3zM5 7H3V5h2zm10 0H9V5h6zm6 0h-2V5h2zM9 5H5V3h4zm10 0h-4V3h4z"/></svg>',
  close:
    '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M7 19H5v-2h2v2Zm12 0h-2v-2h2v2ZM9 15v2H7v-2h2Zm8 2h-2v-2h2v2Zm-6-2H9v-2h2v2Zm4 0h-2v-2h2v2Zm-2-2h-2v-2h2v2Zm-2-2H9V9h2v2Zm4 0h-2V9h2v2ZM9 9H7V7h2v2Zm8 0h-2V7h2v2ZM7 7H5V5h2v2Zm12 0h-2V5h2v2Z"/></svg>',
  "chevron-down":
    '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M13 16h-2v-2h2v2Zm-2-2H9v-2h2v2Zm4 0h-2v-2h2v2Zm-6-2H7v-2h2v2Zm8 0h-2v-2h2v2Zm-10-2H5V8h2v2Zm12 0h-2V8h2v2Z"/></svg>',
  "chevron-left":
    '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M8 13v-2h2v2zm2-2V9h2v2zm0 4v-2h2v2zm2-6V7h2v2zm0 8v-2h2v2zm2-10V5h2v2zm0 12v-2h2v2z"/></svg>',
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
  "settings-2":
    '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M8 14H7v6H5v-6H2v-2h6zm5 6h-2V10h2zm9-2h-3v2h-2v-2h-1v-2h6zm-3-4h-2V4h2zM7 10H5V4h2zm6-4h2v2H9V6h2V4h2z"/></svg>',
  "folder-plus":
    '<svg viewBox="0 0 18 18"><path fill="currentColor" d="M3 2h5v2H3v-2Zm0 12h8v2H3v-2Zm12-10h2v6h-2V4ZM1 4h2v10H1V4Zm7 0h7v2H8V4Zm9 10v2h-4v-2h4Zm-3-3h2v2h2v2h-2v2h-2v-2h-2v-2h2v-2Z"/></svg>',
  fire: '<svg viewBox="0 0 12 13.3333"><path fill="currentColor" d="M4 0h1.333v2.667H4V0ZM2.667 2.667H4V4H2.667V2.667ZM1.333 4h1.334v1.333H1.333V4Zm5.334 1.333H8v1.334H6.667V5.333ZM8 4h1.333v1.333H8V4Zm1.333 1.333h1.334v1.334H9.333V5.333Zm1.334 1.334H12v4h-1.333v-4ZM0 5.333h1.333v5.334H0V5.333Zm5.333-2.666h1.334v2.666H5.333V2.667Zm4 8h1.334V12H9.333v-1.333ZM2.667 12h6.666v1.333H2.667V12Zm-1.334-1.333h1.334V12H1.333v-1.333ZM4 9.333h4V12H4V9.333ZM5.333 8h1.334v2H5.333V8Z"/></svg>',
  gamepad:
    '<svg viewBox="0 0 24 24"><g fill="currentColor"><path d="M4 4h16v2H4zm0 14h16v2H4zM2 6h2v12H2zm18 0h2v12h-2zM8 9h2v6H8z"/><path d="M6 11h6v2H6zm8-2h2v2h-2zm2 4h2v2h-2z"/></g></svg>',
  "map-pin":
    '<svg viewBox="0 0 18 18"><path fill="currentColor" d="M5.25 1.5h7.5V3h-7.5V1.5ZM3.75 3h1.5v1.5h-1.5V3Zm10.5 0h-1.5v1.5h1.5V3Zm-9 9.75h1.5v1.5h-1.5v-1.5Zm1.5 1.5h1.5v1.5h-1.5v-1.5Zm4.5-1.5h1.5v1.5h-1.5v-1.5Zm-1.5 1.5h1.5v1.5h-1.5v-1.5Zm-1.5 1.5h1.5v1.5h-1.5v-1.5Zm-4.5-5.25h1.5v2.25h-1.5V10.5Zm9 0h1.5v2.25h-1.5V10.5Zm-10.5-6h1.5v6h-1.5v-6Zm13.5 0h-1.5v6h1.5v-6ZM7.5 4.5h3V6h-3V4.5ZM6 6h1.5v3H6V6Zm1.5 3h3v1.5h-3V9ZM10.5 6H12v3h-1.5V6Z"/></svg>',
  star: '<svg viewBox="0 0 18 18"><path fill="#FFCC00" d="M3.75 15H6v1.5H2.25V12h1.5v3Zm12 1.5H12V15h2.25v-3h1.5v4.5ZM7.5 15H6v-1.5h1.5V15Zm4.5 0h-1.5v-1.5H12V15Zm-1.5-1.5h-3V12h3v1.5ZM5.25 12h-1.5V9.75h1.5V12Zm9 0h-1.5V9.75h1.5V12ZM3.75 9.75h-1.5v-1.5h1.5v1.5Zm12 0h-1.5v-1.5h1.5v1.5Zm-9-3h-4.5v1.5H.75v-3h6v1.5Zm10.5 1.5h-1.5v-1.5h-4.5v-1.5h6v3Zm-9-3h-1.5v-3h1.5v3Zm3 0h-1.5v-3h1.5v3Zm-1.5-3h-1.5V.75h1.5v1.5Z"/></svg>',
  "chevrons-horizontal":
    '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M10 15v2H8v-2h2Zm6 2h-2v-2h2v2Zm-8-2H6v-2h2v2Zm10 0h-2v-2h2v2ZM6 13H4v-2h2v2Zm14 0h-2v-2h2v2ZM8 11H6V9h2v2Zm10 0h-2V9h2v2Zm-8-2H8V7h2v2Zm6 0h-2V7h2v2Z"/></svg>',
  checkbox:
    '<svg viewBox="0 0 16 16"><path fill="currentColor" d="M14.67 1.33V.67H1.33v.66H.67v13.34h.66v.66h13.34v-.66h.66V1.33h-.66ZM14 14H2V2h12v12Zm-1.33-8v.67H12v.66h-.67V8h-.66v.67H10v.66h-.67V10h-.66v.67H8v.66H6.67v-.66H6V10h-.67v-.67h-.66v-.66H4V8h-.67v-.67H4v-.66h.67V6h.66v.67H6v.66h.67V8H8v-.67h.67v-.66h.66V6H10v-.67h.67v-.66h.66v.66H12V6h.67Z"/></svg>',
  square:
    '<svg viewBox="0 0 16 16"><path fill="currentColor" d="M14.67 1.33V.67H1.33v.66H.67v13.34h.66v.66h13.34v-.66h.66V1.33h-.66ZM14 14H2V2h12v12Z"/></svg>',
  radio:
    '<svg viewBox="0 0 14 14"><path fill="currentColor" d="M6.42 5.25h1.16v1.17H6.42V5.25Zm0 2.33h1.16v1.17H6.42V7.58ZM5.25 6.42h1.17v1.16H5.25V6.42Zm2.33 0h1.17v1.16H7.58V6.42Zm3.5-1.17H9.92v3.5h1.16v-3.5Zm-8.16 0h1.16v3.5H2.92v-3.5Zm10.5-1.17h-1.17v5.84h1.17V4.08Zm-12.84 0h1.17v5.84H.58V4.08Zm9.34 0H8.75v1.17h1.17V4.08Zm-5.84 0h1.17v1.17H4.08V4.08Zm8.17-1.16h-1.17v1.16h1.17V2.92Zm-10.5 0h1.17v1.16H1.75V2.92Zm8.17 5.83H8.75v1.17h1.17V8.75Zm-5.84 0h1.17v1.17H4.08V8.75Zm8.17 1.17h-1.17v1.16h1.17V9.92Zm-10.5 0h1.17v1.16H1.75V9.92Z"/></svg>',
  search:
    '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M22 22h-2v-2h2v2Zm-2-2h-2v-2h2v2Zm-6-2H6v-2h8v2Zm4 0h-2v-2h2v2ZM6 16H4v-2h2v2Zm10 0h-2v-2h2v2ZM4 14H2V6h2v8Zm14 0h-2V6h2v8ZM6 6H4V4h2v2Zm10 0h-2V4h2v2Zm-2-2H6V2h8v2Z"/></svg>',
  "shopping-cart":
    '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M2 2h2v2H2zm2 6h2v4H4zm2 4h2v4H6zm2 4h10v2H8zm10-4h2v4h-2zm2-4h2v4h-2zM4 6h18v2H4zm0-4h2v4H4zm2 17h3v3H6zm11 0h3v3h-3z"/></svg>',
  share:
    '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M20 22H4v-2h16v2ZM4 20H2v-6h2v6Zm18 0h-2v-6h2v6ZM13 4h2v2h2v2h-4v10h-2V8H7V6h2V4h2V2h2v2ZM9 14H4v-2h5v2Zm11 0h-5v-2h5v2Z"/></svg>',
  truck:
    '<svg viewBox="0 0 24 16"><path fill="currentColor" d="M2 0h12v2H2V0ZM0 12h4v2H0v-2Zm10 0h4v2h-4v-2Zm12-4h2v6h-2V8ZM14 2h2v12h-2V2ZM0 2h2v10H0V2Zm20 4h2v2h-2V6Zm-6-2h6v2h-6V4ZM4 10h6v2H4v-2Zm10 0h6v2h-6v-2ZM4 12h2v2H4v-2Zm10 0h2v2h-2v-2ZM4 14h6v2H4v-2Zm10 0h6v2h-6v-2Zm4-2h4v2h-4v-2Z"/></svg>',
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
