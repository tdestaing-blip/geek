import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthProvider } from "./lib/auth/auth-provider";
import { useAuthDeepLinks } from "./lib/auth/use-auth-deep-links";
import { NavigationRoot } from "./navigation/navigation-root";

/** Completes Auth callback links without making navigation own those URLs. */
function AuthCallbackListener() {
  useAuthDeepLinks();

  return null;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AuthCallbackListener />
        <NavigationRoot />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
