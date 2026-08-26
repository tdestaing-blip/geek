import { addCopy } from "@geek/data";
import {
  createMoney,
  parseCalendarDate,
  parseCurrencyCode,
  type CopyComponentPresence,
  type CurrencyCode,
  type EditionComponent,
} from "@geek/domain";
import { colors, spacing, typography } from "@geek/design-tokens";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  type ImageSourcePropType,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";

import COMPONENT_BOX from "../assets/game-detail/owned/component-box.png";
import COMPONENT_CARTRIDGE from "../assets/game-detail/owned/component-cartridge.png";
import COMPONENT_MANUAL from "../assets/game-detail/owned/component-manual.png";
import { copyConfirmedHaptic } from "../lib/haptics";
import {
  acquireCopyPhotos,
  chooseCopyPhotoSource,
  COPY_PHOTO_MAX_COUNT,
  type PendingCopyPhoto,
} from "../lib/copy-photo-media";
import { supabase } from "../lib/supabase";
import { AdaptiveGlassSurface } from "../ui/adaptive-glass-surface";
import { CopyComponentCard } from "../ui/copy-component-card";
import { CopyPhotoGallery } from "../ui/copy-photo-gallery";
import { GeekIcon } from "../ui/geek-icon";
import {
  loadAddCopyContext,
  persistCopyEnrichment,
  resolveAlbumReveal,
  type AddCopyContext,
} from "./add-copy-data";
import {
  createAddCopySubmissionCoordinator,
  parseEuroInput,
  type AddCopySubmissionResult,
} from "./add-copy-flow";
import { persistPendingCopyPhotos } from "./copy-photo-data";
import type { RootStackParamList } from "./types";

type Props = NativeStackScreenProps<RootStackParamList, "AddCopy">;
type LoadState =
  | { readonly status: "loading" }
  | { readonly status: "error" }
  | { readonly status: "ready"; readonly context: AddCopyContext };

const EUR = requireCurrencyCode("EUR");

export function AddCopyScreen(props: Props) {
  return (
    <SafeAreaProvider>
      <AddCopyContent {...props} />
    </SafeAreaProvider>
  );
}

