import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { useAuth } from "../lib/auth/auth-provider";
import { resolveNavigationBranch } from "./auth-branch";
import { CollectionScreen, MyCollectionScreen } from "./collection-screen";
import { OwnedCopyDetailScreen } from "./owned-copy-detail-screen";
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
  ProfileScreen,
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
  const { state, passwordRecoveryRequested } = useAuth();
  const branch = resolveNavigationBranch(state, passwordRecoveryRequested);

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
          <RootStack.Group>
            <RootStack.Screen
              name="MainTabs"
              component={MainTabNavigator}
              options={{ headerShown: false }}
            />
            <RootStack.Screen name="Collection" component={CollectionScreen} />
            <RootStack.Screen name="Game" component={GameScreen} />
            <RootStack.Screen name="Edition" component={EditionScreen} />
            <RootStack.Screen
              name="Copy"
              component={OwnedCopyDetailScreen}
              options={{
                animation: "slide_from_bottom",
                gestureEnabled: true,
                headerShown: false,
                presentation: "fullScreenModal",
              }}
            />
            <RootStack.Screen name="Listing" component={ListingScreen} />
            <RootStack.Screen name="Auction" component={AuctionScreen} />
            <RootStack.Screen name="Collector" component={CollectorScreen} />
          </RootStack.Group>
        ) : null}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}

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
      <MainTabs.Screen name="Profile" component={ProfileScreen} />
    </MainTabs.Navigator>
  );
}
