import { AuthProvider } from "./lib/auth/auth-provider";
import { useAuthDeepLinks } from "./lib/auth/use-auth-deep-links";

/**
 * Auth plumbing only.
 *
 * The app is intentionally still visually empty; the shell and screens arrive
 * with navigation and the real Auth UI.
 */
function AuthCallbackListener() {
  useAuthDeepLinks();

  return null;
}

export default function App() {
  return (
    <AuthProvider>
      <AuthCallbackListener />
    </AuthProvider>
  );
}
