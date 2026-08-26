/**
 * Geek's domain model.
 *
 * These are the concepts the product is about, expressed independently of how
 * they happen to be stored. Nothing here imports Supabase, the generated schema
 * or any framework, so the model can outlive any of them.
 *
 * The parsers exported alongside the types exist because a database CHECK
 * constraint does not survive into TypeScript. They are the point where a
 * stored string becomes a domain value, and they refuse rather than guess.
 */
export type { CalendarDate, CurrencyCode, Money } from "./values";
export { createMoney, parseCalendarDate, parseCurrencyCode } from "./values";

export type { Edition, EditionIdentifier, Game, Platform } from "./catalog/catalog";

export type { CatalogMedia, CatalogMediaKind, CatalogMediaRightsStatus } from "./catalog/media";
export { parseCatalogMediaKind, parseCatalogMediaRightsStatus } from "./catalog/media";

export type {
  CatalogSearchResult,
  CatalogSearchResultKind,
  EditionSearchResult,
  GameSearchResult,
} from "./catalog/search";
export { parseCatalogSearchResultKind } from "./catalog/search";

export type { Copy, CopyAvailability, CopyVisibility } from "./ownership/copy";
export { parseCopyAvailability, parseCopyVisibility } from "./ownership/copy";

export type {
  ConditionGrade,
  CopyComponentAssessment,
  CopyComponentPresence,
  CopyComponentState,
  EditionComponent,
} from "./ownership/components";
export { parseConditionGrade, parseCopyComponentPresence } from "./ownership/components";

export type { CopyPrivateDetails } from "./ownership/private-details";
export type { CopyPhoto } from "./ownership/photo";

export type {
  WishlistCompletenessPreference,
  WishlistIntent,
  WishlistIntentConstraints,
  WishlistIntentPriority,
  WishlistIntentPrivatePreferences,
  WishlistIntentStatus,
  WishlistIntentVisibility,
} from "./wishlist/intent";
export {
  parseWishlistCompletenessPreference,
  parseWishlistIntentPriority,
  parseWishlistIntentStatus,
  parseWishlistIntentVisibility,
} from "./wishlist/intent";

export type { Profile } from "./profile/profile";

export type { Follow, FollowCounts } from "./social/follow";

export type {
  ListingMatch,
  MatchCopy,
  MatchDistanceBucket,
  MatchReason,
  MatchTargetKind,
  NearbyMatchSignal,
  ReciprocalTradeMatch,
  WishlistMatch,
} from "./matching/contracts";
export { parseMatchDistanceBucket, parseMatchTargetKind } from "./matching/contracts";

export type {
  Album,
  AlbumDetail,
  AlbumEditionTarget,
  AlbumEntry,
  AlbumEntryState,
  AlbumEntryTarget,
  AlbumGameTarget,
  AlbumNetworkSignal,
  AlbumProgress,
  AlbumSummary,
  AlbumTargetKind,
} from "./albums/album";
export { parseAlbumTargetKind } from "./albums/album";
