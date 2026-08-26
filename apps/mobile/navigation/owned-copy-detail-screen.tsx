import type { CopyComponentAssessment, CopyPrivateDetails, Money } from "@geek/domain";
import { colors, radii, spacing, typography } from "@geek/design-tokens";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useState } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  type ImageSourcePropType,
  ScrollView,
  Platform,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";

import COMPONENT_BOX from "../assets/game-detail/owned/component-box.png";
import COMPONENT_CARTRIDGE from "../assets/game-detail/owned/component-cartridge.png";
import COMPONENT_MANUAL from "../assets/game-detail/owned/component-manual.png";
import { useAuth } from "../lib/auth/auth-provider";
import {
  acquireCopyPhotos,
  chooseCopyPhotoSource,
  COPY_PHOTO_MAX_COUNT,
} from "../lib/copy-photo-media";
import { AboutGameCard } from "../ui/about-game-card";
import { CopyComponentCard } from "../ui/copy-component-card";
import { CopyPhotoGallery } from "../ui/copy-photo-gallery";
import { DetailToolbar } from "../ui/detail-toolbar";
import { MetadataField } from "../ui/metadata-field";
import { StickyAvailabilityBar } from "../ui/sticky-availability-bar";
import { loadCanonicalCopyDetail, type CanonicalCopyDetail } from "./owned-copy-detail-data";
import {
  persistPendingCopyPhotos,
  removePersistedCopyPhoto,
  toGalleryItems,
} from "./copy-photo-data";
import type { RootStackParamList } from "./types";

type Props = NativeStackScreenProps<RootStackParamList, "Copy">;

type DetailState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
  | { readonly status: "ready"; readonly data: CanonicalCopyDetail };

export function OwnedCopyDetailScreen({ navigation, route }: Props) {
  return (
    <SafeAreaProvider>
      <OwnedCopyDetailContent navigation={navigation} route={route} />
    </SafeAreaProvider>
  );
}

function OwnedCopyDetailContent({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<DetailState>({ status: "loading" });
  const [currentPhotoId, setCurrentPhotoId] = useState<string | null>(null);
  const [photoMutationPending, setPhotoMutationPending] = useState(false);

  const loadDetail = useCallback(() => {
    let active = true;
    void loadCanonicalCopyDetail(route.params.copyId)
      .then((result) => {
        if (!active) return;
        if (result.outcome === "ok") {
          setCurrentPhotoId(result.data.photos[0]?.photo.id ?? null);
        }
        setState(
          result.outcome === "ok"
            ? { status: "ready", data: result.data }
            : {
                status: "error",
                message:
                  result.outcome === "not_found"
                    ? "Cette copie est introuvable."
                    : "Impossible de charger cette copie.",
              },
        );
      })
      .catch(() => {
        if (active) setState({ status: "error", message: "Impossible de charger cette copie." });
      });
    return () => {
      active = false;
    };
  }, [route.params.copyId]);

  useFocusEffect(loadDetail);

  const data = state.status === "ready" ? state.data : null;

  async function addPhotos() {
    if (!data || photoMutationPending) return;
    const remaining = COPY_PHOTO_MAX_COUNT - data.photos.length;
    if (remaining <= 0) {
      Alert.alert("Photos", "Vous pouvez ajouter jusqu’à 6 photos par copie.");
      return;
    }
    const source = await chooseCopyPhotoSource();
    if (!source) return;
    try {
      setPhotoMutationPending(true);
      const pending = await acquireCopyPhotos(source, remaining);
      if (pending.length === 0) return;
      const succeeded = await persistPendingCopyPhotos(route.params.copyId, pending);
      const refreshed = await loadCanonicalCopyDetail(route.params.copyId);
      if (refreshed.outcome === "ok") setState({ status: "ready", data: refreshed.data });
      if (!succeeded) Alert.alert("Photos", "Certaines photos n’ont pas pu être enregistrées.");
    } catch (error) {
      Alert.alert(
        "Photos",
        error instanceof Error ? error.message : "Impossible d’ajouter cette photo.",
      );
    } finally {
      setPhotoMutationPending(false);
    }
  }

  async function deleteCurrentPhoto() {
    if (!data || !currentPhotoId || photoMutationPending) return;
    setPhotoMutationPending(true);
    const succeeded = await removePersistedCopyPhoto(currentPhotoId);
    const refreshed = await loadCanonicalCopyDetail(route.params.copyId);
    if (refreshed.outcome === "ok") {
      setState({ status: "ready", data: refreshed.data });
      setCurrentPhotoId(refreshed.data.photos[0]?.photo.id ?? null);
    }
    setPhotoMutationPending(false);
    if (!succeeded) Alert.alert("Photos", "Cette photo n’a pas pu être supprimée.");
  }

  function showPhotoActions() {
    if (!data) return;
    const canAdd = data.photos.length < COPY_PHOTO_MAX_COUNT;
    const canDelete = data.photos.length > 0;
    const options = [
      ...(canAdd ? ["Ajouter des photos"] : []),
      ...(canDelete ? ["Supprimer la photo affichée"] : []),
      "Annuler",
    ];
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          cancelButtonIndex: options.length - 1,
          destructiveButtonIndex: canDelete ? options.length - 2 : undefined,
          options,
        },
        (index) => {
          if (canAdd && index === 0) void addPhotos();
          else if (canDelete && index === (canAdd ? 1 : 0)) confirmDelete();
        },
      );
      return;
    }
    Alert.alert("Photos de la copie", undefined, [
      ...(canAdd ? [{ text: "Ajouter des photos", onPress: () => void addPhotos() }] : []),
      ...(canDelete
        ? [
            {
              text: "Supprimer la photo affichée",
              style: "destructive" as const,
              onPress: confirmDelete,
            },
          ]
        : []),
      { text: "Annuler", style: "cancel" },
    ]);
  }

  function confirmDelete() {
    Alert.alert("Supprimer cette photo ?", "Cette action est définitive.", [
      { text: "Annuler", style: "cancel" },
      { text: "Supprimer", style: "destructive", onPress: () => void deleteCurrentPhoto() },
    ]);
  }

  return (
    <View style={[styles.safeArea, { paddingTop: insets.top }]}>
      <DetailToolbar
        leadingIcon="chevron-left"
        title={state.status === "ready" ? state.data.detail.game.canonicalTitle : "Copie"}
        onClose={() => navigation.goBack()}
        onMore={showPhotoActions}
      />
      {state.status === "loading" ? (
        <View style={styles.centeredState}>
          <ActivityIndicator color={colors.text} />
        </View>
      ) : state.status === "error" ? (
        <View style={styles.centeredState}>
          <Text style={styles.stateText}>{state.message}</Text>
        </View>
      ) : (
        <CanonicalCopyDetailView
          data={state.data}
          onAddPhotos={() => void addPhotos()}
          onCurrentPhotoChange={setCurrentPhotoId}
        />
      )}
    </View>
  );
}

