/**
 * Compile-time proof of the root route contracts.
 *
 * This module is never imported at runtime. `pnpm typecheck` verifies that the
 * valid calls compile and that every `@ts-expect-error` remains an error.
 */
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import type { RootStackParamList } from "./types";

declare const navigation: NativeStackNavigationProp<RootStackParamList>;

navigation.navigate("Game", { gameId: "game-id" });
navigation.navigate("Edition", { editionId: "edition-id" });
navigation.navigate("Copy", { copyId: "copy-id" });
navigation.navigate("Listing", { listingId: "listing-id" });
navigation.navigate("Auction", { auctionId: "auction-id" });
navigation.navigate("Collector", { collectorId: "collector-id" });
navigation.navigate("Collection", { scope: "mine" });
navigation.navigate("Collection", { scope: "collector", collectorId: "collector-id" });

// @ts-expect-error Game identity is required.
navigation.navigate("Game");
// @ts-expect-error Edition identity is required.
navigation.navigate("Edition");
// @ts-expect-error Copy identity is required.
navigation.navigate("Copy");
// @ts-expect-error Listing identity is required.
navigation.navigate("Listing");
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
