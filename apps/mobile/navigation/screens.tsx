import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Button, Text, View } from "react-native";

import { useAuth } from "../lib/auth/auth-provider";
import type { MainTabParamList, RootStackParamList } from "./types";

const FIXTURE_GAME_ID = "00000000-0000-0000-0000-000000000001";
const FIXTURE_EDITION_ID = "00000000-0000-0000-0000-000000000002";
const FIXTURE_COPY_ID = "00000000-0000-0000-0000-000000000003";
const FIXTURE_LISTING_ID = "00000000-0000-0000-0000-000000000004";
const FIXTURE_AUCTION_ID = "00000000-0000-0000-0000-000000000005";
const FIXTURE_COLLECTOR_ID = "00000000-0000-0000-0000-000000000006";

type HomeScreenProps = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, "Home">,
  NativeStackScreenProps<RootStackParamList>
>;

type ProfileScreenProps = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, "Profile">,
  NativeStackScreenProps<RootStackParamList>
>;

type CollectionScreenProps = NativeStackScreenProps<RootStackParamList, "Collection">;
type GameScreenProps = NativeStackScreenProps<RootStackParamList, "Game">;
type EditionScreenProps = NativeStackScreenProps<RootStackParamList, "Edition">;
type CopyScreenProps = NativeStackScreenProps<RootStackParamList, "Copy">;
type ListingScreenProps = NativeStackScreenProps<RootStackParamList, "Listing">;
type AuctionScreenProps = NativeStackScreenProps<RootStackParamList, "Auction">;
type CollectorScreenProps = NativeStackScreenProps<RootStackParamList, "Collector">;

export function BootstrapScreen() {
  return (
    <View>
      <Text>Bootstrap</Text>
    </View>
  );
}

export function AuthEntryScreen() {
  return (
    <View>
      <Text>Auth entry</Text>
    </View>
  );
}

export function ProfileMissingScreen() {
  const { reload } = useAuth();

  return (
    <View>
      <Text>Profile missing</Text>
      <Button title="Retry profile" onPress={reload} />
    </View>
  );
}

export function AuthErrorScreen() {
  const { reload } = useAuth();

  return (
    <View>
      <Text>Authentication error</Text>
      <Button title="Retry authentication" onPress={reload} />
    </View>
  );
}

export function PasswordUpdateScreen() {
  return (
    <View>
      <Text>Password update</Text>
    </View>
  );
}

/** Development-only route harness. It performs no data request. */
export function HomeScreen({ navigation }: HomeScreenProps) {
  return (
    <View>
      <Text>Home</Text>
      <Button
        title="Open Game fixture"
        onPress={() => navigation.navigate("Game", { gameId: FIXTURE_GAME_ID })}
      />
      <Button
        title="Open Listing fixture"
        onPress={() => navigation.navigate("Listing", { listingId: FIXTURE_LISTING_ID })}
      />
      <Button
        title="Open Auction fixture"
        onPress={() => navigation.navigate("Auction", { auctionId: FIXTURE_AUCTION_ID })}
      />
      <Button
        title="Open Collector fixture"
        onPress={() => navigation.navigate("Collector", { collectorId: FIXTURE_COLLECTOR_ID })}
      />
    </View>
  );
}

export function SearchScreen() {
  return (
    <View>
      <Text>Search</Text>
    </View>
  );
}

export function InboxScreen() {
  return (
    <View>
      <Text>Inbox</Text>
    </View>
  );
}

export function ProfileScreen({ navigation }: ProfileScreenProps) {
  return (
    <View>
      <Text>Profile</Text>
      <Button
        title="Open My Collection"
        onPress={() => navigation.navigate("Collection", { scope: "mine" })}
      />
    </View>
  );
}

export function CollectionScreen({ route }: CollectionScreenProps) {
  return (
    <View>
      <Text>Collection</Text>
      <Text>
        {route.params.scope === "mine" ? "My Collection" : `Collector ${route.params.collectorId}`}
      </Text>
    </View>
  );
}

export function GameScreen({ navigation, route }: GameScreenProps) {
  return (
    <View>
      <Text>Game</Text>
      <Text>{route.params.gameId}</Text>
      <Button
        title="Open Edition fixture"
        onPress={() => navigation.navigate("Edition", { editionId: FIXTURE_EDITION_ID })}
      />
    </View>
  );
}

export function EditionScreen({ navigation, route }: EditionScreenProps) {
  return (
    <View>
      <Text>Edition</Text>
      <Text>{route.params.editionId}</Text>
      <Button
        title="Open Copy fixture"
        onPress={() => navigation.navigate("Copy", { copyId: FIXTURE_COPY_ID })}
      />
    </View>
  );
}

export function CopyScreen({ route }: CopyScreenProps) {
  return (
    <View>
      <Text>Copy</Text>
      <Text>{route.params.copyId}</Text>
    </View>
  );
}

export function ListingScreen({ route }: ListingScreenProps) {
  return (
    <View>
      <Text>Listing</Text>
      <Text>{route.params.listingId}</Text>
    </View>
  );
}

export function AuctionScreen({ route }: AuctionScreenProps) {
  return (
    <View>
      <Text>Auction</Text>
      <Text>{route.params.auctionId}</Text>
    </View>
  );
}

export function CollectorScreen({ navigation, route }: CollectorScreenProps) {
  return (
    <View>
      <Text>Collector</Text>
      <Text>{route.params.collectorId}</Text>
      <Button
        title="Open Collector Collection"
        onPress={() =>
          navigation.navigate("Collection", {
            scope: "collector",
            collectorId: route.params.collectorId,
          })
        }
      />
    </View>
  );
}