function CanonicalCopyDetailView({
  data,
  onAddPhotos,
  onCurrentPhotoChange,
}: {
  readonly data: CanonicalCopyDetail;
  readonly onAddPhotos: () => void;
  readonly onCurrentPhotoChange: (photoId: string | null) => void;
}) {
  const { detail, catalogArtwork } = data;
  const { state: authState } = useAuth();
  const { width } = useWindowDimensions();
  const heroSize = width - spacing.page * 2;
  const ownerName =
    authState.status === "authenticated" && authState.user.id === detail.copy.ownerId
      ? (authState.profile.display_name ?? authState.profile.username ?? "Vous")
      : null;

  return (
    <>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        style={styles.scroll}
      >
        <CopyHero
          artwork={catalogArtwork}
          components={detail.components}
          heroSize={heroSize}
          onAddPhotos={onAddPhotos}
          onCurrentPhotoChange={onCurrentPhotoChange}
          photos={data.photos}
        />
        <View style={styles.heading}>
          <Text style={styles.gameTitle}>{detail.game.canonicalTitle}</Text>
          {detail.platform ? <Text style={styles.platform}>{detail.platform.name}</Text> : null}
        </View>
        {ownerName ? <OwnerCard name={ownerName} privateDetails={detail.privateDetails} /> : null}
        {detail.edition ? <EditionSection detail={detail} /> : null}
        {detail.privateDetails ? <PrivateDetailsSection details={detail.privateDetails} /> : null}
        {catalogArtwork && detail.game.description ? (
          <AboutGameCard
            description={detail.game.description}
            image={catalogArtwork}
            title={detail.game.canonicalTitle}
          />
        ) : null}
      </ScrollView>
      <StickyAvailabilityBar
        availability={detail.copy.availability}
        hasCopyPhoto={data.photos.length > 0}
      />
    </>
  );
}

