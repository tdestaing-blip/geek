import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Button, Text, View } from "react-native";

import { useAuth } from "../lib/auth/auth-provider";
import type { RootStackParamList } from "./types";

const FIXTURE_EDITION_ID = "00000000-0000-0000-0000-000000000002";
const FIXTURE_COPY_ID = "00000000-0000-0000-0000-000000000003";

type GameScreenProps = NativeStackScreenProps<RootStackParamList, "Game">;
type EditionScreenProps = NativeStackScreenProps<RootStackParamList, "Edition">;
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

export function CommunityScreen() {
  return (
    <View>
      <Text>Community</Text>
    </View>
  );
}

export function ActivityScreen() {
  return (
    <View>
      <Text>Activity</Text>
    </View>
  );
}

export function ProfileScreen() {
  return (
    <View>
      <Text>Profile</Text>
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
