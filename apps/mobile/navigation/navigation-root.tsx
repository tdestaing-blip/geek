import { colors, navigation as navigationTokens, spacing } from "@geek/design-tokens";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNavigationContainerRef, NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "../lib/auth/auth-provider";
import {
  AuctionPresenceProvider,
  useAuctionPresence,
} from "../lib/auction/auction-presence-provider";
import { resolveNavigationBranch } from "./auth-branch";
import { CollectionScreen, MyCollectionScreen } from "./collection-screen";
import { AlbumDetailScreen } from "./album-detail-screen";
import { AddCopyScreen } from "./add-copy-screen";
import { CreateListingScreen } from "./create-listing-screen";
import { CreateAuctionScreen } from "./create-auction-screen";
import { PlaceBidScreen } from "./place-bid-screen";
import { AlbumRevealScreen } from "./album-reveal-screen";
import { OwnedCopyDetailScreen } from "./owned-copy-detail-screen";
import { MarketplaceScreen } from "./marketplace-screen";
import { MarketplaceOffersScreen } from "./marketplace-offers-screen";
import { PublicCopyDetailScreen } from "./public-copy-detail-screen";
import { MyProfileScreen, PublicProfileScreen } from "./profile-screen";
import { AddGameSearchScreen } from "./add-game-search-screen";
import { PlatformCatalogScreen } from "./platform-catalog-screen";
import { GameRegionsScreen } from "./game-regions-screen";
import { ActivityScreen, DiscoverScreen } from "./root-world-screens";
import { INITIAL_ROOT_DESTINATION } from "./navigation-architecture";
import {
  AuthEntryScreen,
  AuthErrorScreen,
  AuctionScreen,
  BootstrapScreen,
  CollectorScreen,
  EditionScreen,
  GameScreen,
  ListingScreen,
  PasswordUpdateScreen,
  ProfileMissingScreen,
} from "./screens";
import { GeekTabBar } from "../ui/geek-tab-bar";
import { AuctionPresence } from "../ui/auction-presence";
import type { AddGameStackParamList, MainTabParamList, RootStackParamList } from "./types";

const RootStack = createNativeStackNavigator<RootStackParamList>();
const MainTabs = createBottomTabNavigator<MainTabParamList>();
const AddGameStack = createNativeStackNavigator<AddGameStackParamList>();
const navigationRef = createNavigationContainerRef<RootStackParamList>();

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
  const [mainTabsActive, setMainTabsActive] = useState(false);

  const updateShellVisibility = () => {
    if (!navigationRef.isReady()) return;
    const rootState = navigationRef.getRootState();
    setMainTabsActive(rootState.routes[rootState.index]?.name === "MainTabs");
  };

  return (
    <AuctionPresenceProvider>
      <View style={styles.appShell}>
        <NavigationContainer
          onReady={updateShellVisibility}
          onStateChange={updateShellVisibility}
          ref={navigationRef}
        >
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
                  <RootStack.Screen
                    name="Game"
                    component={GameScreen}
                    options={detailPushOptions}
                  />
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
                    component={AddGameFlowNavigator}
                    options={addGameRootOptions}
                  />
                  <RootStack.Screen
                    name="DiscoverCatalog"
                    component={AddGameFlowNavigator}
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
                <RootStack.Screen
                  name="CreateListing"
                  component={CreateListingScreen}
                  options={createListingSheetOptions}
                />
                <RootStack.Screen
                  name="CreateAuction"
                  component={CreateAuctionScreen}
                  options={createAuctionSheetOptions}
                />
                <RootStack.Screen
                  name="PlaceBid"
                  component={PlaceBidScreen}
                  options={placeBidSheetOptions}
                />
              </>
            ) : null}
          </RootStack.Navigator>
        </NavigationContainer>
        {branch === "application" && mainTabsActive ? <AuctionPresenceOverlay /> : null}
      </View>
    </AuctionPresenceProvider>
  );
}

function AuctionPresenceOverlay() {
  const insets = useSafeAreaInsets();
  const { participations } = useAuctionPresence();
  if (participations.length === 0) return null;

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.auctionPresence,
        { bottom: navigationTokens.surfaceHeight + Math.max(insets.bottom, 25) + spacing.page },
      ]}
    >
      <AuctionPresence
        onOpenAuction={({ auctionId, copyId }) => {
          if (navigationRef.isReady()) {
            navigationRef.navigate("PublicCopy", { auctionId, copyId });
          }
        }}
      />
    </View>
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

const createListingSheetOptions = {
  gestureEnabled: true,
  headerShown: false,
  presentation: "formSheet" as const,
  sheetAllowedDetents: [0.58] as number[],
  sheetInitialDetentIndex: 0,
};

const createAuctionSheetOptions = {
  gestureEnabled: true,
  headerShown: false,
  presentation: "formSheet" as const,
  sheetAllowedDetents: [0.62] as number[],
  sheetInitialDetentIndex: 0,
};

const placeBidSheetOptions = {
  gestureEnabled: true,
  headerShown: false,
  presentation: "formSheet" as const,
  sheetAllowedDetents: [0.52] as number[],
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
      initialRouteName={INITIAL_ROOT_DESTINATION}
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <GeekTabBar {...props} />}
    >
      <MainTabs.Screen name="Collection" component={MyCollectionScreen} />
      <MainTabs.Screen name="Discover" component={DiscoverScreen} />
      <MainTabs.Screen name="Activity" component={ActivityScreen} />
      <MainTabs.Screen name="Me" component={MyProfileScreen} />
    </MainTabs.Navigator>
  );
}

function AddGameFlowNavigator() {
  return (
    <AddGameStack.Navigator initialRouteName="AddGameHome" screenOptions={{ headerShown: false }}>
      <AddGameStack.Screen name="AddGameHome" component={AddGameSearchScreen} />
      <AddGameStack.Screen
        name="PlatformCatalog"
        component={PlatformCatalogScreen}
        options={{ animation: "slide_from_right" }}
      />
      <AddGameStack.Screen
        name="GameRegions"
        component={GameRegionsScreen}
        options={{ animation: "slide_from_right" }}
      />
    </AddGameStack.Navigator>
  );
}

const styles = StyleSheet.create({
  appShell: { backgroundColor: colors.background, flex: 1 },
  auctionPresence: { position: "absolute", right: 20, zIndex: 10 },
});
