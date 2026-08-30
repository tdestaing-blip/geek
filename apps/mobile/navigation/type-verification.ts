/**
 * Compile-time proof of the root route contracts.
 *
 * This module is never imported at runtime. `pnpm typecheck` verifies that the
 * valid calls compile and that every `@ts-expect-error` remains an error.
 */
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import type { AddGameStackParamList, RootStackParamList } from "./types";

declare const navigation: NativeStackNavigationProp<RootStackParamList>;
declare const addGameNavigation: NativeStackNavigationProp<AddGameStackParamList>;

navigation.navigate("Game", { gameId: "game-id" });
navigation.navigate("Edition", { editionId: "edition-id" });
navigation.navigate("Market", { gameId: "game-id", editionId: "edition-id" });
navigation.navigate("MarketOffers", { gameId: "game-id", editionId: "edition-id" });
navigation.navigate("AddCopy", { gameId: "game-id", editionId: "edition-id" });
navigation.navigate("CreateListing", { copyId: "copy-id" });
navigation.navigate("CreateAuction", { copyId: "copy-id" });
navigation.navigate("PlaceBid", { auctionId: "auction-id" });
navigation.navigate("AlbumReveal", {
  albumId: "album-id",
  entryId: "entry-id",
  copyId: "copy-id",
  gameId: "game-id",
  editionId: "edition-id",
  enrichmentWarning: false,
  photoWarning: false,
});
navigation.navigate("Copy", { copyId: "copy-id" });
navigation.navigate("PublicCopy", { copyId: "copy-id" });
navigation.navigate("PublicCopy", { copyId: "copy-id", auctionId: "auction-id" });
navigation.navigate("PublicProfile", { userId: "user-id" });
navigation.navigate("AlbumDetail", { albumId: "album-id" });
navigation.navigate("AddGameSearch");
navigation.navigate("DiscoverCatalog", {
  screen: "PlatformCatalog",
  params: { platformId: "platform-id" },
});
addGameNavigation.navigate("PlatformCatalog", { platformId: "platform-id" });
addGameNavigation.navigate("GameRegions", { gameId: "game-id", platformId: "platform-id" });
navigation.navigate("Listing", { listingId: "listing-id" });
navigation.navigate("Auction", { auctionId: "auction-id" });
navigation.navigate("Collector", { collectorId: "collector-id" });
navigation.navigate("Collection", { scope: "mine" });
navigation.navigate("Collection", { scope: "collector", collectorId: "collector-id" });

// @ts-expect-error Game identity is required.
navigation.navigate("Game");
// @ts-expect-error Edition identity is required.
navigation.navigate("Edition");
// @ts-expect-error Market identity requires both the Game and Edition.
navigation.navigate("Market", { gameId: "game-id" });
// @ts-expect-error All Offers identity requires both the Game and Edition.
navigation.navigate("MarketOffers", { editionId: "edition-id" });
// @ts-expect-error Add Copy must preserve exact Game and Edition identity.
navigation.navigate("AddCopy", { gameId: "game-id" });
// @ts-expect-error Create Listing requires exact Copy identity.
navigation.navigate("CreateListing");
// @ts-expect-error Create Auction requires exact Copy identity.
navigation.navigate("CreateAuction");
// @ts-expect-error Place Bid requires exact Auction identity.
navigation.navigate("PlaceBid");
// @ts-expect-error Album reveal must identify its exact canonical entry and new Copy.
navigation.navigate("AlbumReveal", { albumId: "album-id", entryId: "entry-id" });
// @ts-expect-error Copy identity is required.
navigation.navigate("Copy");
// @ts-expect-error Listing identity is required.
navigation.navigate("Listing");
// @ts-expect-error Public Copy identity is required.
navigation.navigate("PublicCopy");
// @ts-expect-error Public Profile identity is required.
navigation.navigate("PublicProfile");
// @ts-expect-error Album identity is required.
navigation.navigate("AlbumDetail");
// @ts-expect-error Auction identity is required.
navigation.navigate("Auction");
// @ts-expect-error Collector identity is required.
navigation.navigate("Collector");
// @ts-expect-error A collector-scoped Collection requires collectorId.
navigation.navigate("Collection", { scope: "collector" });
// @ts-expect-error My Collection cannot carry an arbitrary collectorId.
navigation.navigate("Collection", { scope: "mine", collectorId: "collector-id" });
// @ts-expect-error Collection has no arbitrary owner-id route shape.
navigation.navigate("Collection", { ownerId: "owner-id" });
