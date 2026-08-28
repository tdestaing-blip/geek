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
  getEditionsByIds,
  getEditionIdentifiers,
  getEditionsForGame,
  getEditionsForPlatform,
  getGame,
  getGamesByIds,
  getPlatform,
  getPlatformsByIds,
  getPlatforms,
} from "./catalog/catalog";
export {
  getGamePresentationCover,
  getGamePresentationCovers,
  getPrimaryEditionCover,
  getPrimaryEditionCovers,
  getPrimaryGameArtwork,
  getPrimaryGameCover,
  getPrimaryGameCovers,
} from "./catalog/media";
export type { CatalogMediaReadOptions, GamePresentationMedia } from "./catalog/media";
export {
  catalogMediaRightsForUsageMode,
  isCatalogMediaDisplayable,
  parseCatalogMediaUsageMode,
} from "./catalog/media-policy";
export type { CatalogMediaUsageMode } from "./catalog/media-policy";
export { searchCatalog } from "./catalog/search";

export type { CollectionEntry } from "./collection/collection";
export { getMyCollection, getMyCopiesForEdition } from "./collection/collection";

export type { MyCopyDetail } from "./collection/copy-detail";
export { getMyCopyDetail } from "./collection/copy-detail";

export type {
  AddCopyPhotoInput,
  AddCopyPhotoResult,
  CopyPhotoRead,
  CopyPhotoRoleSummary,
  DeleteCopyPhotoResult,
} from "./collection/photos";
export {
  addCopyPhoto,
  COPY_PHOTO_LIMIT,
  deleteCopyPhoto,
  getCopyPhotoGallery,
  getCopyPhotos,
  getMyCopyPhotoRoles,
  getMyPrimaryCopyPhotos,
} from "./collection/photos";

export type { CopyComponentStateInput, CopyPrivateDetailsInput } from "./collection/enrichment";
export {
  getEditionComponents,
  updateCopyComponentStates,
  updateCopyPrivateDetails,
} from "./collection/enrichment";

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
  compareMarketOpportunities,
  getEditionMarketOpportunities,
  getPublicCopyDetail,
} from "./marketplace/opportunities";

export type {
  CancelListingResult,
  CreateListingInput,
  CreateListingResult,
} from "./marketplace/listings";
export {
  cancelListing,
  createListing,
  getMyActiveListingsForCopies,
  getMyCopyCommercialState,
} from "./marketplace/listings";

export type {
  CreateAuctionInput,
  CreateAuctionResult,
  PlaceAuctionBidInput,
  PlaceAuctionBidResult,
} from "./marketplace/auctions";
export {
  createAuction,
  getAuctionForBidding,
  getAuctionResult,
  placeAuctionBid,
} from "./marketplace/auctions";

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
