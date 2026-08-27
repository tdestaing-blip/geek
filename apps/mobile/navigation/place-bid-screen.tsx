import { getAuctionForBidding, placeAuctionBid } from "@geek/data";
import { getAuctionMinimumBid, type AuctionBidState } from "@geek/domain";
import { colors, radii, spacing, typography } from "@geek/design-tokens";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { randomUUID } from "expo-crypto";
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
import { formatMoney } from "../ui/format-money";
import { GeekIcon } from "../ui/geek-icon";
import {
  formatBidAmountInput,
  parseBidAmountInput,
  createPlaceBidSubmissionCoordinator,
} from "./place-bid-flow";
import type { RootStackParamList } from "./types";

type Props = NativeStackScreenProps<RootStackParamList, "PlaceBid">;
type LoadState =
  | { readonly status: "loading" }
  | { readonly status: "error" }
  | { readonly status: "ready"; readonly bid: AuctionBidState };

export function PlaceBidScreen(props: Props) {
  return (
    <SafeAreaProvider>
      <PlaceBidContent {...props} />
    </SafeAreaProvider>
  );
}

function PlaceBidContent({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const mounted = useRef(true);
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [amountInput, setAmountInput] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const coordinator = useRef(
    createPlaceBidSubmissionCoordinator({
      createId: randomUUID,
      place: (currentAttempt, amount) =>
        placeAuctionBid(supabase, {
          bidId: currentAttempt.bidId,
          auctionId: route.params.auctionId,
          amount,
        }),
    }),
  );

  useEffect(() => {
    mounted.current = true;
    let active = true;
    void getAuctionForBidding(supabase, route.params.auctionId).then(
      (result) => {
        if (!active) return;
        if (result.outcome !== "ok") {
          setLoadState({ status: "error" });
          return;
        }
        const minimumBid = getAuctionMinimumBid(result.data);
        const currentPrice = result.data.currentPrice ?? result.data.startingPrice;
        if (minimumBid === null) {
          setLoadState({ status: "error" });
          return;
        }
        const bid = {
          auctionId: result.data.id,
          currentPrice,
          bidCount: result.data.bidCount,
          minIncrement: result.data.minIncrement,
          minimumBid,
          endsAt: result.data.endsAt,
          status: result.data.status,
        } satisfies AuctionBidState;
        setLoadState({ status: "ready", bid });
        setAmountInput(formatBidAmountInput(minimumBid.amountMinor));
      },
      () => {
        if (active) setLoadState({ status: "error" });
      },
    );
    return () => {
      active = false;
      mounted.current = false;
    };
  }, [route.params.auctionId]);

  async function confirm() {
    if (loadState.status !== "ready") return;
    const parsed = parseBidAmountInput(amountInput);
    if (!parsed.valid || parsed.amount.amountMinor < loadState.bid.minimumBid.amountMinor) {
      setMessage(`La mise minimum est de ${formatMoney(loadState.bid.minimumBid)}.`);
      return;
    }

    setMessage(null);
    setSubmitting(true);
    const submission = await coordinator.current.submit(parsed.amount).catch(() => null);
    if (!mounted.current) return;
    if (submission?.outcome === "ignored") return;
    setSubmitting(false);

    if (submission === null) {
      setMessage("La mise n’a pas pu être enregistrée. Réessayez.");
      return;
    }
    const result = submission.result;

    if (result.outcome === "ok") {
      navigation.goBack();
      return;
    }
    if (result.outcome === "bid_too_low") {
      setLoadState({ status: "ready", bid: result.data });
      setAmountInput(formatBidAmountInput(result.data.minimumBid.amountMinor));
      setMessage(
        `L’enchère a évolué. Le nouveau minimum est de ${formatMoney(result.data.minimumBid)}.`,
      );
      return;
    }
    if (result.outcome === "auction_upcoming") {
      setMessage("Cette enchère n’a pas encore commencé.");
    } else if (result.outcome === "auction_ended") {
      setMessage("Cette enchère est terminée.");
    } else if (result.outcome === "seller_forbidden") {
      setMessage("Vous ne pouvez pas enchérir sur votre propre copie.");
    } else if (result.outcome === "auction_unavailable") {
      setMessage("Cette enchère n’est plus disponible.");
    } else {
      setMessage("La mise n’a pas pu être enregistrée. Réessayez.");
    }
  }

  const ready = loadState.status === "ready";
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={[styles.page, { paddingTop: insets.top + spacing.compact }]}
    >
      <BidToolbar
        disabled={!ready || submitting}
        onClose={navigation.goBack}
        onConfirm={() => void confirm()}
        pending={submitting}
      />
      {loadState.status === "loading" ? (
        <CenteredState label="Chargement de l’enchère…" />
      ) : loadState.status === "error" ? (
        <CenteredState label="Cette enchère ne peut pas être chargée pour le moment." />
      ) : (
        <View style={styles.content}>
          <View style={styles.summary}>
            <View>
              <Text style={styles.label}>Mise actuelle</Text>
              <Text style={styles.currentPrice}>{formatMoney(loadState.bid.currentPrice)}</Text>
            </View>
            <View style={styles.bidCount}>
              <GeekIcon name="radio" size={16} />
              <Text style={styles.bidCountText}>{loadState.bid.bidCount} enchères</Text>
            </View>
          </View>
          <View style={styles.amountCard}>
            <Text style={styles.label}>Votre mise</Text>
            <View style={styles.amountRow}>
              <TextInput
                accessibilityLabel="Votre mise en euros"
                autoFocus
                keyboardType="decimal-pad"
                onChangeText={(value) => {
                  setAmountInput(value);
                  setMessage(null);
                }}
                selectTextOnFocus
                style={styles.amountInput}
                value={amountInput}
              />
              <Text style={styles.currency}>€</Text>
            </View>
            <Text style={styles.minimum}>
              Minimum {formatMoney(loadState.bid.minimumBid)} · incrément de{" "}
              {formatMoney(loadState.bid.minIncrement)}
            </Text>
          </View>
          {message ? <Text style={styles.message}>{message}</Text> : null}
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

function BidToolbar({
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
        Placer une enchère
      </Text>
      <Pressable
        accessibilityLabel="Confirmer la mise"
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
  content: { gap: spacing.page, padding: spacing.page },
  summary: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  label: { color: colors.textSecondary, ...typography.metadata },
  currentPrice: { color: colors.text, fontSize: 24, fontWeight: "600", lineHeight: 29 },
  bidCount: { alignItems: "center", flexDirection: "row", gap: spacing.micro },
  bidCountText: { color: colors.text, ...typography.metadata },
  amountCard: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radii.detailCard,
    gap: spacing.compact,
    padding: spacing.page,
  },
  amountRow: { alignItems: "center", flexDirection: "row" },
  amountInput: { color: colors.text, flex: 1, fontSize: 32, fontWeight: "600", padding: 0 },
  currency: { color: colors.text, fontSize: 32, fontWeight: "600" },
  minimum: { color: colors.textSecondary, ...typography.metadata },
  message: { color: colors.textSecondary, ...typography.body },
  centered: { alignItems: "center", flex: 1, gap: spacing.compact, justifyContent: "center" },
});
