import { createListing, getMyCopyCommercialState, getMyCopyDetail } from "@geek/data";
import { canCreateDirectListing, type OwnedCopyCommercialState } from "@geek/domain";
import { colors, radii, spacing, typography } from "@geek/design-tokens";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";

import { supabase } from "../lib/supabase";
import { AdaptiveGlassSurface } from "../ui/adaptive-glass-surface";
import { GeekIcon } from "../ui/geek-icon";
import { createListingSubmissionCoordinator, parseListingPriceInput } from "./create-listing-flow";
import type { RootStackParamList } from "./types";

type Props = NativeStackScreenProps<RootStackParamList, "CreateListing">;
type LoadState =
  | { readonly status: "loading" }
  | { readonly status: "error" }
  | {
      readonly status: "ready";
      readonly title: string;
      readonly availability: "private" | "open_to_trade" | "for_sale" | "in_auction";
      readonly commercialState: OwnedCopyCommercialState;
    };

export function CreateListingScreen(props: Props) {
  return (
    <SafeAreaProvider>
      <CreateListingContent {...props} />
    </SafeAreaProvider>
  );
}

function CreateListingContent({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const mounted = useRef(true);
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [price, setPrice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const coordinator = useRef(
    createListingSubmissionCoordinator({
      create: async (askingPrice) => {
        const result = await createListing(supabase, {
          copyId: route.params.copyId,
          askingPrice,
        });
        return result.outcome === "ok";
      },
    }),
  );

  useEffect(() => {
    mounted.current = true;
    let active = true;
    void Promise.all([
      getMyCopyDetail(supabase, route.params.copyId),
      getMyCopyCommercialState(supabase, route.params.copyId),
    ]).then(
      ([detail, commercial]) => {
        if (!active) return;
        setLoadState(
          detail.outcome === "ok" && commercial.outcome === "ok"
            ? {
                status: "ready",
                title: detail.data.game.canonicalTitle,
                availability: detail.data.copy.availability,
                commercialState: commercial.data,
              }
            : { status: "error" },
        );
      },
      () => {
        if (active) setLoadState({ status: "error" });
      },
    );
    return () => {
      active = false;
      mounted.current = false;
    };
  }, [route.params.copyId]);

  const eligible = loadState.status === "ready" && isEligible(loadState);

  async function confirm() {
    if (!eligible || submitting) return;
    const parsed = parseListingPriceInput(price);
    if (!parsed.valid) {
      setMessage("Saisissez un prix supérieur à 0 €, avec au plus deux décimales.");
      return;
    }

    setMessage(null);
    setSubmitting(true);
    const result = await coordinator.current.submit(parsed.askingPrice);
    if (!mounted.current || result.outcome === "ignored") return;
    if (result.outcome === "committed") {
      navigation.goBack();
      return;
    }
    setSubmitting(false);
    setMessage("La mise en vente n’a pas pu être créée. Vérifiez l’état de la copie et réessayez.");
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={[styles.page, { paddingTop: insets.top + spacing.compact }]}
    >
      <SellerToolbar
        disabled={!eligible || submitting}
        onClose={navigation.goBack}
        onConfirm={() => void confirm()}
        pending={submitting}
      />
      {loadState.status === "loading" ? (
        <CenteredState label="Chargement de la copie…" />
      ) : loadState.status === "error" ? (
        <CenteredState label="Cette copie ne peut pas être mise en vente pour le moment." />
      ) : (
        <View style={styles.content}>
          <View style={styles.heading}>
            <Text style={styles.eyebrow}>Vente directe</Text>
            <Text numberOfLines={2} style={styles.title}>
              {loadState.title}
            </Text>
          </View>
          <View style={styles.optionCard}>
            <View style={styles.optionIcon}>
              <GeekIcon name="shopping-cart" />
            </View>
            <View style={styles.optionCopy}>
              <Text style={styles.optionTitle}>Vendre à prix fixe</Text>
              <Text style={styles.optionDescription}>
                Votre annonce sera visible sur le marché de cette édition.
              </Text>
            </View>
          </View>
          {eligible ? (
            <View style={styles.priceCard}>
              <Text style={styles.fieldLabel}>Prix demandé</Text>
              <View style={styles.priceRow}>
                <TextInput
                  accessibilityLabel="Prix demandé en euros"
                  autoFocus
                  keyboardType="decimal-pad"
                  onChangeText={(value) => {
                    setPrice(value);
                    setMessage(null);
                  }}
                  placeholder="35,00"
                  placeholderTextColor={colors.textSecondary}
                  style={styles.priceInput}
                  value={price}
                />
                <Text style={styles.currency}>€</Text>
              </View>
            </View>
          ) : (
            <Text style={styles.message}>{unavailableMessage(loadState)}</Text>
          )}
          {message ? <Text style={styles.message}>{message}</Text> : null}
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

function SellerToolbar({
  disabled,
  onClose,
  onConfirm,
  pending,
}: {
  readonly disabled: boolean;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
  readonly pending: boolean;
}) {
  return (
    <View style={styles.toolbar}>
      <Pressable accessibilityLabel="Fermer" onPress={onClose} style={styles.toolbarControl}>
        <AdaptiveGlassSurface style={styles.toolbarButton}>
          <GeekIcon name="chevron-down" />
        </AdaptiveGlassSurface>
      </Pressable>
      <Text numberOfLines={1} style={styles.toolbarTitle}>
        Mettre en vente
      </Text>
      <Pressable
        accessibilityLabel="Confirmer la mise en vente"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onConfirm}
        style={[styles.confirmButton, disabled && styles.disabled]}
      >
        {pending ? (
          <ActivityIndicator color={colors.controlSelected} />
        ) : (
          <GeekIcon color={colors.controlSelected} name="check" />
        )}
      </Pressable>
    </View>
  );
}

function CenteredState({ label }: { readonly label: string }) {
  return (
    <View style={styles.centered}>
      <ActivityIndicator color={colors.text} />
      <Text style={styles.message}>{label}</Text>
    </View>
  );
}

function isEligible(state: Extract<LoadState, { readonly status: "ready" }>): boolean {
  return canCreateDirectListing(state.availability, state.commercialState);
}

function unavailableMessage(state: Extract<LoadState, { readonly status: "ready" }>): string {
  if (state.commercialState.kind === "listing") return "Cette copie est déjà en vente.";
  if (state.commercialState.kind === "auction") return "Cette copie est actuellement aux enchères.";
  if (state.commercialState.kind === "accepted_trade") {
    return "Cette copie est réservée par un échange accepté.";
  }
  return "Cette copie n’est pas éligible à la vente directe.";
}

const styles = StyleSheet.create({
  page: { backgroundColor: colors.background, flex: 1 },
  toolbar: {
    alignItems: "center",
    flexDirection: "row",
    height: 60,
    justifyContent: "space-between",
    paddingHorizontal: spacing.page,
  },
  toolbarControl: { height: 44, width: 44 },
  toolbarButton: {
    alignItems: "center",
    borderRadius: 22,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  toolbarTitle: {
    ...typography.itemTitle,
    color: colors.text,
    flex: 1,
    fontSize: 17,
    marginHorizontal: spacing.compact,
    textAlign: "center",
  },
  confirmButton: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 22,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  disabled: { opacity: 0.45 },
  content: { gap: 24, padding: spacing.page },
  heading: { gap: spacing.micro },
  eyebrow: { color: colors.textSecondary, ...typography.metadata },
  title: { color: colors.text, ...typography.sectionTitle },
  optionCard: {
    alignItems: "center",
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radii.detailCard,
    flexDirection: "row",
    gap: 12,
    padding: spacing.page,
  },
  optionIcon: {
    alignItems: "center",
    backgroundColor: colors.controlSelected,
    borderRadius: radii.capsule,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  optionCopy: { flex: 1, gap: spacing.micro },
  optionTitle: { color: colors.text, ...typography.body },
  optionDescription: { color: colors.textSecondary, ...typography.metadata },
  priceCard: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radii.detailCard,
    gap: spacing.compact,
    padding: spacing.page,
  },
  fieldLabel: { color: colors.textSecondary, ...typography.metadata },
  priceRow: { alignItems: "center", flexDirection: "row" },
  priceInput: { color: colors.text, flex: 1, fontSize: 32, fontWeight: "600", padding: 0 },
  currency: { color: colors.text, fontSize: 32, fontWeight: "600" },
  message: { color: colors.textSecondary, ...typography.body },
  centered: { alignItems: "center", flex: 1, gap: spacing.compact, justifyContent: "center" },
});
