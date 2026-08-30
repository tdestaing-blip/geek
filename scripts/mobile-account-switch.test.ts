import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createAccountSwitchCoordinator } from "../apps/mobile/navigation/account-switch.ts";
import {
  INITIAL_ROOT_DESTINATION,
  ROOT_DESTINATIONS,
} from "../apps/mobile/navigation/navigation-architecture.ts";

const profile = source("apps/mobile/navigation/profile-screen.tsx");
const profilePrimitives = source("apps/mobile/ui/profile-primitives.tsx");
const authActions = source("apps/mobile/lib/auth/actions.ts");
const authProvider = source("apps/mobile/lib/auth/auth-provider.tsx");
const navigationRoot = source("apps/mobile/navigation/navigation-root.tsx");
const screens = source("apps/mobile/navigation/screens.tsx");

test("My Profile More opens the minimal account menu and cancel has no side effect", () => {
  assert.match(profilePrimitives, /label="Plus d’options" onPress=\{onMore\}/);
  assert.match(profile, /onMore=\{showAccountMenu\}/);
  assert.match(profile, /options: \["Changer de compte", "Annuler"\]/);
  assert.match(profile, /\{ text: "Annuler", style: "cancel" \}/);
  assert.doesNotMatch(profile, /Settings|Notifications|Payments|Shipping/);
});

test("confirmed switch uses canonical local signOut and never mutates Auth state", () => {
  assert.match(profile, /import \{ signOut \} from "\.\.\/lib\/auth\/actions"/);
  assert.match(profile, /signOut: async \(\) => \(await signOut\(\)\)\.error === null/);
  assert.match(profile, /Changer de compte \?/);
  assert.match(authActions, /return signOutForClient\(supabase\)/);
  assert.doesNotMatch(profile, /navigate\("AuthEntry"|setAuth|setSession|removeItem/);
  assert.match(authProvider, /onAuthStateChange/);
  assert.match(navigationRoot, /resolveNavigationBranch\(state, passwordRecoveryRequested\)/);
});

test("signed-out Auth entry is a real email/password login through the canonical boundary", () => {
  const authEntry = screens.slice(
    screens.indexOf("export function AuthEntryScreen"),
    screens.indexOf("export function ProfileMissingScreen"),
  );
  assert.match(authEntry, /Connexion/);
  assert.match(authEntry, /Email/);
  assert.match(authEntry, /Mot de passe/);
  assert.match(authEntry, /secureTextEntry/);
  assert.match(authEntry, /Se connecter/);
  assert.match(authEntry, /signInWithPassword\(\{ email: normalizedEmail, password \}\)/);
  assert.match(authEntry, /Email ou mot de passe incorrect/);
  assert.doesNotMatch(authEntry, /signUp|magic|hard-coded|tdestaing@gmail\.com|setSession/);
});

test("successful submission signs out once and concurrent confirmation is ignored", async () => {
  let calls = 0;
  let release: ((value: boolean) => void) | undefined;
  const coordinator = createAccountSwitchCoordinator({
    signOut: () => {
      calls += 1;
      return new Promise<boolean>((resolve) => {
        release = resolve;
      });
    },
  });

  const first = coordinator.submit();
  assert.deepEqual(await coordinator.submit(), { outcome: "ignored" });
  release?.(true);
  assert.deepEqual(await first, { outcome: "signed_out" });
  assert.equal(calls, 1);
});

test("failed signOut remains retryable without inventing Auth state", async () => {
  let calls = 0;
  const coordinator = createAccountSwitchCoordinator({
    signOut: async () => {
      calls += 1;
      if (calls === 1) throw new Error("provider failure");
      return true;
    },
  });

  assert.deepEqual(await coordinator.submit(), { outcome: "failed" });
  assert.deepEqual(await coordinator.submit(), { outcome: "signed_out" });
  assert.equal(calls, 2);
  assert.match(profile, /Vous êtes toujours connecté à ce compte/);
});

test("account switch leaves Activity and the four navigation roots unchanged", () => {
  assert.equal(INITIAL_ROOT_DESTINATION, "Collection");
  assert.deepEqual(
    ROOT_DESTINATIONS.map(({ route }) => route),
    ["Collection", "Discover", "Activity", "Me"],
  );
  assert.match(
    navigationRoot,
    /<MainTabs\.Screen name="Activity" component=\{ActivityScreen\} \/>/,
  );
  assert.doesNotMatch(navigationRoot, /TEMPORARY PHONE REVIEW\s+BYPASS/);
});

function source(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}