function AddCopyContent({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [componentStates, setComponentStates] = useState<
    Readonly<Record<string, CopyComponentPresence | undefined>>
  >({});
  const [provenance, setProvenance] = useState("");
  const [acquiredAt, setAcquiredAt] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [isCompleted, setIsCompleted] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<"idle" | "pending" | "committed">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [pendingPhotos, setPendingPhotos] = useState<readonly PendingCopyPhoto[]>([]);
  const submissionInFlight = useRef(false);
  const coordinator = useRef<ReturnType<typeof createAddCopySubmissionCoordinator> | null>(null);

  useEffect(() => {
    let active = true;
    void loadAddCopyContext(route.params.gameId, route.params.editionId).then(
      (result) => {
        if (!active) return;
        setLoadState(
          result.outcome === "ok" ? { status: "ready", context: result.data } : { status: "error" },
        );
      },
      () => {
        if (active) setLoadState({ status: "error" });
      },
    );
    return () => {
      active = false;
    };
  }, [route.params.editionId, route.params.gameId]);

  async function confirm() {
    if (submitStatus !== "idle" || submissionInFlight.current) return;
    const date = acquiredAt.trim() ? parseCalendarDate(acquiredAt.trim()) : null;
    if (acquiredAt.trim() && !date) {
      setMessage("Saisissez une date valide au format AAAA-MM-JJ.");
      return;
    }
    const price = parseEuroInput(purchasePrice);
    if (!price.valid) {
      setMessage("Saisissez un prix valide en euros, avec au plus deux décimales.");
      return;
    }
    const money = price.amountMinor === null ? null : createMoney(price.amountMinor, EUR);
    if (price.amountMinor !== null && !money) {
      setMessage("Ce prix ne peut pas être enregistré.");
      return;
    }

    setMessage(null);
    submissionInFlight.current = true;
    setSubmitStatus("pending");
    coordinator.current = createAddCopySubmissionCoordinator({
      createCopy: async () => {
        const result = await addCopy(supabase, { editionId: route.params.editionId });
        return result.outcome === "ok"
          ? { outcome: "ok", copyId: result.data.id }
          : { outcome: "failed" };
      },
      enrichCopy: (copyId) =>
        persistCopyEnrichment(
          copyId,
          route.params.editionId,
          {
            acquiredAt: date,
            purchasePrice: money,
            provenance: provenance.trim() || null,
            isCompleted,
          },
          Object.entries(componentStates).flatMap(([editionComponentId, presence]) =>
            presence ? [{ editionComponentId, presence }] : [],
          ),
        ),
      persistPhotos: (copyId) => persistPendingCopyPhotos(copyId, pendingPhotos),
      resolveAlbums: () => resolveAlbumReveal(route.params.gameId, route.params.editionId),
    });
    const result = await coordinator.current.submit();
    await handleSubmissionResult(result);
  }

  async function handleSubmissionResult(result: AddCopySubmissionResult) {
    if (result.outcome === "ignored") return;
    if (result.outcome === "creation_failed") {
      coordinator.current = null;
      submissionInFlight.current = false;
      setSubmitStatus("idle");
      setMessage("Impossible d’ajouter ce jeu. Réessayez.");
      return;
    }

    setSubmitStatus("committed");
    void copyConfirmedHaptic();
    if (result.albumSelection.kind === "one") {
      navigation.replace("AlbumReveal", {
        albumId: result.albumSelection.target.album.id,
        copyId: result.copyId,
        gameId: route.params.gameId,
        editionId: route.params.editionId,
        entryId: result.albumSelection.target.entry.id,
        enrichmentWarning: result.enrichmentWarning,
        photoWarning: result.photoWarning,
      });
      return;
    }
    setMessage(
      result.photoWarning
        ? "Jeu ajouté, certaines photos n’ont pas pu être enregistrées."
        : result.enrichmentWarning
          ? "Jeu ajouté, certains détails n’ont pas pu être enregistrés."
          : "Jeu ajouté à votre collection.",
    );
  }

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <AddCopyToolbar
        disabled={submitStatus !== "idle" || loadState.status !== "ready"}
        onClose={navigation.goBack}
        onConfirm={() => loadState.status === "ready" && void confirm()}
        pending={submitStatus === "pending"}
      />
      {loadState.status === "loading" ? (
        <CenteredState label="Chargement de l’édition…" />
      ) : loadState.status === "error" ? (
        <CenteredState label="Cette édition ne peut pas être ajoutée pour le moment." />
      ) : submitStatus === "committed" ? (
        <View style={styles.completion}>
          <GeekIcon name="checkbox" size={32} />
          <Text style={styles.completionTitle}>Dans votre collection</Text>
          <Text style={styles.completionCopy}>{message}</Text>
          <Pressable onPress={navigation.goBack} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Terminer</Text>
          </Pressable>
        </View>
      ) : (
        <AddCopyForm
          acquiredAt={acquiredAt}
          componentStates={componentStates}
          context={loadState.context}
          isCompleted={isCompleted}
          message={message}
          pendingPhotos={pendingPhotos}
          onAddPhotos={() => void addPendingPhotos()}
          onAcquiredAtChange={setAcquiredAt}
          onComponentPress={(componentId) =>
            setComponentStates((current) => ({
              ...current,
              [componentId]: nextPresence(current[componentId]),
            }))
          }
          onCompletedChange={setIsCompleted}
          onPriceChange={setPurchasePrice}
          onProvenanceChange={setProvenance}
          onRemovePhoto={(photoId) =>
            setPendingPhotos((current) => current.filter((photo) => photo.id !== photoId))
          }
          provenance={provenance}
          purchasePrice={purchasePrice}
        />
      )}
    </View>
  );

  async function addPendingPhotos() {
    const remaining = COPY_PHOTO_MAX_COUNT - pendingPhotos.length;
    if (remaining <= 0) {
      setMessage("Vous pouvez ajouter jusqu’à 6 photos.");
      return;
    }
    const source = await chooseCopyPhotoSource();
    if (!source) return;
    try {
      const selected = await acquireCopyPhotos(source, remaining);
      setPendingPhotos((current) => [...current, ...selected].slice(0, COPY_PHOTO_MAX_COUNT));
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Impossible d’ajouter cette photo.");
    }
  }
}

