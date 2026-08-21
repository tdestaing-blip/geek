import { SafeAreaProvider } from "react-native-safe-area-context";
import { Audiowide_400Regular } from "@expo-google-fonts/audiowide";
import { Cinzel_700Bold } from "@expo-google-fonts/cinzel/700Bold";
import { PressStart2P_400Regular } from "@expo-google-fonts/press-start-2p";
import { TitanOne_400Regular } from "@expo-google-fonts/titan-one";
import { useFonts } from "expo-font";

import { AuthProvider } from "./lib/auth/auth-provider";
import { NavigationRoot } from "./navigation/navigation-root";

export default function App() {
  const [fontsLoaded] = useFonts({
    Audiowide_400Regular,
    Cinzel_700Bold,
    PressStart2P_400Regular,
    TitanOne_400Regular,
  });

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NavigationRoot />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
