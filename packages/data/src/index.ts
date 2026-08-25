/**
 * Geek's application data layer.
 *
 * Everything a screen needs to read or write, expressed in domain terms. Above
 * this line there are Games, Editions and Copies; below it there are tables,
 * embedded selects, RPC names and snake_case columns, and none of that is
 * exported.
 *
 * The dependency direction is deliberate. `@geek/domain` knows nothing about
 * Supabase; this package knows about both and does the translating; the apps
 * know only this package. Every function takes a typed Supabase client as its
 * first argument rather than importing one, so the same code runs against the
 * mobile client, the browser client and the Next server client without knowing
 * which it has.
 */
export type {
  DataFailure,
  EntityResult,
  Failed,
  InvalidData,
  NotFound,
  Ok,
  OwnedEntityResult,
  OwnedResult,
  ReadResult,
  Unauthenticated,
} from "./result";
export { InvalidRowError } from "./result";

export type { Page, PageRequest } from "./pagination";

export { getAlbumDetail, getAlbums } from "./albums/albums";

export {
  getEdition,
  getEditionsForGame,
  getEditionsForPlatform,
  getGame,
  getPlatform,
  getPlatforms,
} from "./catalog/catalog";
export {
  getPrimaryEditionCover,
  getPrimaryEditionCovers,
  getPrimaryGameCover,
  getPrimaryGameCovers,
} from "./catalog/media";
export { searchCatalog } from "./catalog/search";

export type { CollectionEntry } from "./collection/collection";
export { getMyCollection } from "./collection/collection";

export type { MyCopyDetail } from "./collection/copy-detail";
export { getMyCopyDetail } from "./collection/copy-detail";

export type {
  AddCopyInput,
  CopyAvailabilityUpdate,
  CopyCreationAvailability,
} from "./collection/mutations";
export {
  addCopy,
  addQuickCopy,
  setCopyEdition,
  updateCopyAvailability,
} from "./collection/mutations";

export { getMyProfile } from "./profile/profile";

export {
  getListingMatchesForWishlist,
  getMyReciprocalTradeMatches,
  getWishlistMatches,
} from "./matching/matches";

export type { FollowCollector } from "./social/follows";
export {
  followCollector,
  getFollowCounts,
  getFollowers,
  getFollowing,
  isFollowingCollector,
  unfollowCollector,
} from "./social/follows";

export type {
  AddWishlistIntentInput,
  MyWishlistIntent,
  UpdateWishlistIntentPatch,
  UpdateWishlistIntentPrivatePreferences,
} from "./wishlist/intents";
export {
  addWishlistIntent,
  getMyWishlistIntents,
  removeWishlistIntent,
  updateWishlistIntent,
  updateWishlistIntentPrivatePreferences,
} from "./wishlist/intents";