function CopyHero({
  artwork,
  components,
  heroSize,
  onAddPhotos,
  onCurrentPhotoChange,
  photos,
}: {
  readonly artwork: ImageSourcePropType | null;
  readonly components: readonly CopyComponentAssessment[];
  readonly heroSize: number;
  readonly onAddPhotos: () => void;
  readonly onCurrentPhotoChange: (photoId: string | null) => void;
  readonly photos: CanonicalCopyDetail["photos"];
}) {
  return (
    <View style={styles.heroGroup}>
      <CopyPhotoGallery
        accessibilityLabel="Ajouter des photos de votre copie"
        canAdd={photos.length < COPY_PHOTO_MAX_COUNT}
        fallbackArtwork={artwork}
        onAdd={onAddPhotos}
        onCurrentChange={onCurrentPhotoChange}
        photos={toGalleryItems(photos)}
        size={heroSize}
      />
      {components.length > 0 ? (
        <ScrollView
          contentContainerStyle={styles.componentRow}
          horizontal
          showsHorizontalScrollIndicator={false}
        >
          {components.map((assessment) => (
            <View key={assessment.component.id} style={styles.componentCard}>
              <CopyComponentCard
                conditionLabel={conditionLabel(assessment)}
                image={componentImage(assessment.component.kind)}
                label={assessment.component.name}
                state={componentState(assessment)}
              />
            </View>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

function OwnerCard({
  name,
  privateDetails,
}: {
  readonly name: string;
  readonly privateDetails: CopyPrivateDetails | null;
}) {
  const description = privateDetails?.provenance ?? privateDetails?.privateNotes;
  return (
    <View style={styles.ownerShell}>
      <Text style={styles.body}>À {name}</Text>
      <Text style={styles.description}>{description ?? "Ajouter une description..."}</Text>
    </View>
  );
}

function EditionSection({ detail }: { readonly detail: CanonicalCopyDetail["detail"] }) {
  const edition = detail.edition;
  if (!edition) return null;

  const regionAndLanguages = [
    edition.regionCode,
    edition.supportedLanguages.length > 0 ? edition.supportedLanguages.join(", ") : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" · ");

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Édition</Text>
      {edition.editionName ? <MetadataField label="Édition" value={edition.editionName} /> : null}
      {regionAndLanguages ? (
        <MetadataField label="Région / langue" value={regionAndLanguages} />
      ) : null}
      {edition.releaseDate ? (
        <MetadataField label="Date de sortie" value={edition.releaseDate} />
      ) : null}
      {edition.publisherName ? (
        <MetadataField label="Éditeur" value={edition.publisherName} />
      ) : null}
      {edition.packagingType ? (
        <MetadataField label="Conditionnement" value={edition.packagingType} />
      ) : null}
    </View>
  );
}

function PrivateDetailsSection({ details }: { readonly details: CopyPrivateDetails }) {
  const fields = [
    details.acquiredAt ? { label: "Date d’acquisition", value: details.acquiredAt } : null,
    details.purchasePrice
      ? { label: "Prix d’achat", value: formatMoney(details.purchasePrice) }
      : null,
    details.storageLocation ? { label: "Emplacement", value: details.storageLocation } : null,
    details.provenance ? { label: "Provenance", value: details.provenance } : null,
    details.isCompleted ? { label: "Terminé", value: "Oui" } : null,
    details.privateNotes ? { label: "Notes privées", value: details.privateNotes } : null,
  ].filter((field): field is { readonly label: string; readonly value: string } => field !== null);

  if (fields.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Mes informations</Text>
      {fields.map((field) => (
        <MetadataField key={field.label} {...field} />
      ))}
    </View>
  );
}

function componentState(
  assessment: CopyComponentAssessment,
): "missing" | "present" | "unassessed" | "unknown" {
  if (!assessment.state) return "unassessed";
  return assessment.state.presence;
}

function conditionLabel(assessment: CopyComponentAssessment): string | undefined {
  const grade = assessment.state?.conditionGrade;
  return grade ? `État ${grade}/5` : undefined;
}

function componentImage(kind: string): ImageSourcePropType {
  const normalized = kind.toLocaleLowerCase();
  if (normalized.includes("manual")) return COMPONENT_MANUAL;
  if (normalized.includes("box") || normalized.includes("case")) return COMPONENT_BOX;
  return COMPONENT_CARTRIDGE;
}

function formatMoney(money: Money): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: money.currency,
  }).format(money.amountMinor / 100);
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  scroll: { flex: 1 },
  content: { gap: 24, paddingBottom: 150 },
  centeredState: { alignItems: "center", flex: 1, justifyContent: "center", padding: 24 },
  stateText: { color: colors.textSecondary, textAlign: "center", ...typography.body },
  heroGroup: { gap: spacing.page, paddingHorizontal: spacing.page },
  fill: { height: "100%", width: "100%" },
  componentRow: { gap: spacing.compact },
  componentCard: { width: 112 },
  heading: { gap: spacing.micro, paddingHorizontal: 24 },
  gameTitle: { color: colors.text, ...typography.screenTitle },
  platform: { color: colors.text, ...typography.body },
  ownerShell: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radii.detailCard,
    gap: spacing.page,
    marginHorizontal: 12,
    padding: 12,
  },
  body: { color: colors.text, ...typography.body },
  description: { color: colors.textSecondary, ...typography.body },
  section: { gap: spacing.page, paddingHorizontal: 24 },
  sectionTitle: { color: colors.text, ...typography.sectionTitle },
});