function AddCopyToolbar({
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
        Ajouter à votre collection
      </Text>
      <Pressable
        accessibilityLabel="Confirmer"
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

function AddCopyForm({
  acquiredAt,
  componentStates,
  context,
  isCompleted,
  message,
  pendingPhotos,
  onAddPhotos,
  onAcquiredAtChange,
  onComponentPress,
  onCompletedChange,
  onPriceChange,
  onProvenanceChange,
  onRemovePhoto,
  provenance,
  purchasePrice,
}: {
  readonly acquiredAt: string;
  readonly componentStates: Readonly<Record<string, CopyComponentPresence | undefined>>;
  readonly context: AddCopyContext;
  readonly isCompleted: boolean;
  readonly message: string | null;
  readonly pendingPhotos: readonly PendingCopyPhoto[];
  readonly onAddPhotos: () => void;
  readonly onAcquiredAtChange: (value: string) => void;
  readonly onComponentPress: (componentId: string) => void;
  readonly onCompletedChange: (value: boolean) => void;
  readonly onPriceChange: (value: string) => void;
  readonly onProvenanceChange: (value: string) => void;
  readonly onRemovePhoto: (photoId: string) => void;
  readonly provenance: string;
  readonly purchasePrice: string;
}) {
  const { catalog, components, identifiers } = context;
  const { width } = useWindowDimensions();
  const regionAndLanguages = [
    catalog.edition.regionCode,
    catalog.edition.supportedLanguages.length
      ? catalog.edition.supportedLanguages.join(", ")
      : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" · ");
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <CopyPhotoGallery
        accessibilityLabel="Ajouter des photos de votre copie"
        canAdd={pendingPhotos.length < COPY_PHOTO_MAX_COUNT}
        fallbackArtwork={catalog.artworkUrl ? { uri: catalog.artworkUrl } : null}
        onAdd={onAddPhotos}
        onRemove={onRemovePhoto}
        photos={pendingPhotos.map((photo) => ({ id: photo.id, uri: photo.uri }))}
        removable
        size={Math.min(361, width - spacing.page * 2)}
      />
      {components.length ? (
        <ScrollView
          contentContainerStyle={styles.components}
          horizontal
          showsHorizontalScrollIndicator={false}
        >
          {components.map((component) => (
            <Pressable
              key={component.id}
              onPress={() => onComponentPress(component.id)}
              style={styles.componentCard}
            >
              <CopyComponentCard
                image={componentImage(component)}
                label={component.name}
                state={componentStates[component.id] ?? "unassessed"}
              />
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      <View style={styles.heading}>
        <Text style={styles.title}>{catalog.game.canonicalTitle}</Text>
        <Text style={styles.platform}>{catalog.platform.name}</Text>
      </View>
      <View style={styles.privateCard}>
        <View style={styles.storyField}>
          <Text style={styles.fieldLabel}>Votre histoire</Text>
          <TextInput
            maxLength={2000}
            multiline
            onChangeText={onProvenanceChange}
            placeholder="Ajouter une description..."
            placeholderTextColor={colors.textSecondary}
            style={styles.storyInput}
            value={provenance}
          />
        </View>
        <FormRow label="Date d’achat">
          <PurchaseDatePicker onChange={onAcquiredAtChange} value={acquiredAt} />
        </FormRow>
        <FormRow label="Prix d’achat">
          <View style={styles.priceInputWrap}>
            <TextInput
              keyboardType="decimal-pad"
              onChangeText={onPriceChange}
              placeholder="0"
              placeholderTextColor={colors.textSecondary}
              style={styles.priceInput}
              value={purchasePrice}
            />
            <Text style={styles.currency}>€</Text>
          </View>
        </FormRow>
        <FormRow label="Terminé ?">
          <View style={styles.switchControl}>
            <Switch onValueChange={onCompletedChange} value={isCompleted} />
          </View>
        </FormRow>
      </View>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      <View style={styles.editionSection}>
        <Text style={styles.sectionTitle}>Édition</Text>
        {catalog.edition.editionName ? (
          <Metadata label="Édition" value={catalog.edition.editionName} />
        ) : null}
        {regionAndLanguages ? (
          <Metadata label="Région / langue" value={regionAndLanguages} />
        ) : null}
        {catalog.edition.releaseDate ? (
          <Metadata label="Date de sortie" value={catalog.edition.releaseDate} />
        ) : null}
        {identifiers.map((identifier) => (
          <Metadata
            key={identifier.id}
            label={`Code ${identifier.scheme.toUpperCase()}`}
            value={identifier.value}
          />
        ))}
      </View>
    </ScrollView>
  );
}

function PurchaseDatePicker({
  onChange,
  value,
}: {
  readonly onChange: (value: string) => void;
  readonly value: string;
}) {
  const selectedDate = parseLocalDate(value) ?? new Date();

  function handleValueChange(_event: unknown, date: Date) {
    onChange(formatLocalDate(date));
  }

  function openAndroidPicker() {
    DateTimePickerAndroid.open({
      mode: "date",
      onValueChange: handleValueChange,
      value: selectedDate,
    });
  }

  if (Platform.OS === "ios") {
    return (
      <DateTimePicker
        accessibilityLabel="Choisir la date d’achat"
        display="compact"
        locale="fr-FR"
        mode="date"
        onValueChange={handleValueChange}
        style={styles.compactDatePicker}
        value={selectedDate}
      />
    );
  }

  return (
    <Pressable
      accessibilityLabel="Choisir la date d’achat"
      accessibilityRole="button"
      onPress={openAndroidPicker}
      style={styles.dateButton}
    >
      <Text style={[styles.dateButtonText, !value && styles.dateButtonPlaceholder]}>
        {value ? formatDisplayDate(selectedDate) : "Choisir"}
      </Text>
    </Pressable>
  );
}

function FormRow({ children, label }: { readonly children: ReactNode; readonly label: string }) {
  return (
    <View style={styles.formRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function Metadata({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <View style={styles.metadata}>
      <Text style={styles.metadataLabel}>{label}</Text>
      <Text style={styles.metadataValue}>{value}</Text>
    </View>
  );
}

function CenteredState({ label }: { readonly label: string }) {
  return (
    <View style={styles.centered}>
      <ActivityIndicator color={colors.text} />
      <Text style={styles.stateText}>{label}</Text>
    </View>
  );
}

function nextPresence(value: CopyComponentPresence | undefined): CopyComponentPresence | undefined {
  if (value === undefined) return "present";
  if (value === "present") return "missing";
  if (value === "missing") return "unknown";
  return undefined;
}

function parseLocalDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? date
    : null;
}

function formatLocalDate(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDisplayDate(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function requireCurrencyCode(value: string): CurrencyCode {
  const currency = parseCurrencyCode(value);
  if (!currency) throw new Error(`${value} must be a valid ISO 4217 currency`);
  return currency;
}

function componentImage(component: EditionComponent): ImageSourcePropType {
  const key = `${component.kind} ${component.name}`.toLocaleLowerCase();
  if (key.includes("manual") || key.includes("notice")) return COMPONENT_MANUAL;
  if (key.includes("box") || key.includes("case") || key.includes("boîte")) return COMPONENT_BOX;
  return COMPONENT_CARTRIDGE;
}

const styles = StyleSheet.create({
  page: { backgroundColor: colors.background, flex: 1 },
  toolbar: {
    alignItems: "center",
    flexDirection: "row",
    height: 60,
    justifyContent: "space-between",
    marginTop: spacing.compact,
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
  content: { gap: 24, paddingBottom: 40, paddingTop: spacing.compact },
  fill: { height: "100%", width: "100%" },
  components: { gap: spacing.compact, paddingHorizontal: spacing.page },
  componentCard: { width: 110 },
  heading: { gap: spacing.micro, paddingHorizontal: 24 },
  title: { ...typography.screenTitle, color: colors.text },
  platform: { ...typography.body, color: colors.text },
  privateCard: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: 16,
    marginHorizontal: 12,
    overflow: "hidden",
  },
  storyField: {
    borderBottomColor: colors.background,
    borderBottomWidth: 1,
    gap: spacing.micro,
    minHeight: 70,
    padding: 12,
  },
  fieldLabel: { ...typography.metadata, color: colors.textSecondary },
  storyInput: { ...typography.body, color: colors.text, minHeight: 28, padding: 0 },
  formRow: {
    alignItems: "center",
    borderBottomColor: colors.background,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 68,
    paddingHorizontal: 12,
  },
  dateButton: {
    alignItems: "center",
    backgroundColor: colors.text,
    borderRadius: 18,
    justifyContent: "center",
    minHeight: 36,
    minWidth: 122,
    paddingHorizontal: 12,
  },
  dateButtonText: {
    ...typography.body,
    color: colors.controlSelected,
    textAlign: "center",
  },
  dateButtonPlaceholder: { color: colors.controlSelected },
  compactDatePicker: { alignSelf: "center" },
  priceInputWrap: { alignItems: "center", flexDirection: "row", gap: spacing.micro },
  priceInput: {
    ...typography.body,
    color: colors.text,
    minWidth: 70,
    padding: 0,
    textAlign: "right",
  },
  currency: { ...typography.body, color: colors.text },
  switchControl: { alignSelf: "stretch", justifyContent: "center" },
  message: { ...typography.metadata, color: colors.accent, marginHorizontal: spacing.page },
  editionSection: { gap: spacing.page, paddingHorizontal: 24 },
  sectionTitle: { ...typography.sectionTitle, color: colors.text },
  metadata: { gap: spacing.micro },
  metadataLabel: { ...typography.metadata, color: colors.textSecondary },
  metadataValue: { ...typography.body, color: colors.text },
  centered: {
    alignItems: "center",
    flex: 1,
    gap: spacing.compact,
    justifyContent: "center",
    padding: 24,
  },
  stateText: { ...typography.body, color: colors.textSecondary, textAlign: "center" },
  completion: {
    alignItems: "center",
    flex: 1,
    gap: spacing.compact,
    justifyContent: "center",
    padding: 32,
  },
  completionTitle: { ...typography.sectionTitle, color: colors.text },
  completionCopy: { ...typography.body, color: colors.textSecondary, textAlign: "center" },
  primaryButton: {
    backgroundColor: colors.text,
    borderRadius: 999,
    marginTop: spacing.page,
    minWidth: 157,
    padding: 12,
  },
  primaryButtonText: { ...typography.body, color: colors.controlSelected, textAlign: "center" },
});
