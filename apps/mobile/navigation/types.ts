import type { NavigatorScreenParams } from "@react-navigation/native";

/** The four product-level destinations in the authenticated app. */
export type MainTabParamList = {
  Collection: undefined;
  Community: undefined;
  Activity: undefined;
  Profile: undefined;
};

/**
 * Which Collection surface navigation is asking to show.
 *
 * Sharing a destination does not merge the future data boundaries: the
 * caller's private Collection and another collector's public Collection still
 * require separate data APIs. The discriminant prevents an arbitrary owner id
 * from being treated as permission to read a private Collection.
 */
export type CollectionRouteParams =
  { readonly scope: "mine" } | { readonly scope: "collector"; readonly collectorId: string };

/**
 * Routes controlled by the application root.
 *
 * Game, Edition and Copy remain separate routes with separate identity types;
 * there is deliberately no generic entity-detail route.
 */
export type RootStackParamList = {
  Bootstrap: undefined;
  AuthEntry: undefined;
  ProfileMissing: undefined;
  AuthError: undefined;
  PasswordUpdate: undefined;
  MainTabs: NavigatorScreenParams<MainTabParamList> | undefined;
  AddGameSearch: undefined;
  PlatformCatalog: { readonly platformId: string };
  GameRegions: { readonly gameId: string; readonly platformId: string };
  Collection: CollectionRouteParams;
  Game: { readonly gameId: string };
  Market: { readonly gameId: string; readonly editionId: string };
  MarketOffers: { readonly gameId: string; readonly editionId: string };
  AddCopy: { readonly gameId: string; readonly editionId: string };
  CreateListing: { readonly copyId: string };
  CreateAuction: { readonly copyId: string };
  PlaceBid: { readonly auctionId: string };
  AlbumReveal: {
    readonly albumId: string;
    readonly entryId: string;
    readonly copyId: string;
    readonly gameId: string;
    readonly editionId: string;
    readonly enrichmentWarning: boolean;
    readonly photoWarning: boolean;
  };
  Edition: { readonly editionId: string };
  Copy: { readonly copyId: string };
  PublicCopy: { readonly copyId: string };
  PublicProfile: { readonly userId: string };
  AlbumDetail: { readonly albumId: string };
  Listing: { readonly listingId: string };
  Auction: { readonly auctionId: string };
  Collector: { readonly collectorId: string };
};
