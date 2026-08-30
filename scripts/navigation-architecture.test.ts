import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  INITIAL_ROOT_DESTINATION,
  ROOT_DESTINATIONS,
} from "../apps/mobile/navigation/navigation-architecture.ts";

const navigationRoot = source("apps/mobile/navigation/navigation-root.tsx");
const navigationTypes = source("apps/mobile/navigation/types.ts");
const tabBar = source("apps/mobile/ui/geek-tab-bar.tsx");
const collection = source("apps/mobile/navigation/collection-screen.tsx");
const addGameSearch = source("apps/mobile/navigation/add-game-search-screen.tsx");
const platformCatalog = source("apps/mobile/navigation/platform-catalog-screen.tsx");
const gameRegions = source("apps/mobile/navigation/game-regions-screen.tsx");
const profile = source("apps/mobile/navigation/profile-screen.tsx");
const discover = source("apps/mobile/navigation/root-world-screens.tsx");
const searchField = source("apps/mobile/ui/add-game-search-field.tsx");
const app = source("apps/mobile/App.tsx");

test("authenticated shell owns exactly four ordered roots with Collection initial", () => {
  assert.equal(INITIAL_ROOT_DESTINATION, "Collection");
  assert.deepEqual(
    ROOT_DESTINATIONS.map(({ route }) => route),
    ["Collection", "Discover", "Activity", "Me"],
  );
  assert.deepEqual(
    ROOT_DESTINATIONS.map(({ label }) => label),
    ["Collection", "Découvrir", "Activité", "Moi"],
  );
  const tabScreens = [...navigationRoot.matchAll(/<MainTabs\.Screen name="([^"]+)"/g)].map(
    (match) => match[1],
  );
  assert.deepEqual(tabScreens, ["Collection", "Discover", "Activity", "Me"]);
  assert.doesNotMatch(navigationTypes, /\n\s+(Community|Network|MarketRoot|Profile): undefined;/);
});

test("Discover is one unified, search-led canonical discovery surface", () => {
  assert.doesNotMatch(
    discover,
    /label: "Pour toi"|label: "Jeux"|label: "Échanges"|label: "Marché"/,
  );
  assert.match(discover, /<AddGameSearchField[\s\S]*?prominent/);
  assert.match(discover, /placeholder="Rechercher un jeu"/);
  assert.match(
    discover,
    /accessibilityLabel="Rechercher un jeu"[\s\S]*?onPress=\{\(\) => setSearchActive\(true\)\}/,
  );
  assert.match(discover, /<CatalogSearchHome[\s\S]*?autoFocus[\s\S]*?cancelLabel="Annuler"/);
  assert.match(discover, /navigation\.addListener\("blur"[\s\S]*?setSearchActive\(false\)/);
  assert.match(searchField, /prominentField: \{ height: 44,/);
  assert.match(searchField, /prominentInput: \{ fontSize: 14, fontWeight: "500" \}/);
  assert.match(addGameSearch, /export function CatalogSearchHome/);
  assert.match(addGameSearch, /searchCanonicalGamePlatforms/);
  assert.match(addGameSearch, /loadCanonicalPlatforms/);
  assert.match(addGameSearch, /PLATFORM_PRESENTATIONS/);
  assert.match(discover, /loadCanonicalAlbums/);
  assert.match(discover, /getMyReciprocalTradeMatches/);
  assert.doesNotMatch(navigationTypes, /MarketRoot:/);
  assert.match(
    navigationTypes,
    /Market: \{ readonly gameId: string; readonly editionId: string \};/,
  );
});

test("the tab bar has no global creation action and Collection owns Add Game", () => {
  assert.doesNotMatch(tabBar, /rootNavigation|AddGameSearch|actionSurface|addButton/);
  assert.match(collection, /onAddGame=\{\(\) => rootNavigation\.navigate\("AddGameSearch"\)\}/);
  assert.doesNotMatch(collection, /navigate\("MyProfile"\)/);
});

test("Me is the current Profile root while public identity remains modal", () => {
  const myProfile = profile.slice(
    profile.indexOf("export function MyProfileScreen"),
    profile.indexOf("export function PublicProfileScreen"),
  );
  assert.match(navigationRoot, /<MainTabs\.Screen name="Me" component=\{MyProfileScreen\} \/>/);
  assert.match(profile, /type MyProps = BottomTabScreenProps<MainTabParamList, "Me">/);
  assert.doesNotMatch(myProfile, /backIcon=|onBack=/);
  assert.match(navigationRoot, /screenOptions=\{detailModalOptions\}[\s\S]*?name="PublicCopy"/);
  assert.match(navigationRoot, /screenOptions=\{detailModalOptions\}[\s\S]*?name="PublicProfile"/);
  assert.match(profile, /backIcon="chevron-down"/);
});

test("Activity owns permanent current and history presentation state", () => {
  assert.match(discover, /\{ id: "current", label: "En cours" \}/);
  assert.match(discover, /\{ id: "history", label: "Historique" \}/);
  assert.doesNotMatch(discover, /activity_events|fake transaction/i);
});

test("Add Game is bounded and canonical completion replaces the action route", () => {
  const rootStackContract = navigationTypes.slice(
    navigationTypes.indexOf("export type RootStackParamList"),
  );
  assert.match(navigationRoot, /component=\{AddGameFlowNavigator\}/);
  assert.match(
    navigationRoot,
    /name="DiscoverCatalog"[\s\S]*?component=\{AddGameFlowNavigator\}[\s\S]*?options=\{detailPushOptions\}/,
  );
  assert.match(navigationRoot, /AddGameStack\.Navigator initialRouteName="AddGameHome"/);
  assert.match(discover, /navigate\("DiscoverCatalog", \{[\s\S]*?screen: "PlatformCatalog"/);
  assert.match(discover, /navigate\("DiscoverCatalog", \{[\s\S]*?screen: "GameRegions"/);
  assert.match(discover, /setSearchActive\(false\)[\s\S]*?navigate\("DiscoverCatalog"/);
  assert.match(addGameSearch, /rootNavigation\.goBack\(\)/);
  assert.match(platformCatalog, /rootNavigation\.replace\("AlbumDetail"/);
  assert.match(gameRegions, /rootNavigation\.replace\("Market"/);
  assert.doesNotMatch(rootStackContract, /\n\s+PlatformCatalog:/);
  assert.doesNotMatch(rootStackContract, /\n\s+GameRegions:/);
});

test("existing object, action, auction-presence, and auth grammar remains", () => {
  assert.equal((app.match(/<NavigationContainer/g) ?? []).length, 0);
  assert.equal((navigationRoot.match(/<NavigationContainer/g) ?? []).length, 1);
  assert.match(navigationRoot, /rootState\.routes\[rootState\.index\]\?\.name === "MainTabs"/);
  assert.match(navigationRoot, /<AuctionPresenceOverlay \/>/);
  assert.match(navigationRoot, /name="AddCopy"[\s\S]*?options=\{addCopySheetOptions\}/);
  assert.match(navigationRoot, /name="CreateListing"[\s\S]*?options=\{createListingSheetOptions\}/);
  assert.match(navigationRoot, /name="CreateAuction"[\s\S]*?options=\{createAuctionSheetOptions\}/);
  assert.match(navigationRoot, /name="PlaceBid"[\s\S]*?options=\{placeBidSheetOptions\}/);
  assert.match(navigationRoot, /resolveNavigationBranch\(state, passwordRecoveryRequested\)/);
  assert.doesNotMatch(navigationRoot, /TEMPORARY PHONE REVIEW\s+BYPASS/);
});

function source(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}
