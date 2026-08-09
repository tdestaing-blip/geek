import AsyncStorage from "@react-native-async-storage/async-storage";
import type { GeekDatabase } from "@geek/supabase";
import { createClient } from "@supabase/supabase-js";
import { AppState } from "react-native";

import { supabaseEnvironment } from "./environment";

/**
 * The single Supabase client for the mobile app.
 *
 * Components must import this rather than calling `createClient` themselves;
 * multiple clients would each keep their own session and refresh timer.
 */
export const supabase = createClient<GeekDatabase>(
  supabaseEnvironment.url,
  supabaseEnvironment.anonKey,
  {
    auth: {
      storage: AsyncStorage,
      persistSession: true,
      autoRefreshToken: true,
      // Native apps never receive a session in a URL fragment the way a browser
      // does. OAuth and magic-link flows will hand tokens to the client
      // explicitly when Auth is implemented.
      detectSessionInUrl: false,
    },
  },
);

/**
 * Refresh tokens only while the app is in the foreground.
 *
 * Timers do not fire reliably in the background on either platform, so the
 * client is told when to run its refresh loop instead of silently drifting into
 * an expired session.
 */
AppState.addEventListener("change", (state) => {
  if (state === "active") {
    void supabase.auth.startAutoRefresh();
  } else {
    void supabase.auth.stopAutoRefresh();
  }
});
