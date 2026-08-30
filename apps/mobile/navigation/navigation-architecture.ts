import type { GeekIconName } from "../ui/geek-icon";
import type { MainTabParamList } from "./types";

export type RootDestination = keyof MainTabParamList;

export type RootDestinationConfiguration = {
  readonly icon: GeekIconName;
  readonly label: string;
  readonly route: RootDestination;
};

/** Product-owned root order and labels. The tab bar consumes this exact contract. */
export const ROOT_DESTINATIONS: readonly RootDestinationConfiguration[] = [
  { route: "Collection", label: "Collection", icon: "collection" },
  { route: "Discover", label: "Découvrir", icon: "search" },
  { route: "Activity", label: "Activité", icon: "activity" },
  { route: "Me", label: "Moi", icon: "profile" },
];

export const INITIAL_ROOT_DESTINATION: RootDestination = "Collection";

export function getRootDestination(route: string): RootDestinationConfiguration | undefined {
  return ROOT_DESTINATIONS.find((destination) => destination.route === route);
}
