import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { useAuth } from "../lib/auth/auth-provider";
import { resolveNavigationBranch } from "./auth-branch";
import {
  AuthEntryScreen,
  AuthErrorScreen,
  AuctionScreen,
  BootstrapScreen,
  CollectionScreen,
  CollectorScreen,
  CopyScreen,
  EditionScreen,
  GameScreen,
  HomeScreen,
  InboxScreen,
  ListingScreen,
  PasswordUpdateScreen,
  ProfileMissingScreen,
  ProfileScreen,
  SearchScreen,
} from "./screens";
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
            <RootStack.Screen name="Copy" component={CopyScreen} />
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
    <MainTabs.Navigator initialRouteName="Home">
      <MainTabs.Screen name="Home" component={HomeScreen} />
      <MainTabs.Screen name="Search" component={SearchScreen} />
      <MainTabs.Screen name="Inbox" component={InboxScreen} />
      <MainTabs.Screen name="Profile" component={ProfileScreen} />
    </MainTabs.Navigator>
  );
}
