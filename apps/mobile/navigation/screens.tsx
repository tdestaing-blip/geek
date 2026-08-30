import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { getGame, getGamePresentationCover, getPrimaryGameArtwork } from "@geek/data";
import { colors, radii, spacing, typography } from "@geek/design-tokens";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Button,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { signInWithPassword } from "../lib/auth/actions";
import { useAuth } from "../lib/auth/auth-provider";
import { catalogMediaReadOptions } from "../lib/catalog-media-policy";
import { supabase } from "../lib/supabase";
import { AboutGameCard } from "../ui/about-game-card";
import { DetailToolbar } from "../ui/detail-toolbar";
import { GeekIcon } from "../ui/geek-icon";
import { findActiveWishlistIntent, toggleWishlistIntent } from "./collection-surfaces-data";
import type { RootStackParamList } from "./types";

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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  async function submit() {
    const normalizedEmail = email.trim();
    if (pending || normalizedEmail.length === 0 || password.length === 0) return;

    setPending(true);
    setErrorMessage(null);
    try {
      const result = await signInWithPassword({ email: normalizedEmail, password });
      if (!mounted.current) return;
      if (result.error !== null || result.data.session === null) {
        setErrorMessage("Email ou mot de passe incorrect.");
      }
    } catch {
      if (mounted.current) {
        setErrorMessage("Connexion impossible. Vérifiez votre connexion et réessayez.");
      }
    } finally {
      if (mounted.current) setPending(false);
    }
  }

  const disabled = pending || email.trim().length === 0 || password.length === 0;
  return (
    <SafeAreaView style={authEntryStyles.page}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={authEntryStyles.keyboard}
      >
        <View style={authEntryStyles.content}>
          <Text style={authEntryStyles.title}>Connexion</Text>
          <View style={authEntryStyles.fieldGroup}>
            <Text style={authEntryStyles.label}>Email</Text>
            <TextInput
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              editable={!pending}
              keyboardType="email-address"
              onChangeText={setEmail}
              placeholder="email@exemple.com"
              placeholderTextColor={colors.textSecondary}
              returnKeyType="next"
              style={authEntryStyles.input}
              textContentType="emailAddress"
              value={email}
            />
          </View>
          <View style={authEntryStyles.fieldGroup}>
            <Text style={authEntryStyles.label}>Mot de passe</Text>
            <TextInput
              autoCapitalize="none"
              autoComplete="current-password"
              editable={!pending}
              onChangeText={setPassword}
              onSubmitEditing={() => void submit()}
              placeholder="Mot de passe"
              placeholderTextColor={colors.textSecondary}
              returnKeyType="done"
              secureTextEntry
              style={authEntryStyles.input}
              textContentType="password"
              value={password}
            />
          </View>
          {errorMessage ? (
            <Text accessibilityRole="alert" style={authEntryStyles.error}>
              {errorMessage}
            </Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            disabled={disabled}
            onPress={() => void submit()}
            style={({ pressed }) => [
              authEntryStyles.button,
              disabled && authEntryStyles.buttonDisabled,
              pressed && !disabled && authEntryStyles.buttonPressed,
            ]}
          >
            {pending ? (
              <ActivityIndicator color={colors.controlSelected} />
            ) : (
              <Text style={authEntryStyles.buttonLabel}>Se connecter</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const authEntryStyles = StyleSheet.create({
  page: { backgroundColor: colors.background, flex: 1 },
  keyboard: { flex: 1, justifyContent: "center" },
  content: { gap: spacing.page, padding: spacing.page },
  title: { ...typography.screenTitle, color: colors.text },
  fieldGroup: { gap: spacing.compact },
  label: { ...typography.body, color: colors.text, fontWeight: "600" },
  input: {
    ...typography.body,
    backgroundColor: colors.control,
    borderRadius: radii.detailCard,
    color: colors.text,
    minHeight: 48,
    paddingHorizontal: spacing.page,
    paddingVertical: spacing.medium,
  },
  error: { ...typography.metadata, color: colors.accent },
  button: {
    alignItems: "center",
    backgroundColor: colors.text,
    borderRadius: radii.capsule,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: spacing.page,
  },
  buttonDisabled: { backgroundColor: colors.disabledAction },
  buttonPressed: { opacity: 0.72 },
  buttonLabel: { ...typography.body, color: colors.controlSelected, fontWeight: "600" },
});

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

export function GameScreen(props: GameScreenProps) {
  return (
    <SafeAreaProvider>
      <GameDetailContent {...props} />
    </SafeAreaProvider>
  );
}

function GameDetailContent({ navigation, route }: GameScreenProps) {
  const insets = useSafeAreaInsets();
  const [game, setGame] = useState<
    | { readonly status: "loading" }
    | {
        readonly status: "ready";
        readonly title: string;
        readonly description: string | null;
        readonly coverUrl: string | null;
        readonly aboutUrl: string | null;
      }
    | { readonly status: "error" }
  >({ status: "loading" });
  const [intentId, setIntentId] = useState<string | null | undefined>(undefined);
  const [wishlistBusy, setWishlistBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void Promise.all([
        getGame(supabase, route.params.gameId),
        getGamePresentationCover(supabase, route.params.gameId, catalogMediaReadOptions),
        getPrimaryGameArtwork(supabase, route.params.gameId, catalogMediaReadOptions),
        findActiveWishlistIntent(route.params.gameId),
      ]).then(
        ([gameResult, cover, artwork, wishlistId]) => {
          if (!active) return;
          const coverMedia = cover.outcome === "ok" ? cover.data?.media : null;
          setGame(
            gameResult.outcome === "ok"
              ? {
                  status: "ready",
                  title: gameResult.data.canonicalTitle,
                  description: gameResult.data.description,
                  coverUrl: coverMedia?.assetUrl ?? null,
                  aboutUrl:
                    artwork.outcome === "ok"
                      ? (artwork.data?.assetUrl ?? coverMedia?.assetUrl ?? null)
                      : (coverMedia?.assetUrl ?? null),
                }
              : { status: "error" },
          );
          setIntentId(wishlistId);
        },
        () => {
          if (active) setGame({ status: "error" });
        },
      );
      return () => {
        active = false;
      };
    }, [route.params.gameId]),
  );

  return (
    <View style={[gameStyles.page, { paddingTop: insets.top }]}>
      <DetailToolbar
        leadingIcon="chevron-left"
        title={game.status === "ready" ? game.title : "Jeu"}
        onClose={navigation.goBack}
        onMore={() => undefined}
      />
      {game.status === "loading" ? (
        <View style={gameStyles.centered}>
          <ActivityIndicator color={colors.text} />
        </View>
      ) : game.status === "error" ? (
        <View style={gameStyles.centered}>
          <Text>Ce jeu est introuvable.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={gameStyles.content}>
          <View style={gameStyles.hero}>
            {game.coverUrl ? (
              <Image resizeMode="contain" source={{ uri: game.coverUrl }} style={gameStyles.fill} />
            ) : (
              <GeekIcon color={colors.textSecondary} name="gamepad" size={56} />
            )}
          </View>
          <Text style={gameStyles.title}>{game.title}</Text>
          <Button
            disabled={intentId === undefined || wishlistBusy}
            title={intentId ? "Retirer de la Wishlist" : "Ajouter à la Wishlist"}
            onPress={() => {
              const previous = intentId;
              setWishlistBusy(true);
              setIntentId(previous ? null : "pending");
              void toggleWishlistIntent({
                gameId: route.params.gameId,
                ...(previous ? { intentId: previous } : {}),
              })
                .then(() => findActiveWishlistIntent(route.params.gameId))
                .then(setIntentId)
                .catch(() => setIntentId(previous))
                .finally(() => setWishlistBusy(false));
            }}
          />
          {game.aboutUrl || game.description ? (
            <AboutGameCard
              description={game.description}
              image={game.aboutUrl ? { uri: game.aboutUrl } : null}
              title={game.title}
            />
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const gameStyles = StyleSheet.create({
  page: { backgroundColor: colors.background, flex: 1 },
  content: { gap: spacing.page, paddingBottom: 40 },
  centered: { alignItems: "center", flex: 1, justifyContent: "center" },
  hero: {
    alignItems: "center",
    aspectRatio: 1.45,
    backgroundColor: colors.surfaceSubtle,
    justifyContent: "center",
    marginHorizontal: spacing.page,
    overflow: "hidden",
  },
  fill: { height: "100%", width: "100%" },
  title: { ...typography.screenTitle, color: colors.text, paddingHorizontal: spacing.page },
});

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
