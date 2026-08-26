import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { useAuth } from "../lib/auth/auth-provider";
import { resolveNavigationBranch } from "./auth-branch";
import { CollectionScreen, MyCollectionScreen } from "./collection-screen";
import { AlbumDetailScreen } from "./album-detail-screen";
import { AddCopyScreen } from "./add-copy-screen";
import { AlbumRevealScreen } from "./album-reveal-screen";
import { OwnedCopyDetailScreen } from "./owned-copy-detail-screen";
import { MarketplaceScreen } from "./marketplace-screen";
import { MarketplaceOffersScreen } from "./marketplace-offers-screen";
import { PublicCopyDetailScreen } from "./public-copy-detail-screen";
import { MyProfileScreen, PublicProfileScreen } from "./profile-screen";
import { AddGameSearchScreen } from "./add-game-search-screen";
import { PlatformCatalogScreen } from "./platform-catalog-screen";
import { GameRegionsScreen } from "./game-regions-screen";
import {
  AuthEntryScreen,
  AuthErrorScreen,
  AuctionScreen,
  BootstrapScreen,
  CollectorScreen,
  EditionScreen,
  GameScreen,
  ActivityScreen,
  CommunityScreen,
  ListingScreen,
  PasswordUpdateScreen,
  ProfileMissingScreen,
} from "./screens";
import { GeekTabBar } from "../ui/geek-tab-bar";
import type { MainTabParamList, RootStackParamList } from "./types";

const RootStack = createNativeStackNavigator<RootStackParamList>();
const MainTabs = createBottomTabNavigator<MainTabParamList>();

/**
 * The application's one navigation container.
 *
 * It deliberately has no `linking` configuration. The existing Expo Linking
 * listener remains the sole owner of Auth callback URLs.
 */
export function NavigationRoot() {
  const { state, passwordRecoveryRequested, callbackResolutionPending } = useAuth();
  const branch = callbackResolutionPending
    ? "bootstrap"
    : resolveNavigationBranch(state, passwordRecoveryRequested);

  return (
    <NavigationContainer>
      <RootStack.Navigator>
        {branch === "bootstrap" ? (
          <RootStack.Screen name="Bootstrap" component={BootstrapScreen} />
        ) : null}

        {branch === "auth_entry" ? (
          <RootStack.Screen name="AuthEntry" component={AuthEntryScreen} />
        ) : null}

        {branch === "profile_missing" ? (
          <RootStack.Screen name="ProfileMissing" component={ProfileMissingScreen} />
        ) : null}

        {branch === "auth_error" ? (
          <RootStack.Screen name="AuthError" component={AuthErrorScreen} />
        ) : null}

        {branch === "password_update" ? (
          <RootStack.Screen name="PasswordUpdate" component={PasswordUpdateScreen} />
        ) : null}

        {branch === "application" ? (
          <>
            <RootStack.Group>
              <RootStack.Screen
                name="MainTabs"
                component={MainTabNavigator}
                options={{ headerShown: false }}
              />
              <RootStack.Screen name="Collection" component={CollectionScreen} />
              <RootStack.Screen
                name="AlbumDetail"
                component={AlbumDetailScreen}
                options={{ animation: "slide_from_right", headerShown: false }}
              />
              <RootStack.Screen name="Game" component={GameScreen} options={detailPushOptions} />
              <RootStack.Screen
                name="Market"
                component={MarketplaceScreen}
                options={detailPushOptions}
              />
              <RootStack.Screen
                name="MarketOffers"
                component={MarketplaceOffersScreen}
                options={detailPushOptions}
              />
              <RootStack.Screen name="Edition" component={EditionScreen} />
              <RootStack.Screen
                name="Copy"
                component={OwnedCopyDetailScreen}
                options={detailPushOptions}
              />
              <RootStack.Screen name="Listing" component={ListingScreen} />
              <RootStack.Screen name="Auction" component={AuctionScreen} />
              <RootStack.Screen name="Collector" component={CollectorScreen} />
              <RootStack.Screen
                name="AddGameSearch"
                component={AddGameSearchScreen}
                options={addGameRootOptions}
              />
              <RootStack.Screen
                name="PlatformCatalog"
                component={PlatformCatalogScreen}
                options={detailPushOptions}
              />
              <RootStack.Screen
                name="GameRegions"
                component={GameRegionsScreen}
                options={detailPushOptions}
              />
            </RootStack.Group>
            <RootStack.Group screenOptions={detailModalOptions}>
              <RootStack.Screen name="PublicCopy" component={PublicCopyDetailScreen} />
              <RootStack.Screen name="PublicProfile" component={PublicProfileScreen} />
              <RootStack.Screen name="AlbumReveal" component={AlbumRevealScreen} />
            </RootStack.Group>
            <RootStack.Screen
              name="AddCopy"
              component={AddCopyScreen}
              options={addCopySheetOptions}
            />
          </>
        ) : null}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}

const detailModalOptions = {
  animation: "slide_from_bottom" as const,
  gestureEnabled: true,
  headerShown: false,
  presentation: "fullScreenModal" as const,
};

const detailPushOptions = {
  animation: "slide_from_right" as const,
  headerShown: false,
};

const addCopySheetOptions = {
  gestureEnabled: true,
  headerShown: false,
  presentation: "formSheet" as const,
  sheetAllowedDetents: [1] as number[],
  sheetInitialDetentIndex: 0,
};

const addGameRootOptions = {
  animation: "slide_from_bottom" as const,
  headerShown: false,
  presentation: "card" as const,
};

function MainTabNavigator() {
  return (
    <MainTabs.Navigator
      initialRouteName="Collection"
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <GeekTabBar {...props} />}
    >
      <MainTabs.Screen name="Collection" component={MyCollectionScreen} />
      <MainTabs.Screen name="Community" component={CommunityScreen} />
      <MainTabs.Screen name="Activity" component={ActivityScreen} />
      <MainTabs.Screen name="Profile" component={MyProfileScreen} />
    </MainTabs.Navigator>
  );
}
